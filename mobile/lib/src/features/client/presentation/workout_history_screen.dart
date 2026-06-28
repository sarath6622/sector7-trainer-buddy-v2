import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/feedback/haptics.dart';
import '../../../core/util/formatters.dart';
import '../data/progress_models.dart';
import '../../../core/widgets/skeleton.dart';
import '../data/client_repository.dart';
import 'widgets/client_widgets.dart';

class WorkoutHistoryScreen extends ConsumerWidget {
  const WorkoutHistoryScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final history = ref.watch(workoutHistoryProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Workout history')),
      body: RefreshIndicator(
        onRefresh: () => Haptics.onRefresh(() => ref.refresh(workoutHistoryProvider.future)),
        child: history.when(
          loading: () => const SkeletonList(),
          error: (e, _) => ListView(
            children: [
              const SizedBox(height: 120),
              ErrorRetry(
                message: e.toString(),
                onRetry: () => ref.invalidate(workoutHistoryProvider),
              ),
            ],
          ),
          data: (items) {
            if (items.isEmpty) {
              return ListView(
                children: const [
                  SizedBox(height: 120),
                  EmptyState(
                    icon: Icons.fitness_center,
                    message: 'No workouts logged yet.',
                  ),
                ],
              );
            }
            final groups = _groupBySession(items);
            return ListView.builder(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
              itemCount: groups.length,
              itemBuilder: (_, i) => _SessionGroupCard(group: groups[i]),
            );
          },
        ),
      ),
    );
  }

  /// Collapse the flat, date-desc feed into per-session groups, preserving order.
  static List<_SessionGroup> _groupBySession(List<WorkoutHistoryEntry> items) {
    final groups = <_SessionGroup>[];
    for (final e in items) {
      if (groups.isEmpty || groups.last.sessionId != e.sessionId) {
        groups.add(_SessionGroup(
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
}

class _SessionGroup {
  _SessionGroup({
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

class _SessionGroupCard extends StatelessWidget {
  const _SessionGroupCard({required this.group});
  final _SessionGroup group;

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
