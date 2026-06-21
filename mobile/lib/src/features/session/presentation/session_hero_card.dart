import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/rest_timer_controller.dart';
import '../data/session_pause_controller.dart';
import '../domain/rest_timer_state.dart';
import 'session_live_controls.dart' show RestTimerSheet;

// Status colours — semantic (rest/idle/pause language), not the orange brand
// accent. Same vocabulary as session_live_controls.dart + the web SessionHero.
const _kRunning = Color(0xFF3B82F6); // blue-500  — resting
const _kDone = Color(0xFF22C55E); // green-500 — rest done (fresh) / live
const _kPaused = Color(0xFFF59E0B); // amber-500 — paused / warn
const _kUrgent = Color(0xFFFB7185); // rose-400  — overtime / urgent

/// Compact live-session header — the mobile analogue of the web `SessionHero`.
/// Replaces the old LIVE pill + stacked Pause/Rest buttons with one dense card:
/// an avatar story-ring (elapsed / expected), the person's name, the elapsed
/// timer, and a single status pill that escalates through resting → rest-done →
/// paused → idle → live. Tapping the card opens the rest-timer sheet (the only
/// rest entry point on mobile); the trailing button toggles session pause.
///
/// Neutral dark card by design — the timer and status pill carry the only
/// colour, so it sits quietly inside the session-detail card.
class SessionHeroCard extends ConsumerStatefulWidget {
  const SessionHeroCard({
    super.key,
    required this.sessionId,
    required this.name,
    required this.startedAt,
    required this.expectedDurationMin,
    this.lastActivityMs,
    this.onEnd,
    this.ending = false,
  });

  /// Display name: trainer name on the client screen, client name on the
  /// trainer screen.
  final String name;
  final String sessionId;
  final DateTime startedAt;
  final int expectedDurationMin;

  /// Most-recent activity timestamp (ms) for the idle pill. Null suppresses the
  /// idle counter (shows "Live" instead).
  final int? lastActivityMs;

  /// When set, renders an End (stop) button next to Pause — trainer-only by
  /// design (lifecycle stays trainer-owned). Clients pass null.
  final VoidCallback? onEnd;

  /// True while the End action is in flight — swaps the End button for a spinner.
  final bool ending;

  @override
  ConsumerState<SessionHeroCard> createState() => _SessionHeroCardState();
}

class _SessionHeroCardState extends ConsumerState<SessionHeroCard> {
  Timer? _ticker;

  @override
  void initState() {
    super.initState();
    // Tick locally 1Hz so the elapsed timer + status counters advance even when
    // Pusher is quiet (the controllers only push on real events).
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  void _openRest() {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => RestTimerSheet(sessionId: widget.sessionId),
    );
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final nowMs = DateTime.now().millisecondsSinceEpoch;

    final pauseSnap = ref.watch(sessionPauseControllerProvider(widget.sessionId));
    final restSnap = ref.watch(restTimerControllerProvider(widget.sessionId));
    final pause = pauseSnap.pause;
    final timer = restSnap.timer;
    final isPaused = pause.isPaused;

    // Elapsed since start, minus paused time (freezes while paused) — mirrors
    // the web hero's elapsed math.
    final rawElapsedSec =
        (nowMs - widget.startedAt.millisecondsSinceEpoch) ~/ 1000;
    final pausedSec = pause.totalPausedSec(nowMs, pauseSnap.skewMs);
    final elapsedSec = (rawElapsedSec - pausedSec).clamp(0, 1 << 40).toInt();
    final expectedSec = widget.expectedDurationMin * 60;
    final progress =
        expectedSec > 0 ? (elapsedSec / expectedSec).clamp(0.0, 1.0) : 0.0;
    final overtime = expectedSec > 0 && elapsedSec >= expectedSec;

    final ringColor =
        isPaused ? _kPaused : (overtime ? _kUrgent : scheme.primary);
    final timerColor =
        isPaused ? _kPaused : (overtime ? _kUrgent : scheme.onSurface);
    final status = _statusFor(nowMs, restSnap.skewMs, timer, isPaused);

    return Material(
      color: scheme.surfaceContainerHighest,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: _openRest,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          padding: const EdgeInsets.fromLTRB(12, 11, 10, 11),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: scheme.outlineVariant.withValues(alpha: 0.6),
            ),
          ),
          child: Row(
            children: [
              _Avatar(
                initials: _initialsOf(widget.name),
                progress: progress,
                ringColor: ringColor,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            widget.name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: Theme.of(context)
                                .textTheme
                                .titleSmall
                                ?.copyWith(fontWeight: FontWeight.w700),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text(
                          'SESSION',
                          style: Theme.of(context)
                              .textTheme
                              .labelSmall
                              ?.copyWith(
                                color: scheme.onSurfaceVariant,
                                fontWeight: FontWeight.w700,
                                letterSpacing: 0.8,
                                fontSize: 9,
                              ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(
                      _fmtElapsed(elapsedSec),
                      style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                            color: timerColor,
                            fontWeight: FontWeight.w800,
                            height: 1,
                            fontFeatures: const [FontFeature.tabularFigures()],
                          ),
                    ),
                    const SizedBox(height: 5),
                    _StatusPill(label: status.label, color: status.color),
                  ],
                ),
              ),
              const SizedBox(width: 10),
              // Action cluster — Pause first, End on the destructive trailing
              // edge (PWA SessionHero order). End is trainer-only via [onEnd].
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  _CircleButton(
                    icon: isPaused
                        ? Icons.play_arrow_rounded
                        : Icons.pause_rounded,
                    color: isPaused ? _kPaused : scheme.onSurfaceVariant,
                    background: isPaused
                        ? _kPaused.withValues(alpha: 0.16)
                        : scheme.surface,
                    tooltip: isPaused ? 'Resume session' : 'Pause session',
                    onTap: ref
                        .read(sessionPauseControllerProvider(widget.sessionId)
                            .notifier)
                        .toggle,
                  ),
                  if (widget.onEnd != null) ...[
                    const SizedBox(width: 8),
                    if (widget.ending)
                      const SizedBox(
                        width: 42,
                        height: 42,
                        child: Center(
                          child: SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          ),
                        ),
                      )
                    else
                      _CircleButton(
                        icon: Icons.stop_rounded,
                        color: _kUrgent,
                        background: _kUrgent.withValues(alpha: 0.16),
                        tooltip: 'End session',
                        onTap: widget.onEnd!,
                      ),
                  ],
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// Status-pill escalation, in priority order — ports the web SessionHero:
  /// session-paused → rest-done (fresh/warn/urgent) → resting → rest-paused →
  /// idle (warn/urgent) → live.
  _HeroStatus _statusFor(
    int nowMs,
    int skewMs,
    RestTimerState timer,
    bool isPaused,
  ) {
    if (isPaused) return const _HeroStatus('Session paused', _kPaused);

    if (timer.isDone(nowMs, skewMs)) {
      final doneSec = timer.endTime != null
          ? (((nowMs + skewMs) - timer.endTime!) ~/ 1000).clamp(0, 1 << 40).toInt()
          : 0;
      if (doneSec >= 300) {
        return _HeroStatus('Rest done · ${_fmtIdle(doneSec)}', _kUrgent);
      }
      if (doneSec >= 120) {
        return _HeroStatus('Rest done · ${_fmtIdle(doneSec)}', _kPaused);
      }
      return const _HeroStatus('Rest done!', _kDone);
    }
    if (timer.isRunning(nowMs, skewMs)) {
      return _HeroStatus(
        'Resting · ${formatMmSs(timer.remaining(nowMs, skewMs)!)}',
        _kRunning,
      );
    }
    if (timer.isPaused) {
      return _HeroStatus(
        'Rest paused · ${formatMmSs(timer.remaining(nowMs, skewMs)!)}',
        _kPaused,
      );
    }

    final lastMs = widget.lastActivityMs;
    if (lastMs != null) {
      final idleSec = ((nowMs - lastMs) ~/ 1000).clamp(0, 1 << 40).toInt();
      if (idleSec >= 1200) return _HeroStatus('${_fmtIdle(idleSec)} idle', _kUrgent);
      if (idleSec >= 480) return _HeroStatus('${_fmtIdle(idleSec)} idle', _kPaused);
      if (idleSec >= 60) return _HeroStatus('${_fmtIdle(idleSec)} idle', _kDone);
    }
    return const _HeroStatus('Live', _kDone);
  }
}

class _HeroStatus {
  const _HeroStatus(this.label, this.color);
  final String label;
  final Color color;
}

class _Avatar extends StatelessWidget {
  const _Avatar({
    required this.initials,
    required this.progress,
    required this.ringColor,
  });

  final String initials;
  final double progress;
  final Color ringColor;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return SizedBox(
      width: 46,
      height: 46,
      child: Stack(
        alignment: Alignment.center,
        children: [
          SizedBox.expand(
            child: CircularProgressIndicator(
              value: progress,
              strokeWidth: 2.5,
              strokeCap: StrokeCap.round,
              backgroundColor: scheme.onSurface.withValues(alpha: 0.12),
              valueColor: AlwaysStoppedAnimation(ringColor),
            ),
          ),
          Container(
            width: 34,
            height: 34,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: scheme.surface,
            ),
            child: Text(
              initials,
              style: Theme.of(context).textTheme.labelMedium?.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
            ),
          ),
        ],
      ),
    );
  }
}

class _StatusPill extends StatelessWidget {
  const _StatusPill({required this.label, required this.color});
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 7,
          height: 7,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
        const SizedBox(width: 6),
        Flexible(
          child: Text(
            label.toUpperCase(),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(context).textTheme.labelSmall?.copyWith(
                  color: color,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.5,
                  fontSize: 10,
                ),
          ),
        ),
      ],
    );
  }
}

class _CircleButton extends StatelessWidget {
  const _CircleButton({
    required this.icon,
    required this.color,
    required this.background,
    required this.tooltip,
    required this.onTap,
  });

  final IconData icon;
  final Color color;
  final Color background;
  final String tooltip;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: Material(
        color: background,
        shape: const CircleBorder(),
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: onTap,
          child: SizedBox(
            width: 42,
            height: 42,
            child: Icon(icon, size: 20, color: color),
          ),
        ),
      ),
    );
  }
}

String _fmtElapsed(int totalSec) {
  final s = totalSec < 0 ? 0 : totalSec;
  String two(int n) => n.toString().padLeft(2, '0');
  final h = s ~/ 3600;
  final m = (s % 3600) ~/ 60;
  final sec = s % 60;
  return h > 0 ? '$h:${two(m)}:${two(sec)}' : '${two(m)}:${two(sec)}';
}

String _fmtIdle(int totalSec) {
  final s = totalSec < 0 ? 0 : totalSec;
  if (s < 60) return '${s}s';
  final m = s ~/ 60;
  if (m < 60) return '${m}m';
  final h = m ~/ 60;
  final rem = m % 60;
  return rem == 0 ? '${h}h' : '${h}h${rem}m';
}

String _initialsOf(String name) {
  final parts =
      name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
  if (parts.isEmpty) return '?';
  if (parts.length == 1) return parts.first.substring(0, 1).toUpperCase();
  return (parts.first.substring(0, 1) + parts.last.substring(0, 1))
      .toUpperCase();
}
