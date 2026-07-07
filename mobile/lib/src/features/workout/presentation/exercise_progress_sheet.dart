import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/widgets/skeleton.dart';
import '../../client/presentation/widgets/client_widgets.dart';
import '../../client/presentation/widgets/metric_line_chart.dart';
import '../data/workout_repository.dart';

/// Bottom sheet showing one exercise's progression across the client's past
/// sessions (max weight / reps / duration / steps depending on type). Read-only.
Future<void> showExerciseProgressSheet(
  BuildContext context, {
  required String clientProfileId,
  required String exerciseId,
  required String exerciseName,
  required String exerciseType,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => _ExerciseProgressSheet(
      clientProfileId: clientProfileId,
      exerciseId: exerciseId,
      exerciseName: exerciseName,
      exerciseType: exerciseType,
    ),
  );
}

/// Tooltip/axis unit for the charted metric, derived from the exercise type so
/// it matches what the server returns for this exercise.
String _unitFor(String type) => switch (type) {
      'WEIGHTED' => ' kg',
      'BODYWEIGHT' => ' reps',
      'DURATION' => 's',
      _ => '', // CARDIO (steps/distance) — keep the number bare
    };

String _metricLabel(String type) => switch (type) {
      'WEIGHTED' => 'Top set weight per session',
      'BODYWEIGHT' => 'Top set reps per session',
      'DURATION' => 'Longest set per session',
      _ => 'Best per session',
    };

class _ExerciseProgressSheet extends ConsumerWidget {
  const _ExerciseProgressSheet({
    required this.clientProfileId,
    required this.exerciseId,
    required this.exerciseName,
    required this.exerciseType,
  });

  final String clientProfileId;
  final String exerciseId;
  final String exerciseName;
  final String exerciseType;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    final async = ref.watch(exerciseProgressProvider(
      (clientProfileId: clientProfileId, exerciseId: exerciseId),
    ));

    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.trending_up, color: scheme.primary, size: 20),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    exerciseName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context)
                        .textTheme
                        .titleMedium
                        ?.copyWith(fontWeight: FontWeight.w700),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 2),
            Text(
              _metricLabel(exerciseType),
              style: Theme.of(context)
                  .textTheme
                  .bodySmall
                  ?.copyWith(color: scheme.onSurfaceVariant),
            ),
            const SizedBox(height: 16),
            SizedBox(
              height: 240,
              child: async.when(
                loading: () => const Shimmer(
                  child: Bone(width: double.infinity, height: 240, radius: 16),
                ),
                error: (e, _) => ErrorRetry(
                  message: e.toString(),
                  onRetry: () => ref.invalidate(exerciseProgressProvider(
                    (clientProfileId: clientProfileId, exerciseId: exerciseId),
                  )),
                ),
                data: (points) => points.length < 2
                    ? EmptyState(
                        icon: Icons.show_chart,
                        message: points.isEmpty
                            ? 'No history yet for this exercise.'
                            : 'Log it in one more session to see a trend.',
                      )
                    : Padding(
                        padding: const EdgeInsets.only(top: 8, right: 8),
                        child: MetricLineChart(points: points, unit: _unitFor(exerciseType)),
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
