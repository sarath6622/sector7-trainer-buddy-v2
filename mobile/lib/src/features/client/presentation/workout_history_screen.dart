import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/feedback/haptics.dart';
import '../../../core/widgets/skeleton.dart';
import '../data/client_repository.dart';
import 'widgets/client_widgets.dart';
import 'widgets/workout_history_list.dart';

class WorkoutHistoryScreen extends ConsumerWidget {
  const WorkoutHistoryScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final history = ref.watch(workoutHistoryProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Workout history')),
      body: RefreshIndicator(
        onRefresh: () =>
            Haptics.onRefresh(() => ref.refresh(workoutHistoryProvider.future)),
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
            final groups = groupWorkoutsBySession(items);
            return ListView.builder(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
              itemCount: groups.length,
              itemBuilder: (_, i) => WorkoutSessionGroupCard(group: groups[i]),
            );
          },
        ),
      ),
    );
  }
}
