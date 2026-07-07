import 'package:flutter_test/flutter_test.dart';
import 'package:sector7_mobile/src/features/session/domain/rest_timer_state.dart';
import 'package:sector7_mobile/src/features/session/domain/session_mood.dart';

void main() {
  const now = 1700000000000;

  RestTimerState running(int remainingSec, {int total = 60}) => RestTimerState(
        endTime: now + remainingSec * 1000,
        pausedRemaining: null,
        total: total,
        updatedAt: now,
      );

  group('resolveSessionMood', () {
    test('session paused wins over everything', () {
      final m = resolveSessionMood(
        nowMs: now,
        skewMs: 0,
        timer: running(30),
        isPaused: true,
      );
      expect(m.kind, SessionMoodKind.paused);
      expect(m.word, 'PAUSED');
      expect(m.detail, '');
    });

    test('running rest → green REST with mm:ss', () {
      final m = resolveSessionMood(
        nowMs: now,
        skewMs: 0,
        timer: running(30),
        isPaused: false,
      );
      expect(m.kind, SessionMoodKind.live);
      expect(m.word, 'REST');
      expect(m.detail, 'Resting · 00:30');
      expect(m.attention, isFalse);
    });

    test('rest just finished → green LIVE "Rest done!"', () {
      final m = resolveSessionMood(
        nowMs: now,
        skewMs: 0,
        timer: running(-10), // ended 10s ago
        isPaused: false,
      );
      expect(m.kind, SessionMoodKind.live);
      expect(m.word, 'LIVE');
      expect(m.detail, 'Rest done!');
    });

    test('rest overdue ≥120s → rose IDLE needing attention', () {
      final m = resolveSessionMood(
        nowMs: now,
        skewMs: 0,
        timer: running(-200), // ended 200s ago
        isPaused: false,
      );
      expect(m.kind, SessionMoodKind.idle);
      expect(m.word, 'IDLE');
      expect(m.detail, 'Rest done · 3m ago');
      expect(m.attention, isTrue);
    });

    test('rest paused → amber PAUSED with frozen remaining', () {
      const paused = RestTimerState(
        endTime: null,
        pausedRemaining: 45,
        total: 60,
        updatedAt: now,
      );
      final m = resolveSessionMood(
        nowMs: now,
        skewMs: 0,
        timer: paused,
        isPaused: false,
      );
      expect(m.kind, SessionMoodKind.paused);
      expect(m.word, 'PAUSED');
      expect(m.detail, 'Rest paused · 00:45');
    });

    test('idle ≥480s with no timer → rose IDLE', () {
      final m = resolveSessionMood(
        nowMs: now,
        skewMs: 0,
        timer: RestTimerState.empty,
        isPaused: false,
        lastActivityMs: now - 500 * 1000,
      );
      expect(m.kind, SessionMoodKind.idle);
      expect(m.attention, isTrue);
      expect(m.detail, '8m idle');
    });

    test('idle 60–479s → green LIVE "since last set"', () {
      final m = resolveSessionMood(
        nowMs: now,
        skewMs: 0,
        timer: RestTimerState.empty,
        isPaused: false,
        lastActivityMs: now - 120 * 1000,
      );
      expect(m.kind, SessionMoodKind.live);
      expect(m.detail, '2m since last set');
      expect(m.attention, isFalse);
    });

    test('fresh session, nothing logged → green LIVE, no detail', () {
      final m = resolveSessionMood(
        nowMs: now,
        skewMs: 0,
        timer: RestTimerState.empty,
        isPaused: false,
      );
      expect(m.kind, SessionMoodKind.live);
      expect(m.word, 'LIVE');
      expect(m.detail, '');
    });

    test('skew aligns the countdown to server time', () {
      // Server is 5s ahead; an endTime 35s out in server time is 30s out locally.
      final m = resolveSessionMood(
        nowMs: now,
        skewMs: 5000,
        timer: RestTimerState(
          endTime: now + 5000 + 30 * 1000,
          pausedRemaining: null,
          total: 60,
          updatedAt: now,
        ),
        isPaused: false,
      );
      expect(m.detail, 'Resting · 00:30');
    });
  });

  group('formatIdle', () {
    test('seconds / minutes / hours', () {
      expect(formatIdle(45), '45s');
      expect(formatIdle(120), '2m');
      expect(formatIdle(3600), '1h');
      expect(formatIdle(4800), '1h20m');
    });
  });
}
