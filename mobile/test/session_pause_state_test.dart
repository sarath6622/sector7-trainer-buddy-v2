import 'package:flutter_test/flutter_test.dart';
import 'package:sector7_mobile/src/features/session/domain/session_pause_state.dart';

void main() {
  group('SessionPauseState.fromJson', () {
    test('parses a running session', () {
      final s = SessionPauseState.fromJson({
        'pausedAt': null,
        'accumulatedPausedSec': 30,
        'updatedAt': 1700000000000,
      });
      expect(s.isPaused, isFalse);
      expect(s.accumulatedPausedSec, 30);
      expect(s.updatedAt, 1700000000000);
    });

    test('parses a paused session', () {
      final s = SessionPauseState.fromJson({
        'pausedAt': 1700000000000,
        'accumulatedPausedSec': 12,
        'updatedAt': 1700000000000,
      });
      expect(s.isPaused, isTrue);
      expect(s.pausedAt, 1700000000000);
    });

    test('missing fields default to running/empty', () {
      expect(SessionPauseState.fromJson(const {}), SessionPauseState.empty);
    });
  });

  group('totalPausedSec', () {
    test('running session returns the static accumulator', () {
      const s = SessionPauseState(
          pausedAt: null, accumulatedPausedSec: 30, updatedAt: 1);
      expect(s.totalPausedSec(999999, 4321), 30);
    });

    test('paused session adds the in-flight segment in server time', () {
      const s = SessionPauseState(
          pausedAt: 100000, accumulatedPausedSec: 30, updatedAt: 1);
      // serverNow-equivalent = now(10000) + skew(95000) = 105000 ⇒ live 5s
      expect(s.totalPausedSec(10000, 95000), 35);
    });

    test('in-flight segment never goes negative on a backwards clock', () {
      const s = SessionPauseState(
          pausedAt: 100000, accumulatedPausedSec: 8, updatedAt: 1);
      expect(s.totalPausedSec(50000, 0), 8);
    });
  });

  group('toggleOptimistic', () {
    test('running → paused captures pausedAt, keeps accumulator', () {
      const s = SessionPauseState(
          pausedAt: null, accumulatedPausedSec: 30, updatedAt: 1);
      final t = s.toggleOptimistic(10000, 0);
      expect(t.pausedAt, 10000);
      expect(t.accumulatedPausedSec, 30);
      expect(t.updatedAt, 10000);
    });

    test('paused → running folds the segment into the accumulator', () {
      const s = SessionPauseState(
          pausedAt: 5000, accumulatedPausedSec: 30, updatedAt: 1);
      final t = s.toggleOptimistic(10000, 0); // 5s in-flight
      expect(t.pausedAt, isNull);
      expect(t.accumulatedPausedSec, 35);
      expect(t.updatedAt, 10000);
    });
  });

  group('merge (monotonic guard)', () {
    const older = SessionPauseState(
        pausedAt: 1, accumulatedPausedSec: 1, updatedAt: 100);
    const newer = SessionPauseState(
        pausedAt: null, accumulatedPausedSec: 9, updatedAt: 200);

    test('keeps the newer updatedAt', () => expect(older.merge(newer), newer));
    test('rejects stale', () => expect(newer.merge(older), newer));
  });
}
