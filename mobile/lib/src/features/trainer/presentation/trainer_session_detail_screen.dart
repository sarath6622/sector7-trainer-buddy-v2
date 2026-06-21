import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/realtime/session_realtime.dart';
import '../../../core/util/formatters.dart';
import '../../client/data/client_models.dart';
import '../../client/presentation/widgets/client_widgets.dart';
import '../../session/presentation/session_hero_card.dart';
import '../../workout/presentation/workout_logger_screen.dart';
import '../data/trainer_models.dart';
import '../data/trainer_repository.dart';
import 'widgets/other_sessions_strip.dart';
import 'widgets/trainer_actions.dart';

/// Trainer view of one session: the session header + lifecycle actions
/// (start / end / no-show) with the shared workout logger embedded directly
/// below — one screen, no separate "Log workout" route. Save lives in the app
/// bar and drives the embedded [WorkoutLoggerBody] via a [GlobalKey].
///
/// A trainer running parallel sessions can switch between their active clients'
/// logs in place: every *other* IN_PROGRESS session shows as a chip above the
/// logger, and tapping one swaps the screen to that client (re-seeding the
/// logger, hero card, and realtime channel) without a route change — the mobile
/// analogue of the web session page's tab switcher. [sessionId] only seeds the
/// initially-open client; the live one is tracked in [_activeId].
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
  // One logger State per session id, so switching between active clients
  // remounts (and re-seeds) the logger instead of leaving the prior client's
  // draft on screen — the widget is keyed by its session's GlobalKey, which
  // changes when [_activeId] does. The map also lets Save / the "+" FAB reach
  // whichever logger is currently active.
  final _loggerKeys = <String, GlobalKey<WorkoutLoggerBodyState>>{};
  GlobalKey<WorkoutLoggerBodyState> get _activeLoggerKey =>
      _loggerKeys.putIfAbsent(_activeId, () => GlobalKey());

  // The session currently shown — seeded from the route, then changed in place
  // when the trainer taps another active client's chip.
  late String _activeId;
  bool _busy = false; // a lifecycle action (start/end/no-show) is in flight
  bool _saving = false; // the embedded logger is saving
  bool _switching = false; // a chip-driven session swap is settling
  // App-bar title, named after the muscle groups trained today (the logger
  // reports it as exercises are added); generic until anything is logged.
  String _title = 'Workout';

  @override
  String get realtimeSessionId => _activeId;

  @override
  void onSessionChanged() {
    ref.invalidate(trainerSessionProvider(_activeId));
    // A start/end elsewhere can change which sessions are live — keep the
    // switcher chips honest.
    ref.invalidate(trainerInProgressProvider);
  }

  @override
  void initState() {
    super.initState();
    _activeId = widget.sessionId;
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
    final detail = ref.watch(trainerSessionProvider(_activeId));
    final canLog = detail.maybeWhen(
      skipLoadingOnReload: true,
      data: (d) => _canLog(d.summary.status),
      orElse: () => false,
    );

    // Every other live session becomes a switch chip above the logger.
    final others = ref.watch(trainerInProgressProvider).maybeWhen(
          data: (list) => list.where((s) => s.id != _activeId).toList(),
          orElse: () => const <TrainerSession>[],
        );
    final othersStrip = others.isEmpty
        ? null
        : OtherSessionsStrip(
            sessions: others,
            onSwitch: _switching ? (_) {} : _switchTo,
          );

    return Scaffold(
      floatingActionButton: canLog
          ? FloatingActionButton(
              onPressed: _saving
                  ? null
                  : () => _activeLoggerKey.currentState?.openSearchPicker(),
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
                onPressed:
                    _saving ? null : () => _activeLoggerKey.currentState?.save(),
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
              onRetry: () => ref.invalidate(trainerSessionProvider(_activeId)),
            ),
          ],
        ),
        data: (d) => _merged(d, othersStrip),
      ),
    );
  }

  Widget _merged(SessionDetail detail, Widget? othersStrip) {
    final status = detail.summary.status;
    if (_canLog(status)) {
      return WorkoutLoggerBody(
        // Keyed per session so a chip switch remounts + re-seeds the logger.
        key: _activeLoggerKey,
        sessionId: _activeId,
        header: _headerSection(detail, othersStrip),
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
        _headerSection(detail, othersStrip),
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
  /// [othersStrip], when present, sits just below the header as the switcher
  /// for the trainer's other live clients.
  Widget _headerSection(SessionDetail detail, Widget? othersStrip) {
    final s = detail.summary;
    // The switcher travels with the header (scrolls away as the log grows),
    // sitting under whichever header variant the active session calls for.
    Widget withSwitcher(Widget header) => othersStrip == null
        ? header
        : Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              header,
              const SizedBox(height: 14),
              othersStrip,
            ],
          );

    // Live session → a single minimal hero card (name + timer + status pill +
    // pause/end cluster). No duplicate title, status chip, meta rows, or a
    // separate End button.
    if (s.status == SessionStatus.inProgress && s.startedAt != null) {
      return withSwitcher(Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const SizedBox(height: 8),
          SessionHeroCard(
            sessionId: s.id,
            name: detail.clientName ?? 'Client',
            startedAt: s.startedAt!,
            expectedDurationMin: s.durationMin,
            onEnd: () => _runAction(
              () => TrainerSessionActions.end(context, ref, _activeId),
            ),
            ending: _busy,
          ),
        ],
      ));
    }
    return withSwitcher(Column(
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
    ));
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
              () => TrainerSessionActions.start(context, ref, _activeId)),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: _busy
                ? null
                : () => _runAction(() =>
                    TrainerSessionActions.noShow(context, ref, _activeId)),
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
              () => TrainerSessionActions.end(context, ref, _activeId)),
          const SizedBox(height: 4),
        ];
      default:
        return const [];
    }
  }

  Future<void> _runAction(Future<bool> Function() run) async {
    setState(() => _busy = true);
    await run();
    // A lifecycle change (start/end/no-show) can move a session in or out of
    // the live set — refresh the switcher chips.
    ref.invalidate(trainerInProgressProvider);
    if (mounted) setState(() => _busy = false);
  }

  /// Swap the screen to another live client's session in place. Guards the
  /// current client's unsaved log first (the logger is remounted on switch, so
  /// in-memory edits would otherwise be lost), then re-points the realtime
  /// channel and the watched detail at the new session.
  Future<void> _switchTo(String newId) async {
    if (newId == _activeId || _switching) return;

    if (_activeLoggerKey.currentState?.isDirty ?? false) {
      final discard = await _confirmDiscard();
      if (!discard || !mounted) return;
    }

    // try/finally so a throw mid-swap can't strand [_switching] true (which
    // would wedge the chips into a permanent no-op).
    setState(() => _switching = true);
    try {
      stopSessionRealtime(); // unsubscribe the outgoing session's channel
      setState(() {
        _activeId = newId;
        // Reset until the incoming logger reports its focus-derived name.
        _title = 'Workout';
        _saving = false;
      });
      startSessionRealtime(); // subscribe the incoming session's channel
      // Make sure the new client's log reflects the latest server state.
      ref.invalidate(trainerSessionProvider(newId));
    } finally {
      if (mounted) setState(() => _switching = false);
    }
  }

  Future<bool> _confirmDiscard() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Switch client?'),
        content: const Text(
          'This client has unsaved workout changes. Switching will discard '
          'them. Save first to keep them.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: Theme.of(ctx).colorScheme.error,
              foregroundColor: Theme.of(ctx).colorScheme.onError,
            ),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Discard & switch'),
          ),
        ],
      ),
    );
    return ok ?? false;
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
