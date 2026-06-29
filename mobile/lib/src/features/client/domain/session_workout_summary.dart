/// Pure, client-side roll-up of one logged session's exercises — derived from
/// the `/api/client/workouts` feed with **zero backend work**. Drives the
/// Session-History cards on the Sessions tab: a muscle thumbnail, a derived
/// title, the exercise count, and total training volume.
///
/// The workout endpoint exposes each logged exercise's muscle group + sets, so
/// for *completed* sessions we know exactly what was trained (unlike a future
/// session, where the trainer hasn't decided yet — hence no thumbnail/title
/// upstream of this).
library;

import '../../workout/data/muscle_groups.dart';
import '../data/client_models.dart';

class SessionWorkoutSummary {
  const SessionWorkoutSummary({
    required this.exerciseCount,
    required this.totalVolumeKg,
    required this.topGroupIds,
  });

  /// Number of logged exercises in the session.
  final int exerciseCount;

  /// Σ (weightKg × reps) over value-bearing sets — mirrors the workout logger's
  /// per-exercise volume math. Zero for pure bodyweight / cardio sessions.
  final double totalVolumeKg;

  /// Curated muscle-group ids trained, most-exercised first (ties broken by the
  /// canonical group order). Empty when no exercise carries a known group.
  final List<String> topGroupIds;

  String? get primaryGroupId => topGroupIds.isEmpty ? null : topGroupIds.first;

  /// Bundled anatomical art for the most-trained group, or null.
  String? get imageAsset {
    final id = primaryGroupId;
    return id == null ? null : curatedGroupImages[id];
  }

  /// A human session title from the trained groups: one group → its label
  /// ("Chest"), two → "Chest & Back", three or more → "Full Body". Null when no
  /// group is known (caller falls back to a generic label).
  String? get title {
    final labels = topGroupIds
        .map((id) => curatedGroupById[id]?.label)
        .whereType<String>()
        .toList();
    if (labels.isEmpty) return null;
    if (labels.length == 1) return labels.first;
    if (labels.length >= 3) return 'Full Body';
    return '${labels[0]} & ${labels[1]}';
  }
}

/// Roll up a session's logged exercises into a [SessionWorkoutSummary].
SessionWorkoutSummary summarizeSession(List<WorkoutLogEntry> logs) {
  var volume = 0.0;
  final counts = <String, int>{}; // curated id → exercise count
  for (final log in logs) {
    for (final s in log.sets) {
      final w = s.weightKg ?? 0;
      final r = (s.reps ?? 0).toDouble();
      if (w > 0 && r > 0) volume += w * r;
    }
    final mg = log.muscleGroup;
    final id = mg == null ? null : curatedGroupOf(mg);
    if (id != null) counts[id] = (counts[id] ?? 0) + 1;
  }
  final sorted = counts.keys.toList()
    ..sort((a, b) {
      final byCount = counts[b]!.compareTo(counts[a]!);
      if (byCount != 0) return byCount;
      return allCuratedGroupIds.indexOf(a).compareTo(allCuratedGroupIds.indexOf(b));
    });
  return SessionWorkoutSummary(
    exerciseCount: logs.length,
    totalVolumeKg: volume,
    topGroupIds: sorted,
  );
}
