import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/realtime/session_realtime.dart';
import '../../../core/util/formatters.dart';
import '../../session/presentation/session_hero_card.dart';
import '../../session/presentation/session_live_activity_binder.dart';
import '../../workout/presentation/workout_logger_screen.dart';
import '../data/client_models.dart';
import '../data/client_repository.dart';
import 'widgets/client_widgets.dart';
import 'widgets/reschedule_sheet.dart';

/// Client view of their own session: the session header (date, status, live
/// timer + controls, trainer, reschedule) with the shared workout logger
/// embedded directly below — one screen, no separate "Log workout" route. Save
/// lives in the app bar and drives the embedded [WorkoutLoggerBody].
class SessionDetailScreen extends ConsumerStatefulWidget {
  const SessionDetailScreen({super.key, required this.sessionId});
  final String sessionId;

  @override
  ConsumerState<SessionDetailScreen> createState() =>
      _SessionDetailScreenState();
}

class _SessionDetailScreenState extends ConsumerState<SessionDetailScreen>
    with SessionRealtimeMixin {
  final _loggerKey = GlobalKey<WorkoutLoggerBodyState>();
  bool _saving = false;
  // App-bar title, named after the muscle groups trained today (the logger
  // reports it as exercises are added); generic until anything is logged.
  String _title = 'Workout';

  @override
  String get realtimeSessionId => widget.sessionId;

  @override
  void onSessionChanged() =>
      ref.invalidate(clientSessionProvider(widget.sessionId));

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
    final detail = ref.watch(clientSessionProvider(widget.sessionId));
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
      body: detail.when(
        skipLoadingOnReload: true,
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ListView(
          children: [
            const SizedBox(height: 120),
            ErrorRetry(
              message: e.toString(),
              onRetry: () =>
                  ref.invalidate(clientSessionProvider(widget.sessionId)),
            ),
          ],
        ),
        data: (d) => _merged(d),
      ),
    );
  }

  Widget _merged(SessionDetail detail) {
    if (_canLog(detail.summary.status)) {
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
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
      children: [_headerSection(detail)],
    );
  }

  /// Session card + (for scheduled sessions) a reschedule action, rendered as
  /// the first scrollable item above the log.
  Widget _headerSection(SessionDetail detail) {
    final s = detail.summary;
    // Live session → a single minimal hero card (trainer name + timer + status
    // pill + pause). No date title, status chip, or meta rows.
    if (s.status == SessionStatus.inProgress && s.startedAt != null) {
      // The binder projects this live session onto the lock screen (iOS Live
      // Activity / Android ongoing notification) for as long as it's mounted.
      return SessionLiveActivityBinder(
        sessionId: s.id,
        name: s.trainerName ?? 'Session',
        startedAt: s.startedAt!,
        workoutTitle: _title,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const SizedBox(height: 8),
            SessionHeroCard(
              sessionId: s.id,
              name: s.trainerName ?? 'Session',
              startedAt: s.startedAt!,
              expectedDurationMin: s.durationMin,
            ),
          ],
        ),
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
        if (s.status == SessionStatus.scheduled) ...[
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: () async {
              final messenger = ScaffoldMessenger.of(context);
              final ok = await showRescheduleSheet(context, s);
              if (ok && mounted) {
                messenger.showSnackBar(
                  const SnackBar(content: Text('Reschedule request submitted')),
                );
              }
            },
            icon: const Icon(Icons.event_repeat),
            label: const Text('Request reschedule'),
            style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(46)),
          ),
        ],
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
