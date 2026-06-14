import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:sector7_mobile/src/features/workout/domain/save_payload.dart';
import 'package:sector7_mobile/src/features/workout/domain/workout_draft.dart';

DraftExercise ex(String id, {bool completed = false, List<DraftSet>? sets}) =>
    DraftExercise(
      exerciseId: id,
      name: id.toUpperCase(),
      exerciseType: 'WEIGHTED',
      isCompleted: completed,
      sets: sets,
    );

DraftSet st(int n, {int? reps, double? weight}) =>
    DraftSet(setNumber: n, reps: reps, weightKg: weight);

void main() {
  group('buildSavePayload', () {
    test('drops exercises with no saveable sets and half-typed rows', () {
      final payload = buildSavePayload([
        ex('a', sets: [st(1, reps: 10, weight: 40), st(2)]), // 2nd row empty
        ex('b', sets: [st(1)]), // all empty → whole exercise dropped
      ]);
      expect(payload, hasLength(1));
      expect(payload.first['exerciseId'], 'a');
      expect((payload.first['sets'] as List), hasLength(1));
    });

    test('renumbers sets 1-based and orderIndex dense from 0', () {
      final payload = buildSavePayload([
        ex('a', sets: [st(5, reps: 5, weight: 20)]),
        ex('b', sets: [st(9, reps: 8, weight: 30)]),
      ]);
      expect(payload[0]['orderIndex'], 0);
      expect(payload[1]['orderIndex'], 1);
      expect((payload[0]['sets'] as List).first['setNumber'], 1);
    });
  });

  group('diffExercises (ADR-041)', () {
    test('identical baseline/current → empty (net-zero re-post)', () {
      final p = buildSavePayload([
        ex('a', sets: [st(1, reps: 10, weight: 40)]),
      ]);
      expect(diffExercises(p, p).isEmpty, isTrue);
    });

    test('new exercise is dirty, nothing removed', () {
      final base = buildSavePayload([
        ex('a', sets: [st(1, reps: 10, weight: 40)]),
      ]);
      final cur = buildSavePayload([
        ex('a', sets: [st(1, reps: 10, weight: 40)]),
        ex('b', sets: [st(1, reps: 5, weight: 20)]),
      ]);
      final diff = diffExercises(base, cur);
      expect(diff.dirtyExerciseIds, ['b']);
      expect(diff.removedExerciseIds, isEmpty);
      expect(diff.removedSetsByExerciseId, isEmpty);
    });

    test('a peer exercise the writer did not touch is NOT dirty', () {
      final base = buildSavePayload([
        ex('a', sets: [st(1, reps: 10, weight: 40)]),
        ex('b', sets: [st(1, reps: 5, weight: 20)]),
      ]);
      final cur = buildSavePayload([
        ex('a', sets: [st(1, reps: 12, weight: 40)]), // changed
        ex('b', sets: [st(1, reps: 5, weight: 20)]), // untouched
      ]);
      final diff = diffExercises(base, cur);
      expect(diff.dirtyExerciseIds, ['a']);
      expect(diff.removedExerciseIds, isEmpty);
    });

    test('deleted exercise → removedExerciseIds', () {
      final base = buildSavePayload([
        ex('a', sets: [st(1, reps: 10, weight: 40)]),
        ex('b', sets: [st(1, reps: 5, weight: 20)]),
      ]);
      final cur = buildSavePayload([
        ex('a', sets: [st(1, reps: 10, weight: 40)]),
      ]);
      final diff = diffExercises(base, cur);
      expect(diff.dirtyExerciseIds, isEmpty);
      expect(diff.removedExerciseIds, ['b']);
    });

    test('removing a set within an exercise → per-set removal scoped', () {
      final base = buildSavePayload([
        ex('a', sets: [
          st(1, reps: 10, weight: 40),
          st(2, reps: 8, weight: 45),
          st(3, reps: 6, weight: 50),
        ]),
      ]);
      final cur = buildSavePayload([
        ex('a', sets: [st(1, reps: 10, weight: 40), st(2, reps: 8, weight: 45)]),
      ]);
      final diff = diffExercises(base, cur);
      expect(diff.dirtyExerciseIds, ['a']);
      expect(diff.removedSetsByExerciseId['a'], [3]);
    });

    test('mark-complete toggle makes the exercise dirty, drops no sets', () {
      final base = buildSavePayload([
        ex('a', sets: [st(1, reps: 10, weight: 40)]),
      ]);
      final cur = buildSavePayload([
        ex('a', completed: true, sets: [st(1, reps: 10, weight: 40)]),
      ]);
      final diff = diffExercises(base, cur);
      expect(diff.dirtyExerciseIds, ['a']);
      expect(diff.removedSetsByExerciseId, isEmpty);
    });
  });

  test('drafts round-trip through encode/decode and the save-payload baseline', () {
    final drafts = [
      ex('a', completed: true, sets: [st(1, reps: 10, weight: 40.5), st(2)]),
    ];
    final restored = decodeDrafts(encodeDrafts(drafts));
    expect(restored.single.exerciseId, 'a');
    expect(restored.single.isCompleted, isTrue);
    expect(restored.single.sets, hasLength(2)); // half-typed row preserved
    expect(restored.single.sets.first.weightKg, 40.5);

    // The baseline survives a store round-trip (jsonEncode → decodeSavePayload)
    // and still diffs to empty — exactly what the sync service relies on.
    final payload = buildSavePayload(drafts);
    final reDecoded = decodeSavePayload(jsonEncode(payload));
    expect(diffExercises(reDecoded, payload).isEmpty, isTrue);
  });
}
