import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/util/formatters.dart';
import '../../auth/application/auth_controller.dart';
import '../../client/data/client_models.dart';
import '../../client/presentation/widgets/client_widgets.dart';
import '../data/trainer_models.dart';
import '../data/trainer_repository.dart';
import 'widgets/active_sessions_card.dart';
import 'widgets/client_workout_calendar.dart';
import 'widgets/trainer_actions.dart';

// Dashboard accent palette — semantic, shared with the web trainer dashboard.
const _kScheduled = Color(0xFF3B82F6); // blue-500
const _kLive = Color(0xFF22C55E); // emerald-500
const _kNoShow = Color(0xFFEF4444); // red-500
const _kAmber = Color(0xFFF59E0B); // amber-500

/// Trainer dashboard — the gym-floor home screen. Ports the rich web `/trainer`
/// page: a greeting header, an Active-Sessions card (live + never-ended), the
/// day's sessions with inline actions, a per-client workout calendar, the next
/// 14 days, a month stat-strip, client-package countdowns, and quick links.
class TrainerTodayScreen extends ConsumerWidget {
  const TrainerTodayScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authControllerProvider).user;
    final today = ref.watch(trainerTodayProvider);

    Future<void> refreshAll() async {
      ref.invalidate(trainerTodayProvider);
      ref.invalidate(trainerStaleSessionsProvider);
      ref.invalidate(trainerUpcomingProvider);
      ref.invalidate(trainerMonthSessionsProvider);
      ref.invalidate(trainerClientsProvider);
      await ref.read(trainerTodayProvider.future);
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Dashboard')),
      body: RefreshIndicator(
        onRefresh: refreshAll,
        child: today.when(
          loading: () => const _LoadingList(),
          error: (e, _) => ListView(
            children: [
              const SizedBox(height: 120),
              ErrorRetry(
                message: e.toString(),
                onRetry: () => ref.invalidate(trainerTodayProvider),
              ),
            ],
          ),
          data: (sessions) => ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
            children: [
              _GreetingHeader(name: user?.firstName ?? 'Trainer'),
              const SizedBox(height: 16),
              _ActiveSection(today: sessions),
              _TodayCard(sessions: sessions),
              const SizedBox(height: 16),
              const _CalendarSection(),
              const _UpcomingSection(),
              const SizedBox(height: 16),
              const _StatStripSection(),
              const SizedBox(height: 16),
              const _PackagesSection(),
              const _QuickLinks(),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Greeting ─────────────────────────────────────────────────────────────────

String _greeting() {
  final h = DateTime.now().hour;
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

class _GreetingHeader extends StatelessWidget {
  const _GreetingHeader({required this.name});
  final String name;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          _greeting(),
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: scheme.onSurfaceVariant,
              ),
        ),
        const SizedBox(height: 2),
        Text(
          name,
          style: Theme.of(context)
              .textTheme
              .headlineSmall
              ?.copyWith(fontWeight: FontWeight.w800),
        ),
      ],
    );
  }
}

// ── Active sessions (live today + never-ended) ───────────────────────────────

class _ActiveSection extends ConsumerWidget {
  const _ActiveSection({required this.today});
  final List<TrainerSession> today;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final live = today
        .where((s) =>
            s.status == SessionStatus.inProgress &&
            s.summary.startedAt != null)
        .toList();
    final stale =
        ref.watch(trainerStaleSessionsProvider).valueOrNull ?? const [];

    if (live.isEmpty && stale.isEmpty) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: ActiveSessionsCard(
        live: live,
        stale: stale,
        onOpen: (id) => context.push('/trainer/sessions/$id'),
      ),
    );
  }
}

// ── Today's sessions ─────────────────────────────────────────────────────────

class _TodayCard extends StatelessWidget {
  const _TodayCard({required this.sessions});
  final List<TrainerSession> sessions;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      decoration: BoxDecoration(
        color: scheme.surfaceContainer,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: scheme.outlineVariant.withValues(alpha: 0.08)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 14, 14, 8),
            child: Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: scheme.primary.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Icon(Icons.schedule, color: scheme.primary, size: 20),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Today',
                        style: Theme.of(context)
                            .textTheme
                            .titleMedium
                            ?.copyWith(fontWeight: FontWeight.w800),
                      ),
                      Text(
                        Fmt.dayMonthYear(DateTime.now()),
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                              color: scheme.onSurfaceVariant,
                            ),
                      ),
                    ],
                  ),
                ),
                if (sessions.isNotEmpty)
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: scheme.surfaceContainerHighest,
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      '${sessions.length} session${sessions.length == 1 ? '' : 's'}',
                      style: Theme.of(context).textTheme.labelSmall?.copyWith(
                            color: scheme.onSurfaceVariant,
                            fontWeight: FontWeight.w600,
                          ),
                    ),
                  ),
              ],
            ),
          ),
          if (sessions.isEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 22),
              child: Column(
                children: [
                  Container(
                    width: 48,
                    height: 48,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: scheme.surfaceContainerHighest
                          .withValues(alpha: 0.5),
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Icon(Icons.event_available,
                        color: scheme.onSurfaceVariant, size: 22),
                  ),
                  const SizedBox(height: 8),
                  const Text('No sessions today',
                      style: TextStyle(fontWeight: FontWeight.w600)),
                  const SizedBox(height: 2),
                  Text('Enjoy your rest day.',
                      style: TextStyle(color: scheme.onSurfaceVariant)),
                ],
              ),
            )
          else
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
              child: Column(
                children: [
                  for (final s in sessions)
                    Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: _TodaySessionTile(session: s),
                    ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _TodaySessionTile extends StatelessWidget {
  const _TodaySessionTile({required this.session});
  final TrainerSession session;

  ({Color accent, Color bg, Color fg, String label}) _style(ColorScheme s) {
    switch (session.status) {
      case SessionStatus.inProgress:
        return (accent: _kLive, bg: _kLive.withValues(alpha: 0.15), fg: _kLive, label: 'In Progress');
      case SessionStatus.scheduled:
        return (accent: _kScheduled, bg: _kScheduled.withValues(alpha: 0.12), fg: _kScheduled, label: 'Scheduled');
      case SessionStatus.noShow:
        return (accent: _kNoShow, bg: _kNoShow.withValues(alpha: 0.12), fg: _kNoShow, label: 'No Show');
      case SessionStatus.completed:
        return (accent: s.outlineVariant, bg: s.surfaceContainerHighest, fg: s.onSurfaceVariant, label: 'Completed');
      case SessionStatus.cancelled:
      case SessionStatus.unknown:
        return (accent: s.outlineVariant, bg: s.surfaceContainerHighest, fg: s.onSurfaceVariant, label: 'Cancelled');
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final st = _style(scheme);
    final isCancelled = session.status == SessionStatus.cancelled;
    final isLive = session.status == SessionStatus.inProgress;
    final parts = Fmt.time(session.scheduledTime).split(' ');

    return Opacity(
      opacity: isCancelled ? 0.6 : 1,
      child: Container(
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(
          color:
              isLive ? _kLive.withValues(alpha: 0.06) : scheme.surfaceContainerHigh,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: isLive
                ? _kLive.withValues(alpha: 0.3)
                : scheme.outlineVariant.withValues(alpha: 0.08),
          ),
        ),
        child: Column(
          children: [
            IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Container(width: 4, color: st.accent),
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.all(11),
                      child: Row(
                        children: [
                          // Time block
                          Container(
                            width: 54,
                            height: 46,
                            decoration: BoxDecoration(
                              color: st.bg,
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Text(
                                  parts.isNotEmpty
                                      ? parts[0]
                                      : session.scheduledTime,
                                  style: Theme.of(context)
                                      .textTheme
                                      .titleSmall
                                      ?.copyWith(
                                        color: st.fg,
                                        fontWeight: FontWeight.w800,
                                        height: 1,
                                      ),
                                ),
                                if (parts.length > 1) ...[
                                  const SizedBox(height: 2),
                                  Text(
                                    parts[1],
                                    style: Theme.of(context)
                                        .textTheme
                                        .labelSmall
                                        ?.copyWith(
                                          color: st.fg.withValues(alpha: 0.75),
                                          fontWeight: FontWeight.w700,
                                          fontSize: 9,
                                        ),
                                  ),
                                ],
                              ],
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  session.clientName ?? 'Client',
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: Theme.of(context)
                                      .textTheme
                                      .titleSmall
                                      ?.copyWith(
                                        fontWeight: FontWeight.w700,
                                        decoration: isCancelled
                                            ? TextDecoration.lineThrough
                                            : null,
                                      ),
                                ),
                                const SizedBox(height: 3),
                                Row(
                                  children: [
                                    Icon(Icons.schedule,
                                        size: 13,
                                        color: scheme.onSurfaceVariant),
                                    const SizedBox(width: 4),
                                    Text(
                                      '${session.summary.durationMin} min',
                                      style: Theme.of(context)
                                          .textTheme
                                          .bodySmall
                                          ?.copyWith(
                                            color: scheme.onSurfaceVariant,
                                          ),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 8),
                          _Pill(label: st.label, bg: st.bg, fg: st.fg, dot: isLive),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
            // Action row
            Padding(
              padding: const EdgeInsets.fromLTRB(11, 0, 11, 11),
              child: _TodayActions(session: session),
            ),
          ],
        ),
      ),
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill(
      {required this.label,
      required this.bg,
      required this.fg,
      this.dot = false});
  final String label;
  final Color bg;
  final Color fg;
  final bool dot;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration:
          BoxDecoration(color: bg, borderRadius: BorderRadius.circular(999)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (dot) ...[
            Container(
              width: 6,
              height: 6,
              decoration: BoxDecoration(color: fg, shape: BoxShape.circle),
            ),
            const SizedBox(width: 5),
          ],
          Text(
            label,
            style: Theme.of(context).textTheme.labelSmall?.copyWith(
                  color: fg,
                  fontWeight: FontWeight.w700,
                  fontSize: 10,
                ),
          ),
        ],
      ),
    );
  }
}

/// Inline actions for a today row: Start + No-show (scheduled), Resume
/// (in-progress), View workout (completed), nothing otherwise.
class _TodayActions extends ConsumerStatefulWidget {
  const _TodayActions({required this.session});
  final TrainerSession session;

  @override
  ConsumerState<_TodayActions> createState() => _TodayActionsState();
}

class _TodayActionsState extends ConsumerState<_TodayActions> {
  bool _busy = false;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final id = widget.session.id;
    switch (widget.session.status) {
      case SessionStatus.scheduled:
        return Row(
          children: [
            Expanded(
              child: FilledButton.icon(
                onPressed: _busy ? null : _start,
                style: FilledButton.styleFrom(
                  backgroundColor: _kLive,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 10),
                ),
                icon: _busy
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(
                            strokeWidth: 2, color: Colors.white),
                      )
                    : const Icon(Icons.play_arrow_rounded, size: 18),
                label: Text(_busy ? 'Starting…' : 'Start'),
              ),
            ),
            const SizedBox(width: 8),
            OutlinedButton.icon(
              onPressed: _busy ? null : _noShow,
              style: OutlinedButton.styleFrom(
                foregroundColor: _kNoShow,
                side: BorderSide(color: _kNoShow.withValues(alpha: 0.4)),
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              ),
              icon: const Icon(Icons.person_off_outlined, size: 16),
              label: const Text('No Show'),
            ),
          ],
        );
      case SessionStatus.inProgress:
        return SizedBox(
          width: double.infinity,
          child: FilledButton.icon(
            onPressed: () => context.push('/trainer/sessions/$id'),
            style: FilledButton.styleFrom(
              backgroundColor: _kLive,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 11),
            ),
            icon: const Icon(Icons.stop_rounded, size: 18),
            label: const Text('Resume Session',
                style: TextStyle(fontWeight: FontWeight.w700)),
          ),
        );
      case SessionStatus.completed:
        return Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            onPressed: () => context.push('/trainer/sessions/$id'),
            style: TextButton.styleFrom(
              foregroundColor: scheme.onSurfaceVariant,
              padding: EdgeInsets.zero,
            ),
            icon: const Icon(Icons.visibility_outlined, size: 16),
            label: const Text('View workout'),
          ),
        );
      case SessionStatus.noShow:
      case SessionStatus.cancelled:
      case SessionStatus.unknown:
        return const SizedBox.shrink();
    }
  }

  Future<void> _start() async {
    setState(() => _busy = true);
    final ok = await TrainerSessionActions.start(context, ref, widget.session.id);
    if (!mounted) return;
    setState(() => _busy = false);
    if (ok) context.push('/trainer/sessions/${widget.session.id}');
  }

  Future<void> _noShow() async {
    setState(() => _busy = true);
    await TrainerSessionActions.noShow(context, ref, widget.session.id);
    if (mounted) setState(() => _busy = false);
  }
}

// ── Client calendar ──────────────────────────────────────────────────────────

class _CalendarSection extends ConsumerWidget {
  const _CalendarSection();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final clients = ref.watch(trainerClientsProvider).valueOrNull ?? const [];
    final active = clients.where((c) => !c.isReassigned).toList();
    if (active.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: ClientWorkoutCalendar(clients: active),
    );
  }
}

// ── Upcoming (next 14 days) ──────────────────────────────────────────────────

class _UpcomingSection extends ConsumerWidget {
  const _UpcomingSection();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    final upcoming = ref.watch(trainerUpcomingProvider).valueOrNull ?? const [];

    final now = DateTime.now();
    final todayStr = TrainerRepository.ymd(now);
    final horizon = now.add(const Duration(days: 14));
    final scheduled = upcoming.where((s) {
      if (s.status != SessionStatus.scheduled) return false;
      final d = s.scheduledDate;
      if (d == null) return false;
      final dStr = TrainerRepository.ymd(d);
      return dStr != todayStr && !d.isAfter(horizon);
    }).toList()
      ..sort((a, b) =>
          (a.scheduledDate ?? now).compareTo(b.scheduledDate ?? now));

    // Group by date (insertion order preserved → chronological).
    final byDate = <String, List<TrainerSession>>{};
    for (final s in scheduled) {
      byDate.putIfAbsent(TrainerRepository.ymd(s.scheduledDate!), () => []).add(s);
    }

    return Container(
      decoration: BoxDecoration(
        color: scheme.surfaceContainer,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: scheme.outlineVariant.withValues(alpha: 0.08)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 10),
            child: Row(
              children: [
                Icon(Icons.event_outlined,
                    size: 18, color: scheme.onSurfaceVariant),
                const SizedBox(width: 8),
                Text(
                  'Upcoming',
                  style: Theme.of(context)
                      .textTheme
                      .titleSmall
                      ?.copyWith(fontWeight: FontWeight.w700),
                ),
                const SizedBox(width: 6),
                Text(
                  '· next 14 days',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: scheme.onSurfaceVariant,
                      ),
                ),
              ],
            ),
          ),
          if (byDate.isEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 18),
              child: Text(
                'No upcoming sessions in the next 14 days.',
                textAlign: TextAlign.center,
                style: TextStyle(color: scheme.onSurfaceVariant),
              ),
            )
          else
            for (final entry in byDate.entries)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      Fmt.dayMonth(DateTime.tryParse('${entry.key}T00:00:00')),
                      style: Theme.of(context).textTheme.labelSmall?.copyWith(
                            color: scheme.onSurfaceVariant,
                            fontWeight: FontWeight.w700,
                            letterSpacing: 0.4,
                          ),
                    ),
                    const SizedBox(height: 6),
                    for (final s in entry.value)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 6),
                        child: _UpcomingRow(session: s),
                      ),
                  ],
                ),
              ),
        ],
      ),
    );
  }
}

class _UpcomingRow extends StatelessWidget {
  const _UpcomingRow({required this.session});
  final TrainerSession session;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Material(
      color: scheme.surfaceContainerHighest.withValues(alpha: 0.3),
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: () => context.push('/trainer/sessions/${session.id}'),
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          child: Row(
            children: [
              Container(
                width: 32,
                height: 32,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: scheme.surfaceContainerHighest,
                ),
                child: Text(
                  _initials(session.clientName ?? 'Client'),
                  style: Theme.of(context).textTheme.labelSmall?.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      session.clientName ?? 'Client',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontWeight: FontWeight.w600),
                    ),
                    Text(
                      '${Fmt.time(session.scheduledTime)} · ${session.summary.durationMin} min',
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
      ),
    );
  }
}

// ── Month stat strip ─────────────────────────────────────────────────────────

class _StatStripSection extends ConsumerWidget {
  const _StatStripSection();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final month =
        ref.watch(trainerMonthSessionsProvider).valueOrNull ?? const [];
    final total = month.length;
    final done =
        month.where((s) => s.status == SessionStatus.completed).length;
    final noShow =
        month.where((s) => s.status == SessionStatus.noShow).length;
    final rate = (done + noShow) > 0
        ? '${((done / (done + noShow)) * 100).round()}%'
        : '—';

    return Row(
      children: [
        Expanded(
          child: _MiniStat(
              icon: Icons.event_note_outlined,
              value: '$total',
              label: 'Total',
              color: _kScheduled),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: _MiniStat(
              icon: Icons.check_circle_outline,
              value: '$done',
              label: 'Done',
              color: _kLive),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: _MiniStat(
              icon: Icons.cancel_outlined,
              value: '$noShow',
              label: 'No-show',
              color: _kNoShow),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: _MiniStat(
              icon: Icons.trending_up,
              value: rate,
              label: 'Rate',
              color: _kAmber),
        ),
      ],
    );
  }
}

class _MiniStat extends StatelessWidget {
  const _MiniStat({
    required this.icon,
    required this.value,
    required this.label,
    required this.color,
  });
  final IconData icon;
  final String value;
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: scheme.surfaceContainer,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: scheme.outlineVariant.withValues(alpha: 0.08)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 28,
            height: 28,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(9),
            ),
            child: Icon(icon, size: 15, color: color),
          ),
          const SizedBox(height: 10),
          Text(
            value,
            style: Theme.of(context)
                .textTheme
                .titleLarge
                ?.copyWith(fontWeight: FontWeight.w800, height: 1),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            style: Theme.of(context).textTheme.labelSmall?.copyWith(
                  color: scheme.onSurfaceVariant,
                ),
          ),
        ],
      ),
    );
  }
}

// ── Client packages ──────────────────────────────────────────────────────────

class _PackagesSection extends ConsumerWidget {
  const _PackagesSection();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    final clients = ref.watch(trainerClientsProvider).valueOrNull ?? const [];
    final withPkg = clients
        .where((c) => !c.isReassigned && c.package?.endDate != null)
        .toList();
    if (withPkg.isEmpty) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Container(
        decoration: BoxDecoration(
          color: scheme.surfaceContainer,
          borderRadius: BorderRadius.circular(20),
          border:
              Border.all(color: scheme.outlineVariant.withValues(alpha: 0.08)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 8),
              child: Row(
                children: [
                  Icon(Icons.people_outline,
                      size: 18, color: scheme.onSurfaceVariant),
                  const SizedBox(width: 8),
                  Text(
                    'Client Packages',
                    style: Theme.of(context)
                        .textTheme
                        .titleSmall
                        ?.copyWith(fontWeight: FontWeight.w700),
                  ),
                  const Spacer(),
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: scheme.surfaceContainerHighest,
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      '${withPkg.length} active',
                      style: Theme.of(context).textTheme.labelSmall?.copyWith(
                            color: scheme.onSurfaceVariant,
                          ),
                    ),
                  ),
                ],
              ),
            ),
            for (final c in withPkg)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 6, 16, 10),
                child: _PackageRow(client: c),
              ),
          ],
        ),
      ),
    );
  }
}

class _PackageRow extends StatelessWidget {
  const _PackageRow({required this.client});
  final TrainerClient client;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final pkg = client.package!;
    final daysLeft = pkg.daysLeft ?? 0;
    final urgency = daysLeft <= 7
        ? _kNoShow
        : daysLeft <= 14
            ? _kAmber
            : _kLive;
    final pct = (pkg.fractionUsed * 100).round();

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 32,
          height: 32,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: scheme.surfaceContainerHighest,
          ),
          child: Text(
            _initials(client.name),
            style: Theme.of(context)
                .textTheme
                .labelSmall
                ?.copyWith(fontWeight: FontWeight.w800),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      client.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontWeight: FontWeight.w600),
                    ),
                  ),
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: urgency.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      '${daysLeft}d left',
                      style: TextStyle(
                          color: urgency,
                          fontSize: 11,
                          fontWeight: FontWeight.w700),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              ClipRRect(
                borderRadius: BorderRadius.circular(999),
                child: LinearProgressIndicator(
                  value: pkg.fractionUsed,
                  minHeight: 4,
                  backgroundColor: scheme.surfaceContainerHighest,
                  valueColor: AlwaysStoppedAnimation(urgency),
                ),
              ),
              const SizedBox(height: 4),
              Text(
                '$pct% used · Ends ${Fmt.dayMonth(pkg.endDate)}',
                style: Theme.of(context).textTheme.labelSmall?.copyWith(
                      color: scheme.onSurfaceVariant,
                    ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

// ── Quick links ──────────────────────────────────────────────────────────────

class _QuickLinks extends StatelessWidget {
  const _QuickLinks();

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: _QuickLink(
            icon: Icons.beach_access_outlined,
            color: _kAmber,
            title: 'Leaves',
            subtitle: 'Manage time off',
            onTap: () => context.push('/trainer/leaves'),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: _QuickLink(
            icon: Icons.event_repeat_outlined,
            color: _kScheduled,
            title: 'Reschedules',
            subtitle: 'Review requests',
            onTap: () => context.push('/trainer/reschedule-requests'),
          ),
        ),
      ],
    );
  }
}

class _QuickLink extends StatelessWidget {
  const _QuickLink({
    required this.icon,
    required this.color,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });
  final IconData icon;
  final Color color;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Material(
      color: scheme.surfaceContainer,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border:
                Border.all(color: scheme.outlineVariant.withValues(alpha: 0.08)),
          ),
          child: Row(
            children: [
              Container(
                width: 36,
                height: 36,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(11),
                ),
                child: Icon(icon, size: 18, color: color),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title,
                        style: const TextStyle(
                            fontWeight: FontWeight.w700, fontSize: 13)),
                    Text(
                      subtitle,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.labelSmall?.copyWith(
                            color: scheme.onSurfaceVariant,
                          ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Loading skeleton ─────────────────────────────────────────────────────────

class _LoadingList extends StatelessWidget {
  const _LoadingList();

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    Widget bar(double h) => Container(
          height: h,
          margin: const EdgeInsets.only(bottom: 16),
          decoration: BoxDecoration(
            color: scheme.surfaceContainerHighest,
            borderRadius: BorderRadius.circular(16),
          ),
        );
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
      children: [
        Container(
          height: 28,
          width: 180,
          margin: const EdgeInsets.only(bottom: 20),
          decoration: BoxDecoration(
            color: scheme.surfaceContainerHighest,
            borderRadius: BorderRadius.circular(8),
          ),
        ),
        bar(150),
        bar(120),
        bar(220),
      ],
    );
  }
}

String _initials(String name) {
  final parts =
      name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
  if (parts.isEmpty) return '?';
  if (parts.length == 1) return parts.first.substring(0, 1).toUpperCase();
  return (parts.first.substring(0, 1) + parts.last.substring(0, 1))
      .toUpperCase();
}
