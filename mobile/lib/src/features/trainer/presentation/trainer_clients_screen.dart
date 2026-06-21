import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/util/formatters.dart';
import '../../client/presentation/widgets/client_widgets.dart';
import '../data/trainer_models.dart';
import '../data/trainer_repository.dart';

// Accent palette — shared with the dashboard / schedule.
const _kDone = Color(0xFF22C55E); // emerald-500
const _kScheduled = Color(0xFF3B82F6); // blue-500
const _kNoShow = Color(0xFFEF4444); // red-500
const _kAmber = Color(0xFFF59E0B); // amber-500

/// Trainer "Clients" tab — the active roster with rich per-client context: a
/// this-month session-usage bar (used / scheduled / quota), session outcomes,
/// package validity, the next booking, and a measurement-overdue flag. Tap a
/// card to open the full client detail.
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
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
              children: [
                Padding(
                  padding: const EdgeInsets.only(left: 2, bottom: 10),
                  child: Text(
                    '${list.length} active client${list.length == 1 ? '' : 's'}',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: Theme.of(context).colorScheme.onSurfaceVariant,
                        ),
                  ),
                ),
                for (final c in list)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: _ClientCard(client: c),
                  ),
              ],
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
    final pkg = client.package;
    final stats = client.stats;
    final next = client.nextSession;

    return Material(
      color: scheme.surfaceContainer,
      borderRadius: BorderRadius.circular(20),
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: () => context.push(
          '/trainer/clients/${client.clientProfileId}',
          extra: client,
        ),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(20),
            border: Border.all(
                color: scheme.outlineVariant.withValues(alpha: 0.08)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // ── Identity row ──
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
                            style: Theme.of(context)
                                .textTheme
                                .bodySmall
                                ?.copyWith(color: scheme.onSurfaceVariant),
                          ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  if (client.isReassigned)
                    const _Tag(label: 'Reassigned', color: _kAmber)
                  else if (pkg?.daysLeft != null)
                    _DaysLeftChip(daysLeft: pkg!.daysLeft!),
                ],
              ),

              const SizedBox(height: 14),

              // ── Sessions usage (package clients) or reassigned note ──
              if (pkg != null && pkg.sessionsPerMonth > 0)
                _UsageBlock(stats: stats, quota: pkg.sessionsPerMonth)
              else if (client.isReassigned)
                _ReassignedNote(count: client.reassignedSessionCount ?? 0)
              else
                _OutcomeChips(stats: stats),

              // ── Footer: next session + measurements ──
              if (next != null || client.measurementStale) ...[
                const SizedBox(height: 12),
                Divider(
                    height: 1,
                    color: scheme.outlineVariant.withValues(alpha: 0.08)),
                const SizedBox(height: 10),
                if (next != null)
                  Row(
                    children: [
                      Icon(Icons.event_outlined,
                          size: 15, color: scheme.onSurfaceVariant),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'Next · ${Fmt.dateTime(next.scheduledDate, next.scheduledTime)}',
                          style: Theme.of(context)
                              .textTheme
                              .bodySmall
                              ?.copyWith(color: scheme.onSurfaceVariant),
                        ),
                      ),
                      Icon(Icons.chevron_right,
                          size: 18, color: scheme.onSurfaceVariant),
                    ],
                  ),
                if (client.measurementStale) ...[
                  if (next != null) const SizedBox(height: 8),
                  Row(
                    children: [
                      Icon(Icons.straighten, size: 15, color: _kAmber),
                      const SizedBox(width: 8),
                      Text('Measurements overdue',
                          style: Theme.of(context)
                              .textTheme
                              .bodySmall
                              ?.copyWith(color: _kAmber)),
                    ],
                  ),
                ],
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// The hero "sessions this month" block: a usage headline, a stacked bar
/// (used → scheduled → free) against the monthly quota, and an outcome caption.
class _UsageBlock extends StatelessWidget {
  const _UsageBlock({required this.stats, required this.quota});
  final TrainerClientStats stats;
  final int quota;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final used = stats.used;
    final scheduled = stats.scheduled;
    // Scale to whichever is larger so an over-quota month still fills cleanly.
    final denom = [quota, used + scheduled, 1].reduce((a, b) => a > b ? a : b);
    final free = (quota - used - scheduled).clamp(0, quota);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text('Sessions this month',
                style: Theme.of(context)
                    .textTheme
                    .labelMedium
                    ?.copyWith(color: scheme.onSurfaceVariant)),
            const Spacer(),
            Text.rich(
              TextSpan(
                children: [
                  TextSpan(
                    text: '$used',
                    style: Theme.of(context)
                        .textTheme
                        .titleMedium
                        ?.copyWith(fontWeight: FontWeight.w800),
                  ),
                  TextSpan(
                    text: ' / $quota used',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: scheme.onSurfaceVariant,
                          fontWeight: FontWeight.w600,
                        ),
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        // Stacked bar
        ClipRRect(
          borderRadius: BorderRadius.circular(999),
          child: SizedBox(
            height: 10,
            child: Row(
              children: [
                if (used > 0) Expanded(flex: used, child: const ColoredBox(color: _kDone)),
                if (scheduled > 0)
                  Expanded(
                    flex: scheduled,
                    child: ColoredBox(color: _kScheduled.withValues(alpha: 0.55)),
                  ),
                Expanded(
                  flex: (denom - used - scheduled).clamp(0, denom),
                  child: ColoredBox(color: scheme.surfaceContainerHighest),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 8),
        // Outcome caption
        Wrap(
          spacing: 14,
          runSpacing: 4,
          children: [
            _StatDot(color: _kDone, label: '${stats.completed} done'),
            _StatDot(color: _kScheduled, label: '$scheduled scheduled'),
            if (stats.noShow > 0)
              _StatDot(color: _kNoShow, label: '${stats.noShow} no-show'),
            _StatDot(
                color: scheme.onSurfaceVariant.withValues(alpha: 0.5),
                label: '$free left'),
          ],
        ),
      ],
    );
  }
}

/// Fallback outcome chips for a client without a monthly quota.
class _OutcomeChips extends StatelessWidget {
  const _OutcomeChips({required this.stats});
  final TrainerClientStats stats;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
            child: _MiniStat(
                value: stats.completed, label: 'Done', color: _kDone)),
        const SizedBox(width: 8),
        Expanded(
            child: _MiniStat(
                value: stats.scheduled, label: 'Scheduled', color: _kScheduled)),
        const SizedBox(width: 8),
        Expanded(
            child: _MiniStat(
                value: stats.noShow, label: 'No-show', color: _kNoShow)),
      ],
    );
  }
}

class _ReassignedNote extends StatelessWidget {
  const _ReassignedNote({required this.count});
  final int count;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: _kAmber.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Icon(Icons.swap_horiz, size: 16, color: _kAmber),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              count > 0
                  ? '$count session${count == 1 ? '' : 's'} temporarily reassigned to you'
                  : 'Temporarily reassigned to you',
              style: Theme.of(context)
                  .textTheme
                  .bodySmall
                  ?.copyWith(color: scheme.onSurfaceVariant),
            ),
          ),
        ],
      ),
    );
  }
}

class _MiniStat extends StatelessWidget {
  const _MiniStat(
      {required this.value, required this.label, required this.color});
  final int value;
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 10),
      decoration: BoxDecoration(
        color: scheme.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: scheme.outlineVariant.withValues(alpha: 0.08)),
      ),
      child: Column(
        children: [
          Text('$value',
              style: Theme.of(context).textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: value > 0 ? color : scheme.onSurface,
                  )),
          Text(label,
              style: Theme.of(context)
                  .textTheme
                  .labelSmall
                  ?.copyWith(color: scheme.onSurfaceVariant)),
        ],
      ),
    );
  }
}

class _StatDot extends StatelessWidget {
  const _StatDot({required this.color, required this.label});
  final Color color;
  final String label;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 7,
          height: 7,
          decoration: BoxDecoration(shape: BoxShape.circle, color: color),
        ),
        const SizedBox(width: 6),
        Text(label,
            style: Theme.of(context)
                .textTheme
                .bodySmall
                ?.copyWith(color: scheme.onSurfaceVariant)),
      ],
    );
  }
}

/// Package validity chip: green > 14 days, amber 8–14, red ≤ 7.
class _DaysLeftChip extends StatelessWidget {
  const _DaysLeftChip({required this.daysLeft});
  final int daysLeft;

  @override
  Widget build(BuildContext context) {
    final color = daysLeft <= 7
        ? _kNoShow
        : daysLeft <= 14
            ? _kAmber
            : _kDone;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.hourglass_bottom, size: 12, color: color),
          const SizedBox(width: 4),
          Text(
            daysLeft == 0 ? 'Expired' : '${daysLeft}d left',
            style: TextStyle(
                color: color, fontSize: 11, fontWeight: FontWeight.w700),
          ),
        ],
      ),
    );
  }
}

class _Tag extends StatelessWidget {
  const _Tag({required this.label, required this.color});
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: TextStyle(
            color: color, fontSize: 11, fontWeight: FontWeight.w700),
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
      foregroundImage:
          (url != null && url!.isNotEmpty) ? NetworkImage(url!) : null,
      child: Text(
        initials.isEmpty ? '?' : initials,
        style: TextStyle(
            color: scheme.onSurfaceVariant, fontWeight: FontWeight.w700),
      ),
    );
  }
}
