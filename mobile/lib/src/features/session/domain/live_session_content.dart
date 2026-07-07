import 'rest_timer_state.dart';
import 'session_mood.dart';

/// The cross-platform snapshot a live session projects onto the lock screen —
/// an iOS Live Activity and an Android ongoing notification read identical data.
///
/// Pure value object (no plugins, no IO) so the rest/pause → surface mapping is
/// unit testable. All `*Ms` timestamps are in **device-clock ms** (already
/// de-skewed from server time) so the lock-screen countdown / chronometer ticks
/// against the phone's own clock.
class LiveSessionContent {
  const LiveSessionContent({
    required this.personName,
    required this.workoutTitle,
    required this.startedAtMs,
    required this.isPaused,
    required this.isResting,
    required this.restStartMs,
    required this.restEndMs,
    required this.mood,
    required this.statusWord,
    required this.statusDetail,
  });

  /// Trainer name on the client screen, client name on the trainer screen.
  final String personName;

  /// Focus-derived workout name ("Chest Day"), or "Workout" before anything's
  /// logged. Never empty.
  final String workoutTitle;

  /// Session start in device-clock ms — anchors the elapsed chronometer.
  final int startedAtMs;

  /// Session paused (not the rest timer) — surfaces show "Paused" + amber.
  final bool isPaused;

  /// A rest countdown is currently running (remaining > 0). Drives the
  /// self-ticking timer on the surface.
  final bool isResting;

  /// Rest window in device-clock ms — null unless [isResting]. The surface
  /// renders the countdown over `restStartMs…restEndMs`.
  final int? restStartMs;
  final int? restEndMs;

  /// Mood family (green / amber / rose) — same resolution as the in-app card.
  final SessionMoodKind mood;

  /// Short status word for the pill (LIVE / REST / PAUSED / IDLE).
  final String statusWord;

  /// Human status line. Carries live seconds while resting (the surface shows
  /// its own ticking timer instead), so it is intentionally excluded from
  /// [signature] to avoid a per-second push.
  final String statusDetail;

  /// Lowercase mood token shared with the Swift widget / notification colour.
  String get moodToken => switch (mood) {
        SessionMoodKind.live => 'live',
        SessionMoodKind.paused => 'paused',
        SessionMoodKind.idle => 'idle',
      };

  /// Dedupe key for the binder — the structural fields a surface push must react
  /// to. While resting, [statusDetail] is excluded because its live seconds tick
  /// every second and the surface shows its own self-ticking countdown anyway;
  /// when **not** resting the detail changes slowly ("Rest done!", "12m idle")
  /// and is included so those updates reach the surface.
  String get signature =>
      '$personName|$workoutTitle|$startedAtMs|$isPaused|$isResting|'
      '$restEndMs|$moodToken|$statusWord|${isResting ? '' : statusDetail}';

  /// The dynamic data map handed to the `live_activities` plugin (stored in the
  /// shared App Group, read back by the SwiftUI widget via `prefixedKey`). Every
  /// key is always present with a sentinel so stale values never linger.
  Map<String, dynamic> toActivityData() => {
        'personName': personName,
        'workoutTitle': workoutTitle,
        'startedAtMs': startedAtMs,
        'isPaused': isPaused,
        'isResting': isResting,
        'restStartMs': restStartMs ?? 0,
        'restEndMs': restEndMs ?? 0,
        'mood': moodToken,
        'statusWord': statusWord,
        'statusDetail': statusDetail,
      };

  /// Projects the live rest/pause state onto the surface snapshot. [nowMs] /
  /// [skewMs] (serverNow - clientNow) align the server-clock rest timer to the
  /// device clock; [lastActivityMs] feeds the idle escalation (null suppresses).
  factory LiveSessionContent.from({
    required String personName,
    required String workoutTitle,
    required DateTime startedAt,
    required RestTimerState timer,
    required bool isPaused,
    required int nowMs,
    required int skewMs,
    int? lastActivityMs,
  }) {
    final mood = resolveSessionMood(
      nowMs: nowMs,
      skewMs: skewMs,
      timer: timer,
      isPaused: isPaused,
      lastActivityMs: lastActivityMs,
    );

    final running = timer.isRunning(nowMs, skewMs);
    int? localEnd;
    int? localStart;
    if (running && timer.endTime != null) {
      // server-clock endTime → device clock: endTime - skew.
      localEnd = timer.endTime! - skewMs;
      if (timer.total != null) localStart = localEnd - timer.total! * 1000;
    }

    final title = workoutTitle.trim();
    return LiveSessionContent(
      personName: personName,
      workoutTitle: title.isEmpty ? 'Workout' : title,
      startedAtMs: startedAt.millisecondsSinceEpoch,
      isPaused: isPaused,
      isResting: running,
      restStartMs: localStart,
      restEndMs: localEnd,
      mood: mood.kind,
      statusWord: mood.word,
      statusDetail: mood.detail,
    );
  }
}
