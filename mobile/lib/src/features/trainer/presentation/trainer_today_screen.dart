import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/util/formatters.dart';
import '../../client/data/client_models.dart';
import '../../client/presentation/widgets/client_widgets.dart';
import '../data/trainer_models.dart';
import '../data/trainer_repository.dart';
import 'widgets/trainer_actions.dart';
import 'widgets/trainer_session_tile.dart';

/// Trainer "Today" tab — the gym-floor driver: today's sessions with inline
/// Start / End quick actions; tap a row for the full detail + workout logger.
class TrainerTodayScreen extends ConsumerWidget {
  const TrainerTodayScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final today = ref.watch(trainerTodayProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Today'),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(20),
          child: Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Text(
              Fmt.dayMonthYear(DateTime.now()),
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
            ),
          ),
        ),
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(trainerTodayProvider.future),
        child: today.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ListView(
            children: [
              const SizedBox(height: 120),
              ErrorRetry(
                message: e.toString(),
                onRetry: () => ref.invalidate(trainerTodayProvider),
              ),
            ],
          ),
          data: (sessions) {
            if (sessions.isEmpty) {
              return ListView(
                children: const [
                  SizedBox(height: 120),
                  EmptyState(
                    icon: Icons.event_available,
                    message: 'No sessions scheduled for today.',
                  ),
                ],
              );
            }
            final done = sessions
                .where((s) =>
                    s.status == SessionStatus.completed ||
                    s.status == SessionStatus.noShow)
                .length;
            return ListView(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
              children: [
                Text(
                  '${sessions.length} session${sessions.length == 1 ? '' : 's'} · $done done',
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                ),
                const SizedBox(height: 12),
                for (final s in sessions)
                  TrainerSessionTile(
                    session: s,
                    onTap: () => context.push('/trainer/sessions/${s.id}'),
                    trailing: _QuickAction(session: s),
                  ),
              ],
            );
          },
        ),
      ),
    );
  }
}

/// Inline primary action for a Today row: Start a scheduled session, End a live
/// one. Other statuses fall back to the tile's default chevron.
class _QuickAction extends ConsumerStatefulWidget {
  const _QuickAction({required this.session});
  final TrainerSession session;

  @override
  ConsumerState<_QuickAction> createState() => _QuickActionState();
}

class _QuickActionState extends ConsumerState<_QuickAction> {
  bool _busy = false;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final status = widget.session.status;

    if (status != SessionStatus.scheduled &&
        status != SessionStatus.inProgress) {
      return Icon(Icons.chevron_right, color: scheme.onSurfaceVariant);
    }

    if (_busy) {
      return const SizedBox(
        width: 84,
        height: 36,
        child: Center(
          child: SizedBox(
            width: 18,
            height: 18,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
        ),
      );
    }

    final isScheduled = status == SessionStatus.scheduled;
    return SizedBox(
      width: 84,
      child: isScheduled
          ? FilledButton(
              onPressed: () => _run(TrainerSessionActions.start),
              style: FilledButton.styleFrom(
                padding: const EdgeInsets.symmetric(horizontal: 8),
              ),
              child: const Text('Start'),
            )
          : FilledButton.tonal(
              onPressed: () => _run(TrainerSessionActions.end),
              style: FilledButton.styleFrom(
                padding: const EdgeInsets.symmetric(horizontal: 8),
              ),
              child: const Text('End'),
            ),
    );
  }

  Future<void> _run(
    Future<bool> Function(BuildContext, WidgetRef, String) action,
  ) async {
    setState(() => _busy = true);
    await action(context, ref, widget.session.id);
    if (mounted) setState(() => _busy = false);
  }
}
