import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../session/data/rest_timer_controller.dart';
import '../../../session/data/session_pause_controller.dart';
import '../../../session/domain/rest_timer_state.dart'
    show RestTimerState, formatMmSs;
import '../../data/trainer_models.dart';

// Status vocabulary shared with session_hero_card.dart / the web SessionHero:
// semantic rest/idle/pause colours, not the orange brand accent.
const _kRunning = Color(0xFF3B82F6); // blue-500  — resting
const _kDone = Color(0xFF22C55E); // green-500 — rest done (fresh) / live
const _kPaused = Color(0xFFF59E0B); // amber-500 — paused
const _kUrgent = Color(0xFFFB7185); // rose-400  — rest done a while / overtime

/// The trainer's OTHER in-progress sessions, as tappable chips that switch the
/// session screen to that client in place — the mobile analogue of the web
/// session page's "Others in Session" strip. Each chip self-subscribes to its
/// session's rest-timer + pause state so a peer client finishing their rest
/// lights the chip up ("Rest done!"), prompting the trainer to switch back.
///
/// Renders nothing when there are no other active sessions (the caller still
/// gates on a non-empty list, but this stays safe if handed an empty one).
class OtherSessionsStrip extends StatelessWidget {
  const OtherSessionsStrip({
    super.key,
    required this.sessions,
    required this.onSwitch,
  });

  final List<TrainerSession> sessions;
  final void Function(String sessionId) onSwitch;

  @override
  Widget build(BuildContext context) {
    if (sessions.isEmpty) return const SizedBox.shrink();
    final scheme = Theme.of(context).colorScheme;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(left: 2, bottom: 7),
          child: Text(
            sessions.length == 1
                ? 'OTHER ACTIVE CLIENT'
                : 'OTHER ACTIVE CLIENTS',
            style: TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.6,
              color: scheme.onSurfaceVariant,
            ),
          ),
        ),
        // Up to two chips share the row evenly (matching the web `flex-1`
        // layout); beyond that they scroll horizontally so each stays legible.
        if (sessions.length <= 2)
          Row(
            children: [
              for (var i = 0; i < sessions.length; i++) ...[
                if (i > 0) const SizedBox(width: 8),
                Expanded(
                  child: _OtherSessionChip(
                    session: sessions[i],
                    onTap: () => onSwitch(sessions[i].id),
                  ),
                ),
              ],
            ],
          )
        else
          SizedBox(
            height: 58,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: EdgeInsets.zero,
              itemCount: sessions.length,
              separatorBuilder: (_, _) => const SizedBox(width: 8),
              itemBuilder: (_, i) => SizedBox(
                width: 190,
                child: _OtherSessionChip(
                  session: sessions[i],
                  onTap: () => onSwitch(sessions[i].id),
                ),
              ),
            ),
          ),
      ],
    );
  }
}

class _OtherSessionChip extends ConsumerStatefulWidget {
  const _OtherSessionChip({required this.session, required this.onTap});

  final TrainerSession session;
  final VoidCallback onTap;

  @override
  ConsumerState<_OtherSessionChip> createState() => _OtherSessionChipState();
}

class _OtherSessionChipState extends ConsumerState<_OtherSessionChip> {
  Timer? _ticker;

  @override
  void initState() {
    super.initState();
    // Tick locally 1Hz so the elapsed / rest counters advance even when Pusher
    // is quiet — same pattern as the hero card and the dashboard live tiles.
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
    final scheme = Theme.of(context).colorScheme;
    final s = widget.session;
    final nowMs = DateTime.now().millisecondsSinceEpoch;

    final restSnap = ref.watch(restTimerControllerProvider(s.id));
    final pauseSnap = ref.watch(sessionPauseControllerProvider(s.id));
    final status = _statusFor(
      nowMs,
      restSnap.skewMs,
      restSnap.timer,
      pauseSnap.pause.isPaused,
      s.summary.startedAt,
    );

    final name = s.clientName ?? 'Client';
    final accent = status.color;
    // Neutral "just elapsed time" states keep the sub-line muted; an active
    // rest / pause / done state tints it so the chip reads at a glance.
    final subColor = status.neutral ? scheme.onSurfaceVariant : accent;

    return Material(
      color: scheme.surfaceContainerHighest.withValues(alpha: 0.5),
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: widget.onTap,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          padding: const EdgeInsets.fromLTRB(8, 8, 10, 8),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: status.alert
                  ? accent.withValues(alpha: 0.55)
                  : scheme.outlineVariant.withValues(alpha: 0.4),
            ),
          ),
          child: Row(
            children: [
              Container(
                width: 30,
                height: 30,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: accent.withValues(alpha: 0.16),
                ),
                child: Text(
                  _initials(name),
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    color: accent,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              height: 1.1,
                            ),
                          ),
                        ),
                        const SizedBox(width: 5),
                        Container(
                          width: 6,
                          height: 6,
                          decoration:
                              BoxDecoration(color: accent, shape: BoxShape.circle),
                        ),
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(
                      status.label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 10.5,
                        height: 1.1,
                        fontWeight: FontWeight.w600,
                        color: subColor,
                        fontFeatures: const [FontFeature.tabularFigures()],
                      ),
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

  /// Chip status, in priority order — a trimmed port of the web `OthersChip`
  /// modes: paused → rest-done (fresh/warn/urgent) → resting → rest-paused →
  /// neutral elapsed-since-start. Idle-since-last-set is omitted (it needs the
  /// per-session detail the web page pre-fetches); elapsed is the cheap proxy.
  _ChipStatus _statusFor(
    int nowMs,
    int skewMs,
    RestTimerState timer,
    bool isPaused,
    DateTime? startedAt,
  ) {
    if (isPaused) return const _ChipStatus('Paused', _kPaused);

    if (timer.isDone(nowMs, skewMs)) {
      final end = timer.endTime;
      final doneSec = end != null
          ? (((nowMs + skewMs) - end) ~/ 1000).clamp(0, 1 << 40).toInt()
          : 0;
      if (doneSec >= 300) {
        return _ChipStatus('Rest done · ${_fmtIdle(doneSec)}', _kUrgent,
            alert: true);
      }
      if (doneSec >= 120) {
        return _ChipStatus('Rest done · ${_fmtIdle(doneSec)}', _kPaused,
            alert: true);
      }
      return const _ChipStatus('Rest done!', _kDone, alert: true);
    }
    if (timer.isRunning(nowMs, skewMs)) {
      return _ChipStatus(
          'Resting · ${formatMmSs(timer.remaining(nowMs, skewMs)!)}', _kRunning);
    }
    if (timer.isPaused) return const _ChipStatus('Rest paused', _kPaused);

    if (startedAt != null) {
      final elapsed = ((nowMs - startedAt.millisecondsSinceEpoch) ~/ 1000)
          .clamp(0, 1 << 40)
          .toInt();
      return _ChipStatus(_fmtElapsed(elapsed), _kDone, neutral: true);
    }
    return const _ChipStatus('Live', _kDone, neutral: true);
  }
}

class _ChipStatus {
  const _ChipStatus(
    this.label,
    this.color, {
    this.alert = false,
    this.neutral = false,
  });

  final String label;
  final Color color;

  /// A waiting client (rest finished) — outlines the chip in its accent so the
  /// trainer's eye is pulled to it.
  final bool alert;

  /// "Just the running clock" — the sub-line stays muted rather than tinted.
  final bool neutral;
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

String _initials(String name) {
  final parts =
      name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
  if (parts.isEmpty) return '?';
  if (parts.length == 1) return parts.first.substring(0, 1).toUpperCase();
  return (parts.first.substring(0, 1) + parts.last.substring(0, 1)).toUpperCase();
}
