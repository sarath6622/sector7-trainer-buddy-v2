import 'package:flutter/material.dart' hide Badge;
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/util/formatters.dart';
import '../../client/data/client_extras_models.dart';
import '../../client/data/progress_models.dart';
import '../../../core/widgets/skeleton.dart';
import '../../client/presentation/widgets/client_widgets.dart';
import '../data/trainer_models.dart';
import '../data/trainer_repository.dart';

/// Trainer "client detail" — a read-only snapshot (v1): a header with this
/// client's month stats, their latest body measurements, earned badges, and
/// recent workout sessions. Reached by tapping a card on the Clients tab; the
/// [TrainerClient] is passed through `extra` for the header, with the heavy data
/// fetched by [trainerClientDetailProvider].
class TrainerClientDetailScreen extends ConsumerWidget {
  const TrainerClientDetailScreen({
    super.key,
    required this.clientProfileId,
    this.client,
  });

  final String clientProfileId;
  final TrainerClient? client;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final detail = ref.watch(trainerClientDetailProvider(clientProfileId));

    return Scaffold(
      appBar: AppBar(title: Text(client?.name ?? 'Client')),
      body: RefreshIndicator(
        onRefresh: () =>
            ref.refresh(trainerClientDetailProvider(clientProfileId).future),
        child: detail.when(
          loading: () => const SkeletonList(),
          error: (e, _) => ListView(
            children: [
              const SizedBox(height: 120),
              ErrorRetry(
                message: e.toString(),
                onRetry: () =>
                    ref.invalidate(trainerClientDetailProvider(clientProfileId)),
              ),
            ],
          ),
          data: (d) => ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
            children: [
              if (client != null) _Header(client: client!),
              const SizedBox(height: 8),
              const SectionHeader(title: 'Latest measurements'),
              _MeasurementsCard(entry: d.latestProgress),
              const SizedBox(height: 16),
              SectionHeader(title: 'Badges (${d.badges.earned.length})'),
              _BadgesWrap(earned: d.badges.earned),
              const SizedBox(height: 16),
              const SectionHeader(title: 'Recent workouts'),
              if (d.history.isEmpty)
                const EmptyState(
                  icon: Icons.fitness_center,
                  message: 'No logged workouts yet.',
                )
              else
                for (final s in d.history) _WorkoutSessionCard(session: s),
            ],
          ),
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.client});
  final TrainerClient client;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final stats = client.stats;
    return Card(
      color: scheme.surfaceContainerHigh,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                _Avatar(name: client.name, url: client.photoUrl),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        client.name,
                        style: Theme.of(context)
                            .textTheme
                            .titleMedium
                            ?.copyWith(fontWeight: FontWeight.w700),
                      ),
                      if (client.phone != null)
                        Text(
                          client.phone!,
                          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                color: scheme.onSurfaceVariant,
                              ),
                        ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            Row(
              children: [
                _MiniStat(label: 'Done', value: '${stats.completed}'),
                _MiniStat(label: 'Scheduled', value: '${stats.scheduled}'),
                _MiniStat(label: 'No-show', value: '${stats.noShow}'),
                _MiniStat(label: 'Left', value: '${stats.remaining}'),
              ],
            ),
            if (client.measurementStale) ...[
              const SizedBox(height: 12),
              Row(
                children: [
                  Icon(Icons.straighten, size: 16, color: Colors.orange.shade300),
                  const SizedBox(width: 6),
                  Text(
                    'Measurements overdue',
                    style: Theme.of(context)
                        .textTheme
                        .bodySmall
                        ?.copyWith(color: Colors.orange.shade300),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _MeasurementsCard extends StatelessWidget {
  const _MeasurementsCard({required this.entry});
  final ProgressEntry? entry;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final measurements = entry?.measurements ?? const [];
    if (entry == null || measurements.isEmpty) {
      return Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Text(
            'No measurements recorded.',
            style: Theme.of(context)
                .textTheme
                .bodyMedium
                ?.copyWith(color: scheme.onSurfaceVariant),
          ),
        ),
      );
    }
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Recorded ${Fmt.dayMonthYear(entry!.recordedAt)}',
              style: Theme.of(context)
                  .textTheme
                  .bodySmall
                  ?.copyWith(color: scheme.onSurfaceVariant),
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 12,
              runSpacing: 12,
              children: [
                for (final m in measurements)
                  SizedBox(
                    width: 88,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          m.value,
                          style: Theme.of(context)
                              .textTheme
                              .titleMedium
                              ?.copyWith(fontWeight: FontWeight.w700),
                        ),
                        Text(
                          m.label,
                          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                color: scheme.onSurfaceVariant,
                              ),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _BadgesWrap extends StatelessWidget {
  const _BadgesWrap({required this.earned});
  final List<Badge> earned;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    if (earned.isEmpty) {
      return Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Text(
            'No badges earned yet.',
            style: Theme.of(context)
                .textTheme
                .bodyMedium
                ?.copyWith(color: scheme.onSurfaceVariant),
          ),
        ),
      );
    }
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final b in earned)
          Chip(
            avatar: Text(b.icon, style: const TextStyle(fontSize: 16)),
            label: Text(b.name),
            visualDensity: VisualDensity.compact,
          ),
      ],
    );
  }
}

class _WorkoutSessionCard extends StatelessWidget {
  const _WorkoutSessionCard({required this.session});
  final TrainerWorkoutSession session;

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
                    Fmt.dateTime(session.date, session.time),
                    style: Theme.of(context)
                        .textTheme
                        .titleSmall
                        ?.copyWith(fontWeight: FontWeight.w700),
                  ),
                ),
                StatusChip(status: session.status),
              ],
            ),
            const SizedBox(height: 10),
            if (session.exercises.isEmpty)
              Text(
                'No exercises logged',
                style: Theme.of(context)
                    .textTheme
                    .bodySmall
                    ?.copyWith(color: scheme.onSurfaceVariant),
              )
            else
              for (final ex in session.exercises)
                Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        ex.name,
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      ),
                      Text(
                        ex.sets.isEmpty
                            ? '—'
                            : ex.sets.map((s) => s.summary).join('   '),
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                              color: scheme.onSurfaceVariant,
                            ),
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

class _MiniStat extends StatelessWidget {
  const _MiniStat({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Expanded(
      child: Column(
        children: [
          Text(
            value,
            style: Theme.of(context)
                .textTheme
                .titleLarge
                ?.copyWith(fontWeight: FontWeight.w700),
          ),
          Text(
            label,
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

class _Avatar extends StatelessWidget {
  const _Avatar({required this.name, this.url});
  final String name;
  final String? url;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final initials = name
        .trim()
        .split(RegExp(r'\s+'))
        .where((p) => p.isNotEmpty)
        .take(2)
        .map((p) => p[0].toUpperCase())
        .join();
    return CircleAvatar(
      radius: 24,
      backgroundColor: scheme.surfaceContainerHighest,
      foregroundImage: (url != null && url!.isNotEmpty) ? NetworkImage(url!) : null,
      child: Text(
        initials.isEmpty ? '?' : initials,
        style: TextStyle(color: scheme.onSurfaceVariant, fontWeight: FontWeight.w700),
      ),
    );
  }
}
