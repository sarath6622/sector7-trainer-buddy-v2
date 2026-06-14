import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/realtime/session_realtime.dart';
import '../../../core/util/formatters.dart';
import '../../client/data/client_models.dart';
import '../../client/presentation/widgets/client_widgets.dart';
import '../data/trainer_repository.dart';
import 'widgets/trainer_actions.dart';

/// Trainer view of one session: header + lifecycle actions (start / end /
/// no-show) + the shared workout logger + the logged exercises. Reuses the
/// shared [SessionDetail] model returned by GET /api/trainer/sessions/[id].
class TrainerSessionDetailScreen extends ConsumerStatefulWidget {
  const TrainerSessionDetailScreen({super.key, required this.sessionId});
  final String sessionId;

  @override
  ConsumerState<TrainerSessionDetailScreen> createState() =>
      _TrainerSessionDetailScreenState();
}

class _TrainerSessionDetailScreenState
    extends ConsumerState<TrainerSessionDetailScreen>
    with SessionRealtimeMixin {
  bool _busy = false;

  @override
  String get realtimeSessionId => widget.sessionId;

  @override
  void onSessionChanged() =>
      ref.invalidate(trainerSessionProvider(widget.sessionId));

  @override
  void initState() {
    super.initState();
    startSessionRealtime();
  }

  @override
  void dispose() {
    stopSessionRealtime();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final detail = ref.watch(trainerSessionProvider(widget.sessionId));

    return Scaffold(
      appBar: AppBar(title: const Text('Session')),
      body: RefreshIndicator(
        onRefresh: () =>
            ref.refresh(trainerSessionProvider(widget.sessionId).future),
        child: detail.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ListView(
            children: [
              const SizedBox(height: 120),
              ErrorRetry(
                message: e.toString(),
                onRetry: () =>
                    ref.invalidate(trainerSessionProvider(widget.sessionId)),
              ),
            ],
          ),
          data: (d) => _body(d),
        ),
      ),
    );
  }

  Widget _body(SessionDetail detail) {
    final s = detail.summary;
    final scheme = Theme.of(context).colorScheme;
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
      children: [
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
                        detail.clientName ?? 'Client',
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
                if (s.status == SessionStatus.inProgress &&
                    s.startedAt != null) ...[
                  LiveSessionTimer(startedAt: s.startedAt!),
                  const SizedBox(height: 12),
                ],
                _MetaRow(
                  icon: Icons.event,
                  text: Fmt.dayMonthYear(s.scheduledDate),
                ),
                _MetaRow(icon: Icons.schedule, text: Fmt.time(s.scheduledTime)),
                _MetaRow(
                  icon: Icons.timer_outlined,
                  text: s.actualDurationMin != null
                      ? '${s.actualDurationMin} min (actual)'
                      : '${s.durationMin} min (planned)',
                ),
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

        ..._actions(s.status),

        SectionHeader(title: 'Workout (${detail.workoutLogs.length})'),
        if (detail.workoutLogs.isEmpty)
          Card(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: EmptyState(
                icon: Icons.fitness_center,
                message: s.status == SessionStatus.scheduled
                    ? 'Start the session to log exercises.'
                    : 'No exercises logged yet.',
              ),
            ),
          )
        else
          for (final log in detail.workoutLogs)
            WorkoutLogCard(log: log),
        if (s.status == SessionStatus.noShow) ...[
          const SizedBox(height: 8),
          Text(
            'This session was marked a no-show.',
            style: Theme.of(context)
                .textTheme
                .bodySmall
                ?.copyWith(color: scheme.onSurfaceVariant),
          ),
        ],
      ],
    );
  }

  /// Status-driven action buttons. While an action is in flight everything is
  /// disabled and a progress spinner replaces the primary control.
  List<Widget> _actions(SessionStatus status) {
    final canLog = status == SessionStatus.scheduled ||
        status == SessionStatus.inProgress ||
        status == SessionStatus.completed;

    final logButton = OutlinedButton.icon(
      onPressed: _busy ? null : _openLogger,
      icon: const Icon(Icons.fitness_center),
      label: Text(
        status == SessionStatus.completed ? 'Edit workout' : 'Log workout',
      ),
      style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(46)),
    );

    Widget primary(String label, Future<bool> Function() run) => FilledButton(
          onPressed: _busy ? null : () => _runAction(run),
          style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(46)),
          child: _busy
              ? const SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : Text(label),
        );

    final widgets = <Widget>[];
    switch (status) {
      case SessionStatus.scheduled:
        widgets.add(primary('Start session',
            () => TrainerSessionActions.start(context, ref, widget.sessionId)));
        widgets.add(const SizedBox(height: 12));
        widgets.add(OutlinedButton.icon(
          onPressed: _busy
              ? null
              : () => _runAction(() =>
                  TrainerSessionActions.noShow(context, ref, widget.sessionId)),
          icon: const Icon(Icons.person_off_outlined),
          label: const Text('Mark no-show'),
          style: OutlinedButton.styleFrom(
            minimumSize: const Size.fromHeight(46),
            foregroundColor: Theme.of(context).colorScheme.error,
          ),
        ));
        widgets.add(const SizedBox(height: 12));
      case SessionStatus.inProgress:
        widgets.add(primary('End session',
            () => TrainerSessionActions.end(context, ref, widget.sessionId)));
        widgets.add(const SizedBox(height: 12));
      default:
        break;
    }
    if (canLog) {
      widgets.add(logButton);
      widgets.add(const SizedBox(height: 16));
    } else if (widgets.isNotEmpty) {
      widgets.add(const SizedBox(height: 4));
    }
    return widgets;
  }

  Future<void> _runAction(Future<bool> Function() run) async {
    setState(() => _busy = true);
    await run();
    if (mounted) setState(() => _busy = false);
  }

  Future<void> _openLogger() async {
    final saved =
        await context.push<bool>('/trainer/sessions/${widget.sessionId}/log');
    if (saved == true && mounted) {
      ref.invalidate(trainerSessionProvider(widget.sessionId));
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Workout saved')),
      );
    }
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
