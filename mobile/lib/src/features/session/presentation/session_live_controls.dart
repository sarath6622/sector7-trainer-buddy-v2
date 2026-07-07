import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/feedback/haptics.dart';
import '../../../core/theme/app_theme.dart';
import '../data/rest_timer_controller.dart';
import '../data/session_pause_controller.dart';
import '../domain/rest_timer_state.dart';

// Rest-timer semantics borrow a utility colour language (info = running,
// success = done, amber = paused) rather than the app's orange brand accent, so
// the floor controls read as utility timers, not brand chrome. Running/done are
// the design-system info/success colours, resolved theme-aware via AppColors at
// the call sites below.
const _kPaused = Color(0xFFF59E0B); // amber-500 — paused

const _kRestPresets = <(String, int)>[
  ('1 min', 60),
  ('2 min', 120),
  ('3 min', 180),
  ('5 min', 300),
];

/// The real-time session-floor controls shown on an IN_PROGRESS session:
/// a pause/resume toggle and a rest timer, both synced across devices over the
/// `session-{id}` Pusher channel.
class SessionLiveControls extends StatelessWidget {
  const SessionLiveControls({super.key, required this.sessionId});
  final String sessionId;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SessionPauseButton(sessionId: sessionId),
        const SizedBox(height: 8),
        RestTimerControl(sessionId: sessionId),
      ],
    );
  }
}

/// Pause ↔ resume toggle. While paused it ticks once a second to advance the
/// "paused MM:SS" counter (the underlying accumulator is static otherwise).
class SessionPauseButton extends ConsumerStatefulWidget {
  const SessionPauseButton({super.key, required this.sessionId});
  final String sessionId;

  @override
  ConsumerState<SessionPauseButton> createState() => _SessionPauseButtonState();
}

class _SessionPauseButtonState extends ConsumerState<SessionPauseButton> {
  Timer? _ticker;

  @override
  void initState() {
    super.initState();
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final snap = ref.watch(sessionPauseControllerProvider(widget.sessionId));
    final now = DateTime.now().millisecondsSinceEpoch;
    final paused = snap.pause.isPaused;
    final pausedFor = snap.pause.totalPausedSec(now, snap.skewMs);

    final controller =
        ref.read(sessionPauseControllerProvider(widget.sessionId).notifier);
    final scheme = Theme.of(context).colorScheme;

    if (paused) {
      return FilledButton.tonalIcon(
        onPressed: controller.toggle,
        icon: const Icon(Icons.play_arrow_rounded),
        label: Text('Resume  ·  paused ${formatMmSs(pausedFor)}'),
        style: FilledButton.styleFrom(
          minimumSize: const Size.fromHeight(46),
          backgroundColor: _kPaused.withValues(alpha: 0.16),
          foregroundColor: _kPaused,
        ),
      );
    }
    // Idle pause control is neutral utility chrome, not the orange brand accent
    // (which an unstyled OutlinedButton would inherit from colorScheme.primary).
    return OutlinedButton.icon(
      onPressed: controller.toggle,
      icon: const Icon(Icons.pause_rounded),
      label: const Text('Pause session'),
      style: OutlinedButton.styleFrom(
        minimumSize: const Size.fromHeight(46),
        foregroundColor: scheme.onSurfaceVariant,
        side: BorderSide(color: scheme.outlineVariant),
      ),
    );
  }
}

/// Compact rest-timer control: a "Rest timer" button when idle, an inline
/// countdown pill (with stop) when active, and a "Rest done!" chip when the
/// countdown expires. Tapping any state opens [RestTimerSheet]. Owns the
/// once-per-rest done buzz (haptic) when the countdown crosses >0 → 0.
class RestTimerControl extends ConsumerStatefulWidget {
  const RestTimerControl({super.key, required this.sessionId});
  final String sessionId;

  @override
  ConsumerState<RestTimerControl> createState() => _RestTimerControlState();
}

class _RestTimerControlState extends ConsumerState<RestTimerControl> {
  Timer? _ticker;
  int? _prevRemaining; // null on mount ⇒ don't buzz onto an already-expired timer

  @override
  void initState() {
    super.initState();
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) => _tick());
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  void _tick() {
    if (!mounted) return;
    final snap = ref.read(restTimerControllerProvider(widget.sessionId));
    final now = DateTime.now().millisecondsSinceEpoch;
    final r = snap.timer.remaining(now, snap.skewMs);
    if (_prevRemaining != null &&
        _prevRemaining! > 0 &&
        r == 0 &&
        snap.timer.total != null) {
      Haptics.success();
    }
    _prevRemaining = r;
    setState(() {});
  }

  void _openSheet() {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => RestTimerSheet(sessionId: widget.sessionId),
    );
  }

  @override
  Widget build(BuildContext context) {
    final snap = ref.watch(restTimerControllerProvider(widget.sessionId));
    final now = DateTime.now().millisecondsSinceEpoch;
    final remaining = snap.timer.remaining(now, snap.skewMs);
    final isDone = snap.timer.isDone(now, snap.skewMs);
    final isPaused = snap.timer.isPaused;

    final controller =
        ref.read(restTimerControllerProvider(widget.sessionId).notifier);

    // Idle — no timer set. Neutral utility chrome, matching the pause control
    // (an unstyled OutlinedButton would inherit the orange brand accent).
    if (remaining == null && !isDone) {
      final scheme = Theme.of(context).colorScheme;
      return OutlinedButton.icon(
        onPressed: _openSheet,
        icon: const Icon(Icons.hotel_outlined),
        label: const Text('Rest timer'),
        style: OutlinedButton.styleFrom(
          minimumSize: const Size.fromHeight(46),
          foregroundColor: scheme.onSurfaceVariant,
          side: BorderSide(color: scheme.outlineVariant),
        ),
      );
    }

    final colors = AppColors.of(context);
    final accent = isDone ? colors.success : colors.info;
    return Material(
      color: accent.withValues(alpha: 0.12),
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: _openSheet,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: accent.withValues(alpha: 0.4)),
          ),
          child: Row(
            children: [
              Icon(Icons.hotel_rounded, size: 18, color: accent),
              const SizedBox(width: 10),
              if (isDone)
                Expanded(
                  child: Text(
                    'Rest done!',
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(
                          color: accent,
                          fontWeight: FontWeight.w700,
                        ),
                  ),
                )
              else
                Expanded(
                  child: Row(
                    children: [
                      Text(
                        formatMmSs(remaining!),
                        style: Theme.of(context).textTheme.titleMedium?.copyWith(
                              color: accent,
                              fontWeight: FontWeight.w800,
                              fontFeatures: const [
                                FontFeature.tabularFigures()
                              ],
                            ),
                      ),
                      if (isPaused) ...[
                        const SizedBox(width: 8),
                        Text(
                          'paused',
                          style: Theme.of(context)
                              .textTheme
                              .labelSmall
                              ?.copyWith(
                                color: Theme.of(context)
                                    .colorScheme
                                    .onSurfaceVariant,
                              ),
                        ),
                      ],
                    ],
                  ),
                ),
              Text(
                'Open',
                style: Theme.of(context).textTheme.labelMedium?.copyWith(
                      color: accent,
                      fontWeight: FontWeight.w600,
                    ),
              ),
              const SizedBox(width: 6),
              IconButton(
                visualDensity: VisualDensity.compact,
                onPressed: controller.stop,
                icon: Icon(
                  Icons.close_rounded,
                  size: 18,
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
                tooltip: 'Stop rest timer',
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Shared rest-timer bottom sheet — circular countdown, pause/resume/stop, quick
/// presets and a custom-seconds field. Identical for trainer and client.
class RestTimerSheet extends ConsumerStatefulWidget {
  const RestTimerSheet({super.key, required this.sessionId});
  final String sessionId;

  @override
  ConsumerState<RestTimerSheet> createState() => _RestTimerSheetState();
}

class _RestTimerSheetState extends ConsumerState<RestTimerSheet> {
  Timer? _ticker;
  final _customController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _ticker?.cancel();
    _customController.dispose();
    super.dispose();
  }

  RestTimerController get _controller =>
      ref.read(restTimerControllerProvider(widget.sessionId).notifier);

  void _startCustom() {
    final s = int.tryParse(_customController.text.trim());
    if (s != null && s > 0) {
      _customController.clear();
      _controller.start(s);
      FocusScope.of(context).unfocus();
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final colors = AppColors.of(context);
    final snap = ref.watch(restTimerControllerProvider(widget.sessionId));
    final now = DateTime.now().millisecondsSinceEpoch;
    final timer = snap.timer;
    final remaining = timer.remaining(now, snap.skewMs);
    final isDone = timer.isDone(now, snap.skewMs);
    final isPaused = timer.isPaused;
    final isRunning = timer.isRunning(now, snap.skewMs);
    final progress = timer.progress(now, snap.skewMs);
    final accent = isDone ? colors.success : colors.info;

    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
      ),
      child: Container(
        decoration: BoxDecoration(
          color: scheme.surface,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
          border: Border(top: BorderSide(color: scheme.outlineVariant)),
        ),
        child: SafeArea(
          top: false,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(height: 10),
              Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: scheme.onSurfaceVariant.withValues(alpha: 0.3),
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 14, 12, 8),
                child: Row(
                  children: [
                    Icon(Icons.hotel_rounded, size: 18, color: colors.info),
                    const SizedBox(width: 8),
                    Text(
                      'Rest timer',
                      style: Theme.of(context)
                          .textTheme
                          .titleMedium
                          ?.copyWith(fontWeight: FontWeight.w700),
                    ),
                    const Spacer(),
                    IconButton(
                      onPressed: () => Navigator.of(context).pop(),
                      icon: const Icon(Icons.close_rounded),
                    ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
                child: Column(
                  children: [
                    SizedBox(
                      width: 140,
                      height: 140,
                      child: Stack(
                        alignment: Alignment.center,
                        children: [
                          SizedBox.expand(
                            child: CircularProgressIndicator(
                              value: progress,
                              strokeWidth: 8,
                              strokeCap: StrokeCap.round,
                              backgroundColor:
                                  scheme.onSurface.withValues(alpha: 0.08),
                              valueColor: AlwaysStoppedAnimation(accent),
                            ),
                          ),
                          if (isDone)
                            Text(
                              'Done!',
                              style: Theme.of(context)
                                  .textTheme
                                  .titleLarge
                                  ?.copyWith(
                                    color: accent,
                                    fontWeight: FontWeight.w800,
                                  ),
                            )
                          else if (remaining != null)
                            Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(
                                  formatMmSs(remaining),
                                  style: Theme.of(context)
                                      .textTheme
                                      .headlineMedium
                                      ?.copyWith(
                                        fontWeight: FontWeight.w800,
                                        fontFeatures: const [
                                          FontFeature.tabularFigures()
                                        ],
                                      ),
                                ),
                                Text(
                                  isPaused ? 'paused' : 'remaining',
                                  style: Theme.of(context)
                                      .textTheme
                                      .labelSmall
                                      ?.copyWith(color: scheme.onSurfaceVariant),
                                ),
                              ],
                            )
                          else
                            Text(
                              'pick a time',
                              style: Theme.of(context)
                                  .textTheme
                                  .bodySmall
                                  ?.copyWith(color: scheme.onSurfaceVariant),
                            ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),
                    if ((isRunning || isPaused) && !isDone)
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          OutlinedButton.icon(
                            onPressed:
                                isPaused ? _controller.resume : _controller.pause,
                            icon: Icon(
                              isPaused
                                  ? Icons.play_arrow_rounded
                                  : Icons.pause_rounded,
                            ),
                            label: Text(isPaused ? 'Resume' : 'Pause'),
                          ),
                          const SizedBox(width: 12),
                          OutlinedButton.icon(
                            onPressed: _controller.stop,
                            icon: const Icon(Icons.close_rounded),
                            label: const Text('Stop'),
                            style: OutlinedButton.styleFrom(
                              foregroundColor: scheme.error,
                            ),
                          ),
                        ],
                      ),
                    if (isDone)
                      OutlinedButton.icon(
                        onPressed: _controller.stop,
                        icon: const Icon(Icons.refresh_rounded),
                        label: const Text('Reset'),
                        style:
                            OutlinedButton.styleFrom(foregroundColor: colors.success),
                      ),
                    const SizedBox(height: 20),
                    Align(
                      alignment: Alignment.centerLeft,
                      child: Text(
                        'QUICK SELECT',
                        style: Theme.of(context).textTheme.labelSmall?.copyWith(
                              color: scheme.onSurfaceVariant,
                              fontWeight: FontWeight.w700,
                              letterSpacing: 0.8,
                            ),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        for (final p in _kRestPresets) ...[
                          Expanded(
                            child: _PresetButton(
                              label: p.$1,
                              selected: timer.total == p.$2 &&
                                  (isRunning || isPaused),
                              onTap: () {
                                _customController.clear();
                                _controller.start(p.$2);
                              },
                            ),
                          ),
                          if (p != _kRestPresets.last) const SizedBox(width: 8),
                        ],
                      ],
                    ),
                    const SizedBox(height: 16),
                    Align(
                      alignment: Alignment.centerLeft,
                      child: Text(
                        'CUSTOM (SECONDS)',
                        style: Theme.of(context).textTheme.labelSmall?.copyWith(
                              color: scheme.onSurfaceVariant,
                              fontWeight: FontWeight.w700,
                              letterSpacing: 0.8,
                            ),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Expanded(
                          child: TextField(
                            controller: _customController,
                            keyboardType: TextInputType.number,
                            decoration: const InputDecoration(
                              hintText: 'e.g. 90',
                              isDense: true,
                            ),
                            onSubmitted: (_) => _startCustom(),
                          ),
                        ),
                        const SizedBox(width: 8),
                        FilledButton(
                          onPressed: _startCustom,
                          child: const Text('Start'),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _PresetButton extends StatelessWidget {
  const _PresetButton({
    required this.label,
    required this.selected,
    required this.onTap,
  });
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Material(
      color: selected
          ? AppColors.of(context).info
          : scheme.surfaceContainerHighest,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          height: 46,
          alignment: Alignment.center,
          child: Text(
            label,
            style: Theme.of(context).textTheme.labelLarge?.copyWith(
                  fontWeight: FontWeight.w700,
                  color: selected ? Colors.white : scheme.onSurfaceVariant,
                ),
          ),
        ),
      ),
    );
  }
}
