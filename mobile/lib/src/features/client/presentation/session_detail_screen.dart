import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/util/formatters.dart';
import '../data/client_models.dart';
import '../data/client_repository.dart';
import 'widgets/client_widgets.dart';
import 'widgets/reschedule_sheet.dart';

class SessionDetailScreen extends ConsumerWidget {
  const SessionDetailScreen({super.key, required this.sessionId});
  final String sessionId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final detail = ref.watch(clientSessionProvider(sessionId));

    return Scaffold(
      appBar: AppBar(title: const Text('Session')),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(clientSessionProvider(sessionId).future),
        child: detail.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ListView(
            children: [
              const SizedBox(height: 120),
              ErrorRetry(
                message: e.toString(),
                onRetry: () => ref.invalidate(clientSessionProvider(sessionId)),
              ),
            ],
          ),
          data: (d) => _DetailBody(detail: d),
        ),
      ),
    );
  }
}

class _DetailBody extends StatelessWidget {
  const _DetailBody({required this.detail});
  final SessionDetail detail;

  @override
  Widget build(BuildContext context) {
    final s = detail.summary;
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
      children: [
        // Header card: date, time, status, trainer, duration.
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        Fmt.dayMonthYear(s.scheduledDate),
                        style: Theme.of(context)
                            .textTheme
                            .titleLarge
                            ?.copyWith(fontWeight: FontWeight.w700),
                      ),
                    ),
                    StatusChip(status: s.status),
                  ],
                ),
                const SizedBox(height: 12),
                _MetaRow(icon: Icons.schedule, text: Fmt.time(s.scheduledTime)),
                _MetaRow(
                  icon: Icons.timer_outlined,
                  text: s.actualDurationMin != null
                      ? '${s.actualDurationMin} min (actual)'
                      : '${s.durationMin} min (planned)',
                ),
                if (s.trainerName != null)
                  _MetaRow(icon: Icons.person_pin, text: s.trainerName!),
                if (s.isCarryForward)
                  const _MetaRow(
                    icon: Icons.move_down,
                    text: 'Carried forward from a previous month',
                  ),
                if (s.notes != null && s.notes!.isNotEmpty)
                  _MetaRow(icon: Icons.sticky_note_2_outlined, text: s.notes!),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),

        if (s.status == SessionStatus.scheduled ||
            s.status == SessionStatus.inProgress ||
            s.status == SessionStatus.completed) ...[
          FilledButton.icon(
            onPressed: () async {
              final saved =
                  await context.push<bool>('/client/sessions/${s.id}/log');
              if (saved == true && context.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Workout saved')),
                );
              }
            },
            icon: const Icon(Icons.fitness_center),
            label: Text(
              s.status == SessionStatus.completed ? 'Edit workout' : 'Log workout',
            ),
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(46)),
          ),
          const SizedBox(height: 12),
        ],

        if (s.status == SessionStatus.scheduled) ...[
          OutlinedButton.icon(
            onPressed: () async {
              final ok = await showRescheduleSheet(context, s);
              if (ok && context.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Reschedule request submitted')),
                );
              }
            },
            icon: const Icon(Icons.event_repeat),
            label: const Text('Request reschedule'),
            style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(46)),
          ),
          const SizedBox(height: 16),
        ],

        SectionHeader(title: 'Workout (${detail.workoutLogs.length})'),
        if (detail.workoutLogs.isEmpty)
          const Card(
            child: Padding(
              padding: EdgeInsets.all(24),
              child: EmptyState(
                icon: Icons.fitness_center,
                message: 'No exercises logged for this session.',
              ),
            ),
          )
        else
          for (final log in detail.workoutLogs) _WorkoutLogCard(log: log),
      ],
    );
  }
}

class _MetaRow extends StatelessWidget {
  const _MetaRow({required this.icon, required this.text});
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: Theme.of(context).colorScheme.onSurfaceVariant),
          const SizedBox(width: 10),
          Expanded(child: Text(text)),
        ],
      ),
    );
  }
}

class _WorkoutLogCard extends StatelessWidget {
  const _WorkoutLogCard({required this.log});
  final WorkoutLogEntry log;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    log.exerciseName,
                    style: Theme.of(context)
                        .textTheme
                        .titleMedium
                        ?.copyWith(fontWeight: FontWeight.w700),
                  ),
                ),
                if (log.isCompleted)
                  Icon(Icons.check_circle, size: 18, color: Colors.green.shade300),
              ],
            ),
            if (log.muscleGroup != null)
              Text(
                log.muscleGroup!,
                style: Theme.of(context)
                    .textTheme
                    .bodySmall
                    ?.copyWith(color: scheme.onSurfaceVariant),
              ),
            const SizedBox(height: 10),
            if (log.sets.isEmpty)
              Text(
                'No sets recorded',
                style: Theme.of(context)
                    .textTheme
                    .bodySmall
                    ?.copyWith(color: scheme.onSurfaceVariant),
              )
            else
              for (final set in log.sets)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 2),
                  child: Row(
                    children: [
                      SizedBox(
                        width: 28,
                        child: Text(
                          '${set.setNumber}',
                          style: TextStyle(
                            color: scheme.onSurfaceVariant,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                      Expanded(child: Text(set.summary)),
                      if (set.rpe != null)
                        Text(
                          'RPE ${set.rpe}',
                          style: Theme.of(context)
                              .textTheme
                              .bodySmall
                              ?.copyWith(color: scheme.onSurfaceVariant),
                        ),
                    ],
                  ),
                ),
          ],
        ),
      ),
    );
  }
}
