import 'package:flutter/material.dart';

import '../../../../core/util/formatters.dart';
import '../../data/progress_models.dart';

/// One PT session's worth of logged exercises (the flat workout feed collapsed
/// by session, preserving date-desc order).
class WorkoutSessionGroup {
  WorkoutSessionGroup({
    required this.sessionId,
    required this.date,
    required this.time,
    required this.trainerName,
    required this.entries,
  });
  final String sessionId;
  final DateTime? date;
  final String time;
  final String? trainerName;
  final List<WorkoutHistoryEntry> entries;
}

/// Collapse the flat, date-desc workout feed into per-session groups.
List<WorkoutSessionGroup> groupWorkoutsBySession(
  List<WorkoutHistoryEntry> items,
) {
  final groups = <WorkoutSessionGroup>[];
  for (final e in items) {
    if (groups.isEmpty || groups.last.sessionId != e.sessionId) {
      groups.add(WorkoutSessionGroup(
        sessionId: e.sessionId,
        date: e.sessionDate,
        time: e.scheduledTime,
        trainerName: e.trainerName,
        entries: [e],
      ));
    } else {
      groups.last.entries.add(e);
    }
  }
  return groups;
}

/// A card showing one session's date/trainer header and its exercise rows.
/// Shared by the Workout-history screen and the Progress → Workouts tab.
class WorkoutSessionGroupCard extends StatelessWidget {
  const WorkoutSessionGroupCard({super.key, required this.group});
  final WorkoutSessionGroup group;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.event, size: 18, color: scheme.onSurfaceVariant),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    Fmt.dayMonthYear(group.date),
                    style: Theme.of(context)
                        .textTheme
                        .titleMedium
                        ?.copyWith(fontWeight: FontWeight.w700),
                  ),
                ),
                Text(
                  '${group.entries.length} exercise${group.entries.length == 1 ? '' : 's'}',
                  style: Theme.of(context)
                      .textTheme
                      .bodySmall
                      ?.copyWith(color: scheme.onSurfaceVariant),
                ),
              ],
            ),
            if (group.trainerName != null)
              Padding(
                padding: const EdgeInsets.only(left: 26, top: 2),
                child: Text(
                  'with ${group.trainerName}',
                  style: Theme.of(context)
                      .textTheme
                      .bodySmall
                      ?.copyWith(color: scheme.onSurfaceVariant),
                ),
              ),
            const Divider(height: 20),
            for (final e in group.entries) _ExerciseRow(entry: e),
          ],
        ),
      ),
    );
  }
}

class _ExerciseRow extends StatelessWidget {
  const _ExerciseRow({required this.entry});
  final WorkoutHistoryEntry entry;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final log = entry.log;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  log.exerciseName,
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
              ),
              if (log.muscleGroup != null)
                Text(
                  log.muscleGroup!,
                  style: Theme.of(context)
                      .textTheme
                      .bodySmall
                      ?.copyWith(color: scheme.onSurfaceVariant),
                ),
            ],
          ),
          const SizedBox(height: 2),
          if (log.sets.isEmpty)
            Text(
              'No sets recorded',
              style: Theme.of(context)
                  .textTheme
                  .bodySmall
                  ?.copyWith(color: scheme.onSurfaceVariant),
            )
          else
            Text(
              log.sets.map((s) => s.summary).join('  ·  '),
              style: Theme.of(context)
                  .textTheme
                  .bodySmall
                  ?.copyWith(color: scheme.onSurfaceVariant),
            ),
        ],
      ),
    );
  }
}
