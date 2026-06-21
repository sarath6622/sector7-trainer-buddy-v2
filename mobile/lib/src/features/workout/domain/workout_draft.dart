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
    this.restSec,
    this.stepsCount,
    this.isCompleted = false,
  });

  int setNumber;
  int? reps;
  double? weightKg;
  int? durationSec;
  int? rpe;

  /// Rest taken before this set, in seconds. Logged in the new logger's rest
  /// column; the backend `workoutSetSchema` accepts it.
  int? restSec;
  int? stepsCount;

  /// Local-only "the user has finished entering this set" flag, driving the
  /// guided logger (completed/skipped rows vs the one active set). It is NOT sent
  /// on the wire — the server tracks set values + the exercise-level completion,
  /// not per-set done state — but it IS persisted in the offline full-json so a
  /// restored draft re-opens at the same set. A completed set with saveable values
  /// reads as "done"; completed with none reads as "skipped".
  bool isCompleted;

  /// True when this set carries at least one logged metric — the single source of
  /// truth behind the save filter ([isSaveableSet]) and the done-vs-skipped split.
  bool get hasValue =>
      (reps ?? 0) > 0 ||
      (weightKg ?? 0) > 0 ||
      (durationSec ?? 0) > 0 ||
      (stepsCount ?? 0) > 0;

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
        if (restSec != null && restSec! > 0) 'restSec': restSec,
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
        'restSec': restSec,
        'stepsCount': stepsCount,
        'isCompleted': isCompleted,
      };

  factory DraftSet.fromFullJson(Map<String, dynamic> j) => DraftSet(
        setNumber: (j['setNumber'] as num?)?.toInt() ?? 1,
        reps: (j['reps'] as num?)?.toInt(),
        weightKg: (j['weightKg'] as num?)?.toDouble(),
        durationSec: (j['durationSec'] as num?)?.toInt(),
        rpe: (j['rpe'] as num?)?.toInt(),
        restSec: (j['restSec'] as num?)?.toInt(),
        stepsCount: (j['stepsCount'] as num?)?.toInt(),
        isCompleted: j['isCompleted'] as bool? ?? false,
      );

  factory DraftSet.fromEntry(WorkoutSetEntry e) => DraftSet(
        setNumber: e.setNumber,
        reps: e.reps,
        weightKg: e.weightKg,
        durationSec: e.durationSec,
        rpe: e.rpe,
        restSec: e.restSec,
        stepsCount: e.stepsCount,
        // A set coming back from the server has already been logged — show it as a
        // completed row in the guided logger, not the active set being entered.
        isCompleted: true,
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

  /// Index of the set currently being entered in the guided logger — the first
  /// set the user hasn't finished. Null once every set is resolved.
  int? get activeSetIndex {
    for (var i = 0; i < sets.length; i++) {
      if (!sets[i].isCompleted) return i;
    }
    return null;
  }

  /// Sets finished *with* values (skipped sets excluded) — the "X" in "X of N".
  int get loggedSetCount =>
      sets.where((s) => s.isCompleted && s.hasValue).length;

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

/// Heaviest weight lifted this session minus last session's heaviest, or null
/// when either side has no weight — drives the guided logger's "↑ +Xkg"
/// improvement callout (positive = heavier than last time).
double? improvementKg(List<DraftSet> current, List<LastSetSnapshot> last) {
  double? best(Iterable<double?> ws) {
    double? m;
    for (final w in ws) {
      if (w != null && w > 0 && (m == null || w > m)) m = w;
    }
    return m;
  }

  final cur = best(current.map((s) => s.weightKg));
  final prev = best(last.map((s) => s.weightKg));
  if (cur == null || prev == null) return null;
  return cur - prev;
}
