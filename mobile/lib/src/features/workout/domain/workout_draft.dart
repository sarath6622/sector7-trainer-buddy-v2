/// Mutable, editable working copy of a session's workout used by the logger.
/// Built from the read-only session detail (or empty), edited in place, then
/// serialized to the `POST /api/sessions/[id]/workouts` body.
library;

import '../../client/data/client_models.dart';
import '../data/exercise.dart';

class DraftSet {
  DraftSet({
    required this.setNumber,
    this.reps,
    this.weightKg,
    this.durationSec,
    this.rpe,
    this.stepsCount,
  });

  int setNumber;
  int? reps;
  double? weightKg;
  int? durationSec;
  int? rpe;
  int? stepsCount;

  /// Backend `workoutSetSchema` rejects non-positive reps/weight, so only
  /// positive values are emitted; `setNumber` is always sent.
  Map<String, dynamic> toJson() => {
        'setNumber': setNumber,
        if (reps != null && reps! > 0) 'reps': reps,
        if (weightKg != null && weightKg! > 0) 'weightKg': weightKg,
        if (durationSec != null && durationSec! > 0) 'durationSec': durationSec,
        if (rpe != null && rpe! >= 1 && rpe! <= 10) 'rpe': rpe,
        if (stepsCount != null && stepsCount! > 0) 'stepsCount': stepsCount,
      };

  factory DraftSet.fromEntry(WorkoutSetEntry e) => DraftSet(
        setNumber: e.setNumber,
        reps: e.reps,
        weightKg: e.weightKg,
        durationSec: e.durationSec,
        rpe: e.rpe,
        stepsCount: e.stepsCount,
      );
}

class DraftExercise {
  DraftExercise({
    required this.exerciseId,
    required this.name,
    required this.exerciseType,
    this.muscleGroup,
    this.tracksSteps = false,
    this.isCompleted = false,
    List<DraftSet>? sets,
  }) : sets = sets ?? [];

  final String exerciseId;
  final String name;
  final String exerciseType;
  final String? muscleGroup;
  final bool tracksSteps;
  bool isCompleted;
  List<DraftSet> sets;

  bool get isCardio => exerciseType == 'CARDIO';

  /// Append a new set, numbered after the last (renumbering stays 1-based on save).
  void addSet() => sets.add(DraftSet(setNumber: sets.length + 1));

  void removeSet(int index) {
    sets.removeAt(index);
    for (var i = 0; i < sets.length; i++) {
      sets[i].setNumber = i + 1;
    }
  }

  Map<String, dynamic> toJson(int orderIndex) => {
        'exerciseId': exerciseId,
        'orderIndex': orderIndex,
        'isCompleted': isCompleted,
        'sets': [
          for (var i = 0; i < sets.length; i++)
            (sets[i]..setNumber = i + 1).toJson(),
        ],
      };

  factory DraftExercise.fromLog(WorkoutLogEntry log) => DraftExercise(
        exerciseId: log.exerciseId,
        name: log.exerciseName,
        exerciseType: log.exerciseType ?? 'WEIGHTED',
        muscleGroup: log.muscleGroup,
        isCompleted: log.isCompleted,
        sets: log.sets.map(DraftSet.fromEntry).toList(),
      );

  factory DraftExercise.fromExercise(Exercise ex) => DraftExercise(
        exerciseId: ex.id,
        name: ex.name,
        exerciseType: ex.exerciseType,
        muscleGroup: ex.targetMuscleGroup,
        tracksSteps: ex.tracksSteps,
        sets: [DraftSet(setNumber: 1)],
      );
}
