/// Canonical "save payload" + scoped diff for the shared workout write path.
///
/// The server reconciles a normalized list of exercises. To survive a peer's
/// concurrent edit (ADR-036 made the write shared between trainer and client),
/// the client tells the server which exercises it actually changed since its
/// last sync (ADR-041) instead of replacing the whole snapshot. This file is
/// the Flutter mirror of the web logger's `buildSavePayload` + `diffExercises`.
library;

import 'dart:convert';

import 'workout_draft.dart';

/// True when a set carries at least one logged metric and should be persisted.
/// Half-typed / empty rows are dropped so they don't churn the diff or get
/// saved as noise (mirrors the logger's pre-save filter + web `isSetComplete`).
bool isSaveableSet(DraftSet s) => s.hasValue;

/// Normalized wire payload for a session: every exercise the user added (its
/// half-typed/empty sets filtered out, the rest renumbered 1-based), `orderIndex`
/// dense from 0. An exercise with no logged set is still emitted as a *structural
/// row* (`sets: []`) — the server explicitly supports this so an added-but-not-yet-
/// logged exercise survives navigation/reopen (matches the web `buildSavePayload`).
/// Built identically for the current draft and the last-synced baseline so
/// [diffExercises] compares like-for-like and an unchanged draft diffs to nothing
/// (a net-zero re-post).
List<Map<String, dynamic>> buildSavePayload(List<DraftExercise> drafts) {
  final out = <Map<String, dynamic>>[];
  var order = 0;
  for (final d in drafts) {
    final sets = d.sets.where(isSaveableSet).toList();
    out.add({
      'exerciseId': d.exerciseId,
      'orderIndex': order,
      'isCompleted': d.isCompleted,
      'sets': [
        for (var i = 0; i < sets.length; i++) sets[i].toJson(i + 1),
      ],
    });
    order++;
  }
  return out;
}

/// Decode a stored baseline back into the save-payload shape [diffExercises]
/// expects (`jsonDecode` already preserves the canonical key order).
List<Map<String, dynamic>> decodeSavePayload(String json) => [
      for (final e in (jsonDecode(json) as List)) Map<String, dynamic>.from(e as Map),
    ];

/// The scoped-write fields derived from `diff(baseline, current)`.
class WorkoutDiff {
  const WorkoutDiff({
    required this.dirtyExerciseIds,
    required this.removedExerciseIds,
    required this.removedSetsByExerciseId,
  });

  /// Exercises whose values changed or are brand new — the server reconciles
  /// only these (upsert sets + drop the ones removed within).
  final List<String> dirtyExerciseIds;

  /// Exercises that were saved before but the user has since deleted — the
  /// server drops exactly these logs.
  final List<String> removedExerciseIds;

  /// Per dirty exercise, the set numbers this device explicitly removed. The
  /// server's per-set merge deletes ONLY these, so a peer's concurrent rows in
  /// the same exercise survive a save from a stale copy.
  final Map<String, List<int>> removedSetsByExerciseId;

  /// Nothing changed → no POST needed (net-zero).
  bool get isEmpty => dirtyExerciseIds.isEmpty && removedExerciseIds.isEmpty;
}

/// Diff the last-synced [baseline] against the [current] payload. Exercises the
/// writer didn't touch are absent from every list, so they're left alone on the
/// server. Both inputs MUST come from [buildSavePayload] (stable key order makes
/// the JSON equality check reliable).
WorkoutDiff diffExercises(
  List<Map<String, dynamic>> baseline,
  List<Map<String, dynamic>> current,
) {
  final lastById = {
    for (final e in baseline) e['exerciseId'] as String: e,
  };
  final currentIds = {for (final e in current) e['exerciseId'] as String};

  final dirty = current
      .where((e) => jsonEncode(lastById[e['exerciseId']]) != jsonEncode(e))
      .toList();

  final removedExerciseIds = [
    for (final e in baseline)
      if (!currentIds.contains(e['exerciseId'])) e['exerciseId'] as String,
  ];

  final removedSetsByExerciseId = <String, List<int>>{};
  for (final e in dirty) {
    final prev = lastById[e['exerciseId']];
    if (prev == null) continue; // brand new exercise — no prior sets to drop.
    final currentSetNums = {
      for (final s in (e['sets'] as List)) (s as Map)['setNumber'] as int,
    };
    final removed = [
      for (final s in (prev['sets'] as List))
        if (!currentSetNums.contains((s as Map)['setNumber'] as int))
          s['setNumber'] as int,
    ];
    if (removed.isNotEmpty) {
      removedSetsByExerciseId[e['exerciseId'] as String] = removed;
    }
  }

  return WorkoutDiff(
    dirtyExerciseIds: [for (final e in dirty) e['exerciseId'] as String],
    removedExerciseIds: removedExerciseIds,
    removedSetsByExerciseId: removedSetsByExerciseId,
  );
}
