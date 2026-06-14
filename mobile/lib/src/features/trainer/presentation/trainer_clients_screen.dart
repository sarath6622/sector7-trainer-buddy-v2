import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/util/formatters.dart';
import '../../client/presentation/widgets/client_widgets.dart';
import '../data/trainer_models.dart';
import '../data/trainer_repository.dart';

/// Trainer "Clients" tab — the active roster (primary + temporarily reassigned)
/// with this-month session stats and a measurement-overdue flag. Tapping a card
/// with an upcoming session jumps to that session's detail.
class TrainerClientsScreen extends ConsumerWidget {
  const TrainerClientsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final clients = ref.watch(trainerClientsProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Clients')),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(trainerClientsProvider.future),
        child: clients.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ListView(
            children: [
              const SizedBox(height: 120),
              ErrorRetry(
                message: e.toString(),
                onRetry: () => ref.invalidate(trainerClientsProvider),
              ),
            ],
          ),
          data: (list) {
            if (list.isEmpty) {
              return ListView(
                children: const [
                  SizedBox(height: 120),
                  EmptyState(
                    icon: Icons.people_outline,
                    message: 'No active clients.',
                  ),
                ],
              );
            }
            return ListView(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
              children: [for (final c in list) _ClientCard(client: c)],
            );
          },
        ),
      ),
    );
  }
}

class _ClientCard extends StatelessWidget {
  const _ClientCard({required this.client});
  final TrainerClient client;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final next = client.nextSession;
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => context.push(
          '/trainer/clients/${client.clientProfileId}',
          extra: client,
        ),
        child: Padding(
          padding: const EdgeInsets.all(14),
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
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
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
                  if (client.isReassigned) const _Tag(label: 'Reassigned'),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  _Stat(label: 'Done', value: '${client.stats.completed}'),
                  _Stat(label: 'Scheduled', value: '${client.stats.scheduled}'),
                  _Stat(label: 'No-show', value: '${client.stats.noShow}'),
                ],
              ),
              if (client.measurementStale) ...[
                const SizedBox(height: 10),
                Row(
                  children: [
                    Icon(Icons.straighten,
                        size: 16, color: Colors.orange.shade300),
                    const SizedBox(width: 6),
                    Text(
                      'Measurements overdue',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: Colors.orange.shade300,
                          ),
                    ),
                  ],
                ),
              ],
              if (next != null) ...[
                const SizedBox(height: 10),
                Row(
                  children: [
                    Icon(Icons.event, size: 16, color: scheme.onSurfaceVariant),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        'Next: ${Fmt.dateTime(next.scheduledDate, next.scheduledTime)}',
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                              color: scheme.onSurfaceVariant,
                            ),
                      ),
                    ),
                    Icon(Icons.chevron_right,
                        size: 18, color: scheme.onSurfaceVariant),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.label, required this.value});
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

class _Tag extends StatelessWidget {
  const _Tag({required this.label});
  final String label;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: scheme.tertiary.withValues(alpha: 0.18),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: scheme.tertiary,
          fontSize: 11,
          fontWeight: FontWeight.w600,
        ),
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
      radius: 22,
      backgroundColor: scheme.surfaceContainerHighest,
      foregroundImage: (url != null && url!.isNotEmpty) ? NetworkImage(url!) : null,
      child: Text(
        initials.isEmpty ? '?' : initials,
        style: TextStyle(color: scheme.onSurfaceVariant, fontWeight: FontWeight.w700),
      ),
    );
  }
}
