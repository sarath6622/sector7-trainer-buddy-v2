import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/realtime/session_realtime.dart';
import '../../../core/util/formatters.dart';
import '../../client/data/client_models.dart';
import '../../client/presentation/widgets/client_widgets.dart';
import '../../session/presentation/session_hero_card.dart';
import '../../workout/presentation/workout_logger_screen.dart';
import '../data/trainer_repository.dart';
import 'widgets/trainer_actions.dart';

/// Trainer view of one session: the session header + lifecycle actions
/// (start / end / no-show) with the shared workout logger embedded directly
/// below — one screen, no separate "Log workout" route. Save lives in the app
/// bar and drives the embedded [WorkoutLoggerBody] via a [GlobalKey].
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
  final _loggerKey = GlobalKey<WorkoutLoggerBodyState>();
  bool _busy = false; // a lifecycle action (start/end/no-show) is in flight
  bool _saving = false; // the embedded logger is saving
  // App-bar title, named after the muscle groups trained today (the logger
  // reports it as exercises are added); generic until anything is logged.
  String _title = 'Workout';

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

  static bool _canLog(SessionStatus s) =>
      s == SessionStatus.scheduled ||
      s == SessionStatus.inProgress ||
      s == SessionStatus.completed;

  @override
  Widget build(BuildContext context) {
    final detail = ref.watch(trainerSessionProvider(widget.sessionId));
    final canLog = detail.maybeWhen(
      skipLoadingOnReload: true,
      data: (d) => _canLog(d.summary.status),
      orElse: () => false,
    );

    return Scaffold(
      floatingActionButton: canLog
          ? FloatingActionButton(
              onPressed:
                  _saving ? null : () => _loggerKey.currentState?.openSearchPicker(),
              tooltip: 'Add exercise',
              child: const Icon(Icons.add),
            )
          : null,
      appBar: AppBar(
        title: Text(_title),
        actions: [
          if (canLog)
            Padding(
              padding: const EdgeInsets.only(right: 6),
              child: TextButton(
                onPressed: _saving ? null : () => _loggerKey.currentState?.save(),
                child: _saving
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Text('Save'),
              ),
            ),
        ],
      ),
      // skipLoadingOnReload keeps the embedded logger mounted across the
      // realtime/poll refetches — otherwise a refetch would flash the spinner
      // and drop in-progress edits.
      body: detail.when(
        skipLoadingOnReload: true,
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
        data: (d) => _merged(d),
      ),
    );
  }

  Widget _merged(SessionDetail detail) {
    final status = detail.summary.status;
    if (_canLog(status)) {
      return WorkoutLoggerBody(
        key: _loggerKey,
        sessionId: widget.sessionId,
        header: _headerSection(detail),
        onSavingChanged: (v) {
          if (mounted) setState(() => _saving = v);
        },
        onTitleChanged: (t) {
          if (mounted) setState(() => _title = t);
        },
      );
    }
    // Non-loggable (no-show / cancelled): header + a note, no logger.
    final scheme = Theme.of(context).colorScheme;
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
      children: [
        _headerSection(detail),
        if (status == SessionStatus.noShow) ...[
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

  /// The session card + lifecycle actions, rendered as the first scrollable
  /// item above the log (so it scrolls away as exercises are added).
  Widget _headerSection(SessionDetail detail) {
    final s = detail.summary;
    // Live session → a single minimal hero card (name + timer + status pill +
    // pause/end cluster). No duplicate title, status chip, meta rows, or a
    // separate End button.
    if (s.status == SessionStatus.inProgress && s.startedAt != null) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const SizedBox(height: 8),
          SessionHeroCard(
            sessionId: s.id,
            name: detail.clientName ?? 'Client',
            startedAt: s.startedAt!,
            expectedDurationMin: s.durationMin,
            onEnd: () => _runAction(
              () => TrainerSessionActions.end(context, ref, widget.sessionId),
            ),
            ending: _busy,
          ),
        ],
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 8),
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
                _MetaRow(icon: Icons.event, text: Fmt.dayMonthYear(s.scheduledDate)),
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
        ..._statusActions(s.status),
      ],
    );
  }

  /// Start / End / No-show controls. While one is in flight everything is
  /// disabled and a spinner replaces the primary control.
  List<Widget> _statusActions(SessionStatus status) {
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

    switch (status) {
      case SessionStatus.scheduled:
        return [
          const SizedBox(height: 16),
          primary('Start session',
              () => TrainerSessionActions.start(context, ref, widget.sessionId)),
          const SizedBox(height: 12),
          OutlinedButton.icon(
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
          ),
          const SizedBox(height: 4),
        ];
      case SessionStatus.inProgress:
        return [
          const SizedBox(height: 16),
          primary('End session',
              () => TrainerSessionActions.end(context, ref, widget.sessionId)),
          const SizedBox(height: 4),
        ];
      default:
        return const [];
    }
  }

  Future<void> _runAction(Future<bool> Function() run) async {
    setState(() => _busy = true);
    await run();
    if (mounted) setState(() => _busy = false);
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
