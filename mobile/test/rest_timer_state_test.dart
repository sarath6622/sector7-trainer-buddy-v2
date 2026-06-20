import 'package:flutter_test/flutter_test.dart';
import 'package:sector7_mobile/src/features/session/domain/rest_timer_state.dart';

void main() {
  group('RestTimerState.fromJson', () {
    test('parses a running timer', () {
      final s = RestTimerState.fromJson({
        'endTime': 1700000000000,
        'pausedRemaining': null,
        'total': 120,
        'updatedAt': 1699999999000,
      });
      expect(s.endTime, 1700000000000);
      expect(s.pausedRemaining, isNull);
      expect(s.total, 120);
      expect(s.updatedAt, 1699999999000);
      expect(s.isPaused, isFalse);
      expect(s.isCleared, isFalse);
    });

    test('parses a paused timer', () {
      final s = RestTimerState.fromJson({
        'endTime': null,
        'pausedRemaining': 45,
        'total': 120,
        'updatedAt': 5,
      });
      expect(s.isPaused, isTrue);
      expect(s.pausedRemaining, 45);
    });

    test('missing fields default to null / 0', () {
      final s = RestTimerState.fromJson(const {});
      expect(s, RestTimerState.empty);
      expect(s.isCleared, isTrue);
    });
  });

  group('remaining / skew', () {
    test('paused timer reports its frozen seconds regardless of clock', () {
      const s = RestTimerState(
          endTime: null, pausedRemaining: 45, total: 120, updatedAt: 1);
      expect(s.remaining(999999, 12345), 45);
    });

    test('running timer counts down in server time via skew', () {
      // server is 5s ahead of the phone clock
      const s = RestTimerState(
          endTime: 100000, pausedRemaining: null, total: 120, updatedAt: 1);
      // serverNow-equivalent = now(10000) + skew(5000) = 15000
      expect(s.remaining(10000, 5000), 85);
    });

    test('remaining clamps at 0 once the endTime has passed', () {
      const s = RestTimerState(
          endTime: 100000, pausedRemaining: null, total: 120, updatedAt: 1);
      expect(s.remaining(200000, 0), 0);
    });

    test('cleared timer has no remaining', () {
      expect(RestTimerState.empty.remaining(0, 0), isNull);
    });
  });

  group('derived flags', () {
    const running = RestTimerState(
        endTime: 100000, pausedRemaining: null, total: 100, updatedAt: 1);

    test('isRunning while remaining > 0', () {
      expect(running.isRunning(10000, 0), isTrue);
      expect(running.isDone(10000, 0), isFalse);
    });

    test('isDone once a started timer hits 0', () {
      expect(running.isDone(200000, 0), isTrue);
      expect(running.isRunning(200000, 0), isFalse);
    });

    test('a cleared timer at 0 is not "done" (never started)', () {
      // no total ⇒ nothing was started, so reaching 0 is not a completion
      const cleared = RestTimerState(
          endTime: 100000, pausedRemaining: null, total: null, updatedAt: 1);
      expect(cleared.isDone(200000, 0), isFalse);
    });

    test('progress depletes from ~1 toward 0', () {
      expect(running.progress(100, 0), closeTo(1, 0.01));
      expect(running.progress(50100, 0), closeTo(0.5, 0.02));
      expect(running.progress(200000, 0), 0);
    });

    test('progress is 1 when idle', () {
      expect(RestTimerState.empty.progress(0, 0), 1);
    });
  });

  group('merge (monotonic guard)', () {
    const older = RestTimerState(
        endTime: 1, pausedRemaining: null, total: 60, updatedAt: 100);
    const newer = RestTimerState(
        endTime: 2, pausedRemaining: null, total: 90, updatedAt: 200);

    test('keeps the newer updatedAt', () {
      expect(older.merge(newer), newer);
    });

    test('rejects a stale incoming state', () {
      expect(newer.merge(older), newer);
    });

    test('ties go to the incoming state (own echo supersedes optimistic)', () {
      const tie = RestTimerState(
          endTime: 9, pausedRemaining: null, total: 30, updatedAt: 200);
      expect(newer.merge(tie), tie);
    });
  });

  group('mutation builders', () {
    test('startMutation seeds endTime in server time + a PUT body', () {
      final m = RestTimerState.empty.startMutation(180, 10000, 5000);
      expect(m.isStop, isFalse);
      // endTime = now + skew + 180s = 15000 + 180000
      expect(m.optimistic.endTime, 195000);
      expect(m.optimistic.total, 180);
      expect(m.optimistic.pausedRemaining, isNull);
      expect(m.optimistic.updatedAt, 15000);
      expect(m.body, {'endTime': 195000, 'pausedRemaining': null, 'total': 180});
    });

    test('pauseMutation freezes the remaining seconds', () {
      const running = RestTimerState(
          endTime: 100000, pausedRemaining: null, total: 120, updatedAt: 1);
      final m = running.pauseMutation(10000, 0)!;
      expect(m.optimistic.endTime, isNull);
      expect(m.optimistic.pausedRemaining, 90);
      expect(m.optimistic.total, 120);
      expect(m.body, {'endTime': null, 'pausedRemaining': 90, 'total': 120});
    });

    test('pauseMutation is null when nothing is running', () {
      expect(RestTimerState.empty.pauseMutation(0, 0), isNull);
    });

    test('pauseMutation is null when the timer already expired', () {
      const running = RestTimerState(
          endTime: 100000, pausedRemaining: null, total: 120, updatedAt: 1);
      expect(running.pauseMutation(200000, 0), isNull);
    });

    test('resumeMutation re-projects endTime from the frozen seconds', () {
      const paused = RestTimerState(
          endTime: null, pausedRemaining: 90, total: 120, updatedAt: 1);
      final m = paused.resumeMutation(10000, 0)!;
      expect(m.optimistic.endTime, 100000); // 10000 + 90s
      expect(m.optimistic.pausedRemaining, isNull);
      expect(m.body, {'endTime': 100000, 'pausedRemaining': null, 'total': 120});
    });

    test('resumeMutation is null when not paused', () {
      const running = RestTimerState(
          endTime: 100000, pausedRemaining: null, total: 120, updatedAt: 1);
      expect(running.resumeMutation(0, 0), isNull);
    });

    test('stopMutation clears state and signals a DELETE', () {
      const running = RestTimerState(
          endTime: 100000, pausedRemaining: null, total: 120, updatedAt: 1);
      final m = running.stopMutation(10000, 5000);
      expect(m.isStop, isTrue);
      expect(m.body, isNull);
      expect(m.optimistic.isCleared, isTrue);
      expect(m.optimistic.updatedAt, 15000); // supersedes prior state
    });
  });

  group('formatMmSs', () {
    test('pads minutes and seconds', () {
      expect(formatMmSs(0), '00:00');
      expect(formatMmSs(9), '00:09');
      expect(formatMmSs(65), '01:05');
      expect(formatMmSs(600), '10:00');
    });

    test('negative clamps to zero', () {
      expect(formatMmSs(-5), '00:00');
    });
  });
}
