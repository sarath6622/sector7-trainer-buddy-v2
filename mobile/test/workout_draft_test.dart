import 'package:flutter_test/flutter_test.dart';
import 'package:sector7_mobile/src/features/client/data/client_models.dart';
import 'package:sector7_mobile/src/features/workout/data/exercise.dart';
import 'package:sector7_mobile/src/features/workout/domain/workout_draft.dart';

void main() {
  group('DraftSet.toJson', () {
    test('emits only positive values plus setNumber', () {
      final s = DraftSet(setNumber: 1, reps: 10, weightKg: 40, rpe: 8);
      expect(s.toJson(), {'setNumber': 1, 'reps': 10, 'weightKg': 40.0, 'rpe': 8});
    });

    test('drops zero/negative reps & weight (backend requires positive)', () {
      final s = DraftSet(setNumber: 2, reps: 0, weightKg: 0);
      expect(s.toJson(), {'setNumber': 2});
    });

    test('drops out-of-range rpe', () {
      expect(DraftSet(setNumber: 1, reps: 5, rpe: 0).toJson().containsKey('rpe'), isFalse);
      expect(DraftSet(setNumber: 1, reps: 5, rpe: 11).toJson().containsKey('rpe'), isFalse);
    });
  });

  group('DraftExercise', () {
    test('fromExercise starts with one empty set', () {
      final ex = Exercise(
        id: 'ex1',
        name: 'Squat',
        targetMuscleGroup: 'Legs',
        category: 'STRENGTH',
        exerciseType: 'WEIGHTED',
        secondaryMetric: 'KM',
      );
      final d = DraftExercise.fromExercise(ex);
      expect(d.exerciseId, 'ex1');
      expect(d.sets, hasLength(1));
      expect(d.sets.first.setNumber, 1);
    });

    test('toJson renumbers sets 1-based and carries orderIndex + completion', () {
      final d = DraftExercise(
        exerciseId: 'ex2',
        name: 'Bench',
        exerciseType: 'WEIGHTED',
        isCompleted: true,
        sets: [
          DraftSet(setNumber: 5, reps: 10, weightKg: 50),
          DraftSet(setNumber: 9, reps: 8, weightKg: 55),
        ],
      );
      final json = d.toJson(3);
      expect(json['exerciseId'], 'ex2');
      expect(json['orderIndex'], 3);
      expect(json['isCompleted'], true);
      final sets = json['sets'] as List;
      expect(sets.map((s) => s['setNumber']), [1, 2]);
      expect(sets[0]['weightKg'], 50.0);
    });

    test('removeSet renumbers remaining sets', () {
      final d = DraftExercise(exerciseId: 'e', name: 'X', exerciseType: 'WEIGHTED', sets: [
        DraftSet(setNumber: 1, reps: 1),
        DraftSet(setNumber: 2, reps: 2),
        DraftSet(setNumber: 3, reps: 3),
      ]);
      d.removeSet(0);
      expect(d.sets.map((s) => s.setNumber), [1, 2]);
      expect(d.sets.map((s) => s.reps), [2, 3]);
    });

    test('fromLog seeds editable draft from a read-only session log', () {
      final log = WorkoutLogEntry.fromJson({
        'id': 'log1',
        'isCompleted': true,
        'exercise': {'id': 'ex9', 'name': 'Deadlift', 'targetMuscleGroup': 'Back', 'exerciseType': 'WEIGHTED'},
        'sets': [
          {'setNumber': 1, 'reps': 5, 'weightKg': 100},
        ],
      });
      final d = DraftExercise.fromLog(log);
      expect(d.exerciseId, 'ex9');
      expect(d.exerciseType, 'WEIGHTED');
      expect(d.isCompleted, isTrue);
      expect(d.sets.single.weightKg, 100.0);
      // Round-trips back into a valid POST entry.
      expect(d.toJson(0)['sets'], [
        {'setNumber': 1, 'reps': 5, 'weightKg': 100.0},
      ]);
    });
  });
}
