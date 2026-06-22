import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/util/formatters.dart';
import '../data/client_models.dart';
import '../data/client_repository.dart';
import 'widgets/client_widgets.dart';

const _blue = Color(0xFF3B82F6);
const _green = Color(0xFF22C55E);
const _emerald = Color(0xFF10B981);
const _amber = Color(0xFFF59E0B);
const _red = Color(0xFFEF4444);

({String label, Color color, IconData icon}) _statusConfig(SessionStatus s) =>
    switch (s) {
      SessionStatus.scheduled => (label: 'Scheduled', color: _blue, icon: Icons.event),
      SessionStatus.inProgress => (label: 'In Progress', color: _green, icon: Icons.play_circle),
      SessionStatus.completed => (label: 'Completed', color: _emerald, icon: Icons.check_circle),
      SessionStatus.noShow => (label: 'No Show', color: _amber, icon: Icons.error_outline),
      SessionStatus.cancelled => (label: 'Cancelled', color: _red, icon: Icons.cancel_outlined),
      SessionStatus.unknown => (label: 'Unknown', color: _amber, icon: Icons.help_outline),
    };

/// Client Sessions — mirrors the PWA `/client/sessions`: header, a month
/// navigator, four quick-stat tiles, and Upcoming / Past grouped session cards.
class SessionsListScreen extends ConsumerStatefulWidget {
  const SessionsListScreen({super.key});

  @override
  ConsumerState<SessionsListScreen> createState() => _SessionsListScreenState();
}

class _SessionsListScreenState extends ConsumerState<SessionsListScreen> {
  late DateTime _month = DateTime(DateTime.now().year, DateTime.now().month);

  String get _monthKey =>
      '${_month.year}-${_month.month.toString().padLeft(2, '0')}';

  void _shift(int delta) =>
      setState(() => _month = DateTime(_month.year, _month.month + delta));

  @override
  Widget build(BuildContext context) {
    final sessions = ref.watch(clientSessionsByMonthProvider(_monthKey));

    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: RefreshIndicator(
          onRefresh: () =>
              ref.refresh(clientSessionsByMonthProvider(_monthKey).future),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
            children: [
              Text('My Sessions',
                  style: Theme.of(context)
                      .textTheme
                      .headlineSmall
                      ?.copyWith(fontWeight: FontWeight.w800, letterSpacing: -0.5)),
              const SizedBox(height: 4),
              Text('Track all your training sessions',
                  style: TextStyle(
                      color: Theme.of(context).colorScheme.onSurfaceVariant)),
              const SizedBox(height: 18),
              _MonthNav(
                label: Fmt.monthYear(_month),
                onPrev: () => _shift(-1),
                onNext: () => _shift(1),
              ),
              const SizedBox(height: 14),
              sessions.when(
                loading: () => const Padding(
                  padding: EdgeInsets.only(top: 60),
                  child: Center(child: CircularProgressIndicator()),
                ),
                error: (e, _) => ErrorRetry(
                  message: e.toString(),
                  onRetry: () =>
                      ref.invalidate(clientSessionsByMonthProvider(_monthKey)),
                ),
                data: _content,
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _content(List<SessionSummary> all) {
    final done = all.where((s) => s.status == SessionStatus.completed).length;
    final scheduled = all.where((s) => s.status == SessionStatus.scheduled).length;
    final noShow = all.where((s) => s.status == SessionStatus.noShow).length;
    final cancelled = all.where((s) => s.status == SessionStatus.cancelled).length;

    final today = DateTime.now();
    final t0 = DateTime(today.year, today.month, today.day);
    bool isUpcoming(SessionSummary s) =>
        s.status == SessionStatus.scheduled &&
        s.scheduledDate != null &&
        !s.scheduledDate!.isBefore(t0);
    final upcoming = all.where(isUpcoming).toList();
    final past = all.where((s) => !isUpcoming(s)).toList().reversed.toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(children: [
          Expanded(child: _StatTile(value: done, label: 'Done', color: _emerald)),
          const SizedBox(width: 8),
          Expanded(child: _StatTile(value: scheduled, label: 'Upcoming', color: _blue)),
          const SizedBox(width: 8),
          Expanded(child: _StatTile(value: noShow, label: 'No Show', color: _amber)),
          const SizedBox(width: 8),
          Expanded(child: _StatTile(value: cancelled, label: 'Cancelled', color: _red)),
        ]),
        const SizedBox(height: 18),
        if (all.isEmpty)
          const Padding(
            padding: EdgeInsets.only(top: 40),
            child: EmptyState(
              icon: Icons.fitness_center,
              message: 'No sessions this month.\nThey appear here once scheduled.',
            ),
          ),
        if (upcoming.isNotEmpty) ...[
          _label(context, 'Upcoming'),
          const SizedBox(height: 8),
          for (final s in upcoming) ...[_SessionCard(session: s), const SizedBox(height: 8)],
          const SizedBox(height: 8),
        ],
        if (past.isNotEmpty) ...[
          _label(context, upcoming.isNotEmpty ? 'Past & Other' : 'All Sessions'),
          const SizedBox(height: 8),
          for (final s in past) ...[_SessionCard(session: s), const SizedBox(height: 8)],
        ],
      ],
    );
  }

  Widget _label(BuildContext context, String text) => Text(
        text.toUpperCase(),
        style: Theme.of(context).textTheme.labelMedium?.copyWith(
              color: Theme.of(context).colorScheme.onSurfaceVariant,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.8,
              fontSize: 11,
            ),
      );
}

class _MonthNav extends StatelessWidget {
  const _MonthNav({required this.label, required this.onPrev, required this.onNext});
  final String label;
  final VoidCallback onPrev;
  final VoidCallback onNext;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(6),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerLow,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: scheme.outlineVariant),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          IconButton(
            onPressed: onPrev,
            icon: const Icon(Icons.chevron_left),
            color: scheme.onSurfaceVariant,
          ),
          Text(label, style: const TextStyle(fontWeight: FontWeight.w700)),
          IconButton(
            onPressed: onNext,
            icon: const Icon(Icons.chevron_right),
            color: scheme.onSurfaceVariant,
          ),
        ],
      ),
    );
  }
}

class _StatTile extends StatelessWidget {
  const _StatTile({required this.value, required this.label, required this.color});
  final int value;
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 12),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerLow,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: scheme.outlineVariant),
      ),
      child: Column(
        children: [
          Text('$value',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: color)),
          const SizedBox(height: 2),
          Text(label,
              style: TextStyle(fontSize: 10, color: scheme.onSurfaceVariant)),
        ],
      ),
    );
  }
}

class _SessionCard extends StatelessWidget {
  const _SessionCard({required this.session});
  final SessionSummary session;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final s = session;
    final cfg = _statusConfig(s.status);
    final canView =
        s.status == SessionStatus.completed || s.status == SessionStatus.inProgress;
    final date = s.scheduledDate;

    return Material(
      color: scheme.surfaceContainerLow,
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        onTap: () => context.push('/client/sessions/${s.id}'),
        borderRadius: BorderRadius.circular(18),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: scheme.outlineVariant),
          ),
          child: Row(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                    color: scheme.primary.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(14)),
                child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                  Text(date != null ? '${date.day}' : '—',
                      style: TextStyle(
                          fontSize: 16, height: 1, fontWeight: FontWeight.w800, color: scheme.primary)),
                  Text(date != null ? Fmt.monthShort(date).toUpperCase() : '',
                      style: TextStyle(
                          fontSize: 9, fontWeight: FontWeight.w600, color: scheme.primary.withValues(alpha: 0.7))),
                ]),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(children: [
                      Flexible(
                        child: Text(s.trainerName ?? 'Session',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700)),
                      ),
                      if (s.isCarryForward) ...[
                        const SizedBox(width: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                          decoration: BoxDecoration(
                              color: _amber.withValues(alpha: 0.15),
                              borderRadius: BorderRadius.circular(4)),
                          child: const Text('CF',
                              style: TextStyle(
                                  fontSize: 9, fontWeight: FontWeight.w700, color: _amber)),
                        ),
                      ],
                    ]),
                    const SizedBox(height: 3),
                    Row(children: [
                      Icon(Icons.schedule, size: 12, color: scheme.onSurfaceVariant),
                      const SizedBox(width: 4),
                      Text(Fmt.time(s.scheduledTime),
                          style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant)),
                      const SizedBox(width: 12),
                      Text('${s.actualDurationMin ?? s.durationMin} min',
                          style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant)),
                    ]),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                        color: cfg.color.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(999)),
                    child: Row(mainAxisSize: MainAxisSize.min, children: [
                      Icon(cfg.icon, size: 11, color: cfg.color),
                      const SizedBox(width: 4),
                      Text(cfg.label,
                          style: TextStyle(
                              fontSize: 10, fontWeight: FontWeight.w600, color: cfg.color)),
                    ]),
                  ),
                  if (canView) ...[
                    const SizedBox(height: 6),
                    Row(mainAxisSize: MainAxisSize.min, children: [
                      Icon(Icons.visibility_outlined, size: 11, color: scheme.onSurfaceVariant),
                      const SizedBox(width: 3),
                      Text('View',
                          style: TextStyle(fontSize: 10, color: scheme.onSurfaceVariant)),
                    ]),
                  ],
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
