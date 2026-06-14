/// Mutable, editable working copy of a session's workout used by the logger.
/// Built from the read-only session detail (or empty), edited in place, then
/// serialized to the `POST /api/sessions/[id]/workouts` body.
library;

import 'dart:convert';

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
  /// positive values are emitted; `setNumber` is always sent. Pass
  /// [overrideSetNumber] to emit a 1-based position without mutating this set
  /// (used when serializing a filtered subset for the save payload).
  Map<String, dynamic> toJson([int? overrideSetNumber]) => {
        'setNumber': overrideSetNumber ?? setNumber,
        if (reps != null && reps! > 0) 'reps': reps,
        if (weightKg != null && weightKg! > 0) 'weightKg': weightKg,
        if (durationSec != null && durationSec! > 0) 'durationSec': durationSec,
        if (rpe != null && rpe! >= 1 && rpe! <= 10) 'rpe': rpe,
        if (stepsCount != null && stepsCount! > 0) 'stepsCount': stepsCount,
      };

  /// Loss-less serialization for the offline store (keeps half-typed values
  /// the wire [toJson] would drop, so a restored draft round-trips exactly).
  Map<String, dynamic> toFullJson() => {
        'setNumber': setNumber,
        'reps': reps,
        'weightKg': weightKg,
        'durationSec': durationSec,
        'rpe': rpe,
        'stepsCount': stepsCount,
      };

  factory DraftSet.fromFullJson(Map<String, dynamic> j) => DraftSet(
        setNumber: (j['setNumber'] as num?)?.toInt() ?? 1,
        reps: (j['reps'] as num?)?.toInt(),
        weightKg: (j['weightKg'] as num?)?.toDouble(),
        durationSec: (j['durationSec'] as num?)?.toInt(),
        rpe: (j['rpe'] as num?)?.toInt(),
        stepsCount: (j['stepsCount'] as num?)?.toInt(),
      );

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
          for (var i = 0; i < sets.length; i++) sets[i].toJson(i + 1),
        ],
      };

  /// Loss-less serialization for the offline store — keeps the exercise
  /// metadata (name/type/muscle) the UI needs to re-render a restored draft.
  Map<String, dynamic> toFullJson() => {
        'exerciseId': exerciseId,
        'name': name,
        'exerciseType': exerciseType,
        'muscleGroup': muscleGroup,
        'tracksSteps': tracksSteps,
        'isCompleted': isCompleted,
        'sets': [for (final s in sets) s.toFullJson()],
      };

  factory DraftExercise.fromFullJson(Map<String, dynamic> j) => DraftExercise(
        exerciseId: j['exerciseId'] as String,
        name: (j['name'] ?? '') as String,
        exerciseType: (j['exerciseType'] ?? 'WEIGHTED') as String,
        muscleGroup: j['muscleGroup'] as String?,
        tracksSteps: j['tracksSteps'] as bool? ?? false,
        isCompleted: j['isCompleted'] as bool? ?? false,
        sets: [
          for (final s in (j['sets'] as List? ?? const []))
            DraftSet.fromFullJson(Map<String, dynamic>.from(s as Map)),
        ],
      );

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

/// Serialize a list of editable drafts for the offline store (loss-less).
String encodeDrafts(List<DraftExercise> drafts) =>
    jsonEncode([for (final d in drafts) d.toFullJson()]);

/// Inverse of [encodeDrafts] — rebuild the editable drafts a restored session
/// re-opens into.
List<DraftExercise> decodeDrafts(String json) => [
      for (final e in (jsonDecode(json) as List))
        DraftExercise.fromFullJson(Map<String, dynamic>.from(e as Map)),
    ];
