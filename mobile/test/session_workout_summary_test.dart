import 'package:flutter_test/flutter_test.dart';
import 'package:sector7_mobile/src/features/client/data/client_models.dart';
import 'package:sector7_mobile/src/features/client/domain/session_workout_summary.dart';

WorkoutSetEntry set({int n = 1, int? reps, double? weight}) =>
    WorkoutSetEntry(setNumber: n, reps: reps, weightKg: weight);

WorkoutLogEntry log(String name, String? muscleGroup, List<WorkoutSetEntry> sets) =>
    WorkoutLogEntry(
      id: name,
      exerciseId: name,
      exerciseName: name,
      muscleGroup: muscleGroup,
      exerciseType: 'WEIGHTED',
      isCompleted: true,
      sets: sets,
    );

void main() {
  group('summarizeSession', () {
    test('volume sums weight × reps, ignoring sets missing either', () {
      final s = summarizeSession([
        log('Bench', 'Chest', [
          set(reps: 10, weight: 50), // 500
          set(reps: 8, weight: 60), // 480
          set(reps: 12), // no weight → ignored
          set(weight: 40), // no reps → ignored
        ]),
      ]);
      expect(s.totalVolumeKg, 980);
      expect(s.exerciseCount, 1);
    });

    test('bodyweight-only session has zero volume but still counts exercises', () {
      final s = summarizeSession([
        log('Push-up', 'Chest', [set(reps: 20)]),
        log('Plank', 'Core', [set()]),
      ]);
      expect(s.totalVolumeKg, 0);
      expect(s.exerciseCount, 2);
    });

    test('groups ranked by exercise count, ties broken by canonical order', () {
      final s = summarizeSession([
        log('Squat', 'Quadriceps', [set(reps: 5, weight: 100)]),
        log('Lunge', 'Hamstrings', [set(reps: 5, weight: 40)]),
        log('Row', 'Back', [set(reps: 5, weight: 60)]),
      ]);
      // legs has 2 exercises (Quadriceps + Hamstrings both → legs), back has 1.
      expect(s.topGroupIds.first, 'legs');
      expect(s.primaryGroupId, 'legs');
      expect(s.imageAsset, 'assets/muscles/legs.png');
    });

    test('one group → its label as the title', () {
      final s = summarizeSession([log('Curl', 'Biceps', [set(reps: 10, weight: 15)])]);
      expect(s.title, 'Biceps');
    });

    test('two groups → "A & B" in canonical order on a tie', () {
      // chest + back, one exercise each → canonical order puts chest first.
      final s = summarizeSession([
        log('Row', 'Back', [set(reps: 8, weight: 50)]),
        log('Press', 'Chest', [set(reps: 8, weight: 50)]),
      ]);
      expect(s.title, 'Chest & Back');
    });

    test('three or more groups → "Full Body"', () {
      final s = summarizeSession([
        log('Press', 'Chest', [set(reps: 8, weight: 50)]),
        log('Row', 'Back', [set(reps: 8, weight: 50)]),
        log('Squat', 'Quadriceps', [set(reps: 8, weight: 80)]),
      ]);
      expect(s.title, 'Full Body');
    });

    test('unrecognised muscle group is ignored — no title/art, still counted', () {
      final s = summarizeSession([log('Neck curl', 'Neck', [set(reps: 10, weight: 5)])]);
      expect(s.topGroupIds, isEmpty);
      expect(s.title, isNull);
      expect(s.imageAsset, isNull);
      expect(s.exerciseCount, 1);
      expect(s.totalVolumeKg, 50);
    });
  });
}
