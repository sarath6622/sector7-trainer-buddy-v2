import 'package:flutter_test/flutter_test.dart';
import 'package:sector7_mobile/src/features/session/domain/live_session_content.dart';
import 'package:sector7_mobile/src/features/session/domain/rest_timer_state.dart';
import 'package:sector7_mobile/src/features/session/domain/session_mood.dart';

void main() {
  const now = 1700000000000;
  final startedAt = DateTime.fromMillisecondsSinceEpoch(now - 600 * 1000);

  LiveSessionContent build({
    required RestTimerState timer,
    bool isPaused = false,
    int skewMs = 0,
    String title = 'Chest Day',
    int? lastActivityMs,
  }) =>
      LiveSessionContent.from(
        personName: 'Alex',
        workoutTitle: title,
        startedAt: startedAt,
        timer: timer,
        isPaused: isPaused,
        nowMs: now,
        skewMs: skewMs,
        lastActivityMs: lastActivityMs,
      );

  test('running rest → resting payload with de-skewed local rest window', () {
    // Server 5s ahead; 30s remaining in server time → local end is now + 30s.
    final c = build(
      skewMs: 5000,
      timer: RestTimerState(
        endTime: now + 5000 + 30 * 1000,
        pausedRemaining: null,
        total: 60,
        updatedAt: now,
      ),
    );
    expect(c.isResting, isTrue);
    expect(c.restEndMs, now + 30 * 1000);
    expect(c.restStartMs, now + 30 * 1000 - 60 * 1000);
    expect(c.mood, SessionMoodKind.live);
    expect(c.statusWord, 'REST');
    expect(c.moodToken, 'live');

    final data = c.toActivityData();
    expect(data['isResting'], true);
    expect(data['restEndMs'], now + 30 * 1000);
    expect(data['mood'], 'live');
    expect(data['personName'], 'Alex');
  });

  test('not resting → no rest window, sentinel 0 in payload', () {
    final c = build(timer: RestTimerState.empty);
    expect(c.isResting, isFalse);
    expect(c.restEndMs, isNull);
    expect(c.toActivityData()['restEndMs'], 0);
    expect(c.toActivityData()['isResting'], false);
  });

  test('session paused → amber paused payload', () {
    final c = build(timer: RestTimerState.empty, isPaused: true);
    expect(c.isPaused, isTrue);
    expect(c.mood, SessionMoodKind.paused);
    expect(c.moodToken, 'paused');
    expect(c.toActivityData()['isPaused'], true);
  });

  test('empty workout title defaults to "Workout"', () {
    final c = build(timer: RestTimerState.empty, title: '   ');
    expect(c.workoutTitle, 'Workout');
  });

  test('while resting, signature ignores the ticking status detail', () {
    const a = LiveSessionContent(
      personName: 'Alex',
      workoutTitle: 'Chest Day',
      startedAtMs: now,
      isPaused: false,
      isResting: true,
      restStartMs: now,
      restEndMs: now + 30000,
      mood: SessionMoodKind.live,
      statusWord: 'REST',
      statusDetail: 'Resting · 00:30',
    );
    final b = LiveSessionContent(
      personName: a.personName,
      workoutTitle: a.workoutTitle,
      startedAtMs: a.startedAtMs,
      isPaused: a.isPaused,
      isResting: a.isResting,
      restStartMs: a.restStartMs,
      restEndMs: a.restEndMs,
      mood: a.mood,
      statusWord: a.statusWord,
      statusDetail: 'Resting · 00:29', // only the live seconds moved
    );
    expect(a.signature, b.signature);
  });

  test('when not resting, a changed detail moves the signature', () {
    const base = LiveSessionContent(
      personName: 'Alex',
      workoutTitle: 'Chest Day',
      startedAtMs: now,
      isPaused: false,
      isResting: false,
      restStartMs: null,
      restEndMs: null,
      mood: SessionMoodKind.live,
      statusWord: 'LIVE',
      statusDetail: '',
    );
    final done = LiveSessionContent(
      personName: base.personName,
      workoutTitle: base.workoutTitle,
      startedAtMs: base.startedAtMs,
      isPaused: base.isPaused,
      isResting: base.isResting,
      restStartMs: base.restStartMs,
      restEndMs: base.restEndMs,
      mood: base.mood,
      statusWord: base.statusWord,
      statusDetail: 'Rest done!', // same mood/word, slow-changing detail
    );
    expect(base.signature, isNot(done.signature));
  });

  test('signature moves when a meaningful transition happens', () {
    final resting = build(
      timer: RestTimerState(
        endTime: now + 30 * 1000,
        pausedRemaining: null,
        total: 60,
        updatedAt: now,
      ),
    );
    final done = build(
      timer: RestTimerState(
        endTime: now - 5 * 1000,
        pausedRemaining: null,
        total: 60,
        updatedAt: now,
      ),
    );
    expect(resting.signature, isNot(done.signature));
  });
}
