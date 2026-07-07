import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_theme.dart';
import '../data/rest_timer_controller.dart';
import '../data/session_pause_controller.dart';
import '../domain/session_mood.dart';
import 'session_live_controls.dart' show RestTimerSheet;

// Status colours — semantic (rest/idle/pause language), not the orange brand
// accent. Same vocabulary as session_live_controls.dart + the web SessionHero.
// "on track / live" maps to the design-system success colour (theme-aware,
// resolved via AppColors at the call sites below).
const _kPaused = Color(0xFFF59E0B); // amber-500 — paused / warn
const _kUrgent = Color(0xFFFB7185); // rose-400  — idle / needs attention

// Card corner rounding — matches the theme's large card radius (_radiusLg) so the
// live hero reads as the same family of cards as the workout panels below it.
const _kHeroRadius = BorderRadius.all(Radius.circular(14));

/// Live-session header — the mobile analogue of the web `SessionHero`, restyled
/// as a "now playing" card: an avatar story-ring (elapsed / expected) with a
/// live presence dot, the person's name, the elapsed timer, a status line, and
/// labeled Pause / End actions.
///
/// The whole card carries a single **mood** colour that the trainer can read at
/// a glance — a soft glowing border, the ring, the status pill, and (when it
/// matters) the timer all share it:
///   • **green** when everything is on track (live, resting, just finished rest),
///   • **rose** when the client is idle and needs attention (rest overdue, or no
///     set logged for a while),
///   • **amber** while the session is paused.
///
/// Tapping the card body opens the rest-timer sheet (the only rest entry point
/// on mobile); the End button is trainer-only ([onEnd] non-null).
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

  /// Most-recent activity timestamp (ms) for the idle detection. Null suppresses
  /// the idle escalation (the card stays on-track / green).
  final int? lastActivityMs;

  /// When set, renders an End (stop) button next to Pause — trainer-only by
  /// design (lifecycle stays trainer-owned). Clients pass null.
  final VoidCallback? onEnd;

  /// True while the End action is in flight — swaps the End icon for a spinner.
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

    final mood = resolveSessionMood(
      nowMs: nowMs,
      skewMs: restSnap.skewMs,
      timer: timer,
      isPaused: isPaused,
      lastActivityMs: widget.lastActivityMs,
    );
    final accent = _accentFor(mood.kind, AppColors.of(context).success);
    // The timer only takes a colour when it's saying something — rose when the
    // client needs attention, amber while paused, otherwise calm white.
    final timerColor =
        mood.attention ? _kUrgent : (isPaused ? _kPaused : scheme.onSurface);
    // A little stronger when it needs the eye (idle / paused), softer on track.
    final live = mood.attention || isPaused;

    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: _kHeroRadius,
        boxShadow: [
          BoxShadow(
            color: accent.withValues(alpha: live ? 0.22 : 0.13),
            blurRadius: 22,
            spreadRadius: -4,
          ),
        ],
      ),
      child: Material(
        color: scheme.surfaceContainerLow,
        borderRadius: _kHeroRadius,
        child: InkWell(
          onTap: _openRest,
          borderRadius: _kHeroRadius,
          child: Container(
            padding: const EdgeInsets.fromLTRB(14, 13, 12, 13),
            decoration: BoxDecoration(
              borderRadius: _kHeroRadius,
              border: Border.all(
                color: accent.withValues(alpha: live ? 0.55 : 0.40),
                width: 1.2,
              ),
              // Soft accent wash from the avatar edge — the inner glow in the
              // reference design.
              gradient: LinearGradient(
                begin: Alignment.centerLeft,
                end: Alignment.centerRight,
                colors: [accent.withValues(alpha: 0.10), Colors.transparent],
                stops: const [0.0, 0.55],
              ),
            ),
            child: Row(
              children: [
                _Avatar(
                  initials: _initialsOf(widget.name),
                  progress: progress,
                  ringColor: accent,
                ),
                const SizedBox(width: 11),
                Container(width: 1, height: 52, color: scheme.outlineVariant),
                const SizedBox(width: 11),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        widget.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context)
                            .textTheme
                            .titleMedium
                            ?.copyWith(fontWeight: FontWeight.w800),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        _fmtElapsed(elapsedSec),
                        style: Theme.of(context)
                            .textTheme
                            .headlineSmall
                            ?.copyWith(
                              color: timerColor,
                              fontWeight: FontWeight.w800,
                              height: 1,
                              fontFeatures: const [FontFeature.tabularFigures()],
                            ),
                      ),
                      const SizedBox(height: 7),
                      _StatusLine(
                        word: mood.word,
                        detail: mood.detail,
                        color: accent,
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                // Action cluster — Pause first, End on the destructive trailing
                // edge (PWA SessionHero order). End is trainer-only via [onEnd]
                // and picks up the card's mood colour.
                _LabeledAction(
                  icon:
                      isPaused ? Icons.play_arrow_rounded : Icons.pause_rounded,
                  label: isPaused ? 'Resume' : 'Pause',
                  color: isPaused ? _kPaused : scheme.onSurface,
                  background:
                      isPaused ? _kPaused.withValues(alpha: 0.16) : scheme.surface,
                  onTap: ref
                      .read(sessionPauseControllerProvider(widget.sessionId)
                          .notifier)
                      .toggle,
                ),
                if (widget.onEnd != null) ...[
                  const SizedBox(width: 8),
                  _LabeledAction(
                    icon: Icons.stop_rounded,
                    label: 'End',
                    color: accent,
                    background: accent.withValues(alpha: 0.16),
                    onTap: widget.onEnd!,
                    busy: widget.ending,
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }

  /// Maps the shared [SessionMoodKind] to the card's single mood colour. The
  /// escalation itself lives in [resolveSessionMood] so the lock-screen Live
  /// Activity / notification reads identical state.
  Color _accentFor(SessionMoodKind kind, Color success) => switch (kind) {
        SessionMoodKind.live => success,
        SessionMoodKind.paused => _kPaused,
        SessionMoodKind.idle => _kUrgent,
      };
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
      width: 52,
      height: 52,
      child: Stack(
        alignment: Alignment.center,
        children: [
          SizedBox.expand(
            child: CircularProgressIndicator(
              value: progress,
              strokeWidth: 3,
              strokeCap: StrokeCap.round,
              backgroundColor: scheme.onSurface.withValues(alpha: 0.10),
              valueColor: AlwaysStoppedAnimation(ringColor),
            ),
          ),
          Container(
            width: 40,
            height: 40,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: scheme.surface,
            ),
            child: Text(
              initials,
              style: Theme.of(context)
                  .textTheme
                  .titleSmall
                  ?.copyWith(fontWeight: FontWeight.w800),
            ),
          ),
          // Live presence dot — punched out of the card with a matching border.
          Positioned(
            right: 1,
            bottom: 3,
            child: Container(
              width: 13,
              height: 13,
              decoration: BoxDecoration(
                color: AppColors.of(context).success,
                shape: BoxShape.circle,
                border: Border.all(color: scheme.surfaceContainerLow, width: 2.5),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _StatusLine extends StatelessWidget {
  const _StatusLine({
    required this.word,
    required this.detail,
    required this.color,
  });

  final String word;
  final String detail;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          padding: const EdgeInsets.fromLTRB(7, 3, 9, 3),
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.16),
            borderRadius: BorderRadius.circular(999),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 6,
                height: 6,
                decoration:
                    BoxDecoration(color: color, shape: BoxShape.circle),
              ),
              const SizedBox(width: 5),
              Text(
                word,
                style: Theme.of(context).textTheme.labelSmall?.copyWith(
                      color: color,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0.5,
                      fontSize: 11,
                    ),
              ),
            ],
          ),
        ),
        if (detail.isNotEmpty) ...[
          const SizedBox(width: 8),
          Flexible(
            child: Text(
              detail,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: scheme.onSurfaceVariant,
                    fontWeight: FontWeight.w500,
                    fontFeatures: const [FontFeature.tabularFigures()],
                  ),
            ),
          ),
        ],
      ],
    );
  }
}

class _LabeledAction extends StatelessWidget {
  const _LabeledAction({
    required this.icon,
    required this.label,
    required this.color,
    required this.background,
    required this.onTap,
    this.busy = false,
  });

  final IconData icon;
  final String label;
  final Color color;
  final Color background;
  final VoidCallback onTap;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Tooltip(
          message: label,
          child: Material(
            color: background,
            borderRadius: BorderRadius.circular(13),
            child: InkWell(
              borderRadius: BorderRadius.circular(13),
              onTap: busy ? null : onTap,
              child: SizedBox(
                width: 46,
                height: 44,
                child: busy
                    ? const Center(
                        child: SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        ),
                      )
                    : Icon(icon, size: 22, color: color),
              ),
            ),
          ),
        ),
        const SizedBox(height: 5),
        Text(
          label,
          style: Theme.of(context).textTheme.labelSmall?.copyWith(
                color: scheme.onSurfaceVariant,
                fontWeight: FontWeight.w600,
                fontSize: 11,
              ),
        ),
      ],
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

String _initialsOf(String name) {
  final parts =
      name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
  if (parts.isEmpty) return '?';
  if (parts.length == 1) return parts.first.substring(0, 1).toUpperCase();
  return (parts.first.substring(0, 1) + parts.last.substring(0, 1))
      .toUpperCase();
}
