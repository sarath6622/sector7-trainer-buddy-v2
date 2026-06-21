import 'rest_timer_state.dart';

/// The three semantic moods a live session can be in, shared by the in-app
/// [SessionHeroCard] and the lock-screen Live Activity / notification so both
/// always agree. Each maps to one colour in the presentation layer:
///   • [live]   → green  (on track / resting / just finished rest),
///   • [paused] → amber  (session or rest paused),
///   • [idle]   → rose   (needs attention: rest overdue, or no set for a while).
enum SessionMoodKind { live, paused, idle }

/// Resolved mood for a live session — the colour family ([kind]), a short status
/// word for the pill (LIVE / REST / PAUSED / IDLE), a human [detail] line, and
/// whether the client needs the eye ([attention]).
///
/// Pure value object (no Flutter, no IO) so the escalation logic stays unit
/// testable without timers or a widget tree.
class SessionMood {
  const SessionMood(
    this.kind,
    this.word,
    this.detail, {
    this.attention = false,
  });

  final SessionMoodKind kind;
  final String word;
  final String detail;
  final bool attention;

  @override
  bool operator ==(Object other) =>
      other is SessionMood &&
      other.kind == kind &&
      other.word == word &&
      other.detail == detail &&
      other.attention == attention;

  @override
  int get hashCode => Object.hash(kind, word, detail, attention);
}

/// Resolves the session mood in priority order — session-paused → rest-done
/// (fresh on-track / overdue rose) → resting → rest-paused → idle (on-track /
/// overdue rose) → live. Mirrors the web SessionHero escalation collapsed to the
/// green / amber / rose vocabulary.
///
/// All timestamps are local-clock ms; [skewMs] (serverNow - clientNow) aligns
/// the rest countdown to server time. [lastActivityMs] is the most-recent set
/// timestamp; null suppresses the idle escalation (stays on-track / green).
SessionMood resolveSessionMood({
  required int nowMs,
  required int skewMs,
  required RestTimerState timer,
  required bool isPaused,
  int? lastActivityMs,
}) {
  if (isPaused) {
    return const SessionMood(SessionMoodKind.paused, 'PAUSED', '');
  }

  if (timer.isDone(nowMs, skewMs)) {
    final doneSec = timer.endTime != null
        ? (((nowMs + skewMs) - timer.endTime!) ~/ 1000).clamp(0, 1 << 40).toInt()
        : 0;
    // Rest finished a while ago and no new set — client is idle, flag it.
    if (doneSec >= 120) {
      return SessionMood(
        SessionMoodKind.idle,
        'IDLE',
        'Rest done · ${formatIdle(doneSec)} ago',
        attention: true,
      );
    }
    return const SessionMood(SessionMoodKind.live, 'LIVE', 'Rest done!');
  }
  if (timer.isRunning(nowMs, skewMs)) {
    return SessionMood(
      SessionMoodKind.live,
      'REST',
      'Resting · ${formatMmSs(timer.remaining(nowMs, skewMs)!)}',
    );
  }
  if (timer.isPaused) {
    return SessionMood(
      SessionMoodKind.paused,
      'PAUSED',
      'Rest paused · ${formatMmSs(timer.remaining(nowMs, skewMs)!)}',
    );
  }

  if (lastActivityMs != null) {
    final idleSec = ((nowMs - lastActivityMs) ~/ 1000).clamp(0, 1 << 40).toInt();
    if (idleSec >= 480) {
      return SessionMood(
        SessionMoodKind.idle,
        'IDLE',
        '${formatIdle(idleSec)} idle',
        attention: true,
      );
    }
    if (idleSec >= 60) {
      return SessionMood(
        SessionMoodKind.live,
        'LIVE',
        '${formatIdle(idleSec)} since last set',
      );
    }
  }
  return const SessionMood(SessionMoodKind.live, 'LIVE', '');
}

/// Compact idle duration — `45s`, `12m`, `1h`, `1h20m`. Shared by the hero card
/// and the Live Activity status detail.
String formatIdle(int totalSec) {
  final s = totalSec < 0 ? 0 : totalSec;
  if (s < 60) return '${s}s';
  final m = s ~/ 60;
  if (m < 60) return '${m}m';
  final h = m ~/ 60;
  final rem = m % 60;
  return rem == 0 ? '${h}h' : '${h}h${rem}m';
}
