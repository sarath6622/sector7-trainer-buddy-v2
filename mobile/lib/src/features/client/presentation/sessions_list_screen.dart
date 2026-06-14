import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/util/formatters.dart';
import '../data/client_models.dart';
import '../data/client_repository.dart';
import 'widgets/client_widgets.dart';

class SessionsListScreen extends ConsumerWidget {
  const SessionsListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sessions = ref.watch(clientSessionsProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Sessions')),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(clientSessionsProvider.future),
        child: sessions.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ListView(
            children: [
              const SizedBox(height: 120),
              ErrorRetry(
                message: e.toString(),
                onRetry: () => ref.invalidate(clientSessionsProvider),
              ),
            ],
          ),
          data: (all) {
            if (all.isEmpty) {
              return ListView(
                children: const [
                  SizedBox(height: 120),
                  EmptyState(
                    icon: Icons.event_busy,
                    message: 'No sessions yet.\nYour trainer will book them here.',
                  ),
                ],
              );
            }

            const upcomingStatuses = {
              SessionStatus.scheduled,
              SessionStatus.inProgress,
            };
            final upcoming =
                all.where((s) => upcomingStatuses.contains(s.status)).toList();
            // History newest-first (API returns ascending by date).
            final history = all
                .where((s) => !upcomingStatuses.contains(s.status))
                .toList()
                .reversed
                .toList();

            return ListView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
              children: [
                if (upcoming.isNotEmpty) ...[
                  SectionHeader(title: 'Upcoming (${upcoming.length})'),
                  for (final s in upcoming) _SessionTile(session: s),
                  const SizedBox(height: 16),
                ],
                if (history.isNotEmpty) ...[
                  SectionHeader(title: 'History (${history.length})'),
                  for (final s in history) _SessionTile(session: s),
                ],
              ],
            );
          },
        ),
      ),
    );
  }
}

class _SessionTile extends StatelessWidget {
  const _SessionTile({required this.session});
  final SessionSummary session;

  @override
  Widget build(BuildContext context) {
    final s = session;
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        onTap: () => context.push('/client/sessions/${s.id}'),
        leading: CircleAvatar(
          backgroundColor:
              Theme.of(context).colorScheme.surfaceContainerHighest,
          child: Icon(
            s.status.isLive ? Icons.play_arrow : Icons.event,
            color: Theme.of(context).colorScheme.onSurfaceVariant,
          ),
        ),
        title: Text(Fmt.dayMonthYear(s.scheduledDate)),
        subtitle: Text(
          [
            Fmt.time(s.scheduledTime),
            if (s.trainerName != null) s.trainerName!,
            if (s.isCarryForward) 'carry-forward',
          ].join(' · '),
        ),
        trailing: StatusChip(status: s.status),
      ),
    );
  }
}
