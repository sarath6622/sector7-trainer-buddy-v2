import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/util/formatters.dart';
import '../../auth/application/auth_controller.dart';
import '../data/client_models.dart';
import '../data/client_repository.dart';
import 'widgets/client_widgets.dart';

class ClientDashboardScreen extends ConsumerWidget {
  const ClientDashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authControllerProvider).user;
    final dashboard = ref.watch(clientDashboardProvider);

    return Scaffold(
      appBar: AppBar(title: Text('Hi, ${user?.firstName ?? 'there'}')),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(clientDashboardProvider.future),
        child: dashboard.when(
          loading: () => const _LoadingList(),
          error: (e, _) => ListView(
            children: [
              const SizedBox(height: 120),
              ErrorRetry(
                message: e.toString(),
                onRetry: () => ref.invalidate(clientDashboardProvider),
              ),
            ],
          ),
          data: (d) => _DashboardBody(dashboard: d),
        ),
      ),
    );
  }
}

class _DashboardBody extends StatelessWidget {
  const _DashboardBody({required this.dashboard});
  final ClientDashboard dashboard;

  @override
  Widget build(BuildContext context) {
    final d = dashboard;
    final stats = d.engagementStats;
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
      children: [
        if (d.activeSession != null) ...[
          _ActiveSessionBanner(session: d.activeSession!),
          const SizedBox(height: 16),
        ],

        // This month's session counters.
        const SectionHeader(title: 'This month'),
        Row(
          children: [
            Expanded(
              child: StatCard(
                label: 'Used',
                value: '${d.sessionCount.used}',
                icon: Icons.check_circle_outline,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: StatCard(
                label: 'Remaining',
                value: '${d.sessionCount.remaining}',
                icon: Icons.event_available_outlined,
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),

        // Next session.
        const SectionHeader(title: 'Next session'),
        _NextSessionCard(session: d.nextSession),
        const SizedBox(height: 16),

        // Engagement stats.
        const SectionHeader(title: 'Your stats'),
        Row(
          children: [
            Expanded(
              child: StatCard(
                label: 'Day streak',
                value: '${stats.streak}',
                icon: Icons.local_fire_department_outlined,
                accent: Colors.orange,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: StatCard(
                label: 'All-time',
                value: '${stats.allTimeCompleted}',
                icon: Icons.emoji_events_outlined,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: StatCard(
                label: 'Attendance',
                value: stats.monthAttendanceRate == null
                    ? '—'
                    : '${stats.monthAttendanceRate}%',
                icon: Icons.percent,
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Text(
          'Last session ${Fmt.daysAgo(stats.daysSinceLastSession)}',
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
        ),

        // Trainer / package.
        if (d.trainerName != null || d.packageExpiry != null) ...[
          const SizedBox(height: 16),
          _TrainerCard(
            trainerName: d.trainerName,
            packageExpiry: d.packageExpiry,
          ),
        ],

        // Personal records.
        if (d.prs.isNotEmpty) ...[
          const SizedBox(height: 16),
          const SectionHeader(title: 'Personal records'),
          Card(
            child: Column(
              children: [
                for (final pr in d.prs)
                  ListTile(
                    leading: const Icon(Icons.fitness_center),
                    title: Text(pr.exerciseName),
                    subtitle: Text(pr.muscle),
                    trailing: Text(
                      '${pr.maxWeightKg % 1 == 0 ? pr.maxWeightKg.toInt() : pr.maxWeightKg} kg',
                      style: Theme.of(context)
                          .textTheme
                          .titleMedium
                          ?.copyWith(fontWeight: FontWeight.w700),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ],
    );
  }
}

class _ActiveSessionBanner extends StatelessWidget {
  const _ActiveSessionBanner({required this.session});
  final SessionSummary session;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Card(
      color: scheme.primaryContainer,
      child: InkWell(
        onTap: () => context.push('/client/sessions/${session.id}'),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Icon(Icons.play_circle_fill, color: scheme.onPrimaryContainer, size: 34),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Session in progress',
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                            color: scheme.onPrimaryContainer,
                            fontWeight: FontWeight.w700,
                          ),
                    ),
                    Text(
                      '${Fmt.time(session.scheduledTime)}'
                      '${session.trainerName != null ? ' · ${session.trainerName}' : ''}',
                      style: TextStyle(color: scheme.onPrimaryContainer),
                    ),
                  ],
                ),
              ),
              Icon(Icons.chevron_right, color: scheme.onPrimaryContainer),
            ],
          ),
        ),
      ),
    );
  }
}

class _NextSessionCard extends StatelessWidget {
  const _NextSessionCard({required this.session});
  final SessionSummary? session;

  @override
  Widget build(BuildContext context) {
    final s = session;
    if (s == null) {
      return const Card(
        child: ListTile(
          leading: Icon(Icons.event_busy),
          title: Text('None scheduled'),
          subtitle: Text('Your trainer will book your next session.'),
        ),
      );
    }
    return Card(
      child: ListTile(
        onTap: () => context.push('/client/sessions/${s.id}'),
        leading: const Icon(Icons.event),
        title: Text(Fmt.dateTime(s.scheduledDate, s.scheduledTime)),
        subtitle: Text(
          [
            if (s.trainerName != null) 'with ${s.trainerName}',
            '${s.durationMin} min',
          ].join(' · '),
        ),
        trailing: const Icon(Icons.chevron_right),
      ),
    );
  }
}

class _TrainerCard extends StatelessWidget {
  const _TrainerCard({required this.trainerName, required this.packageExpiry});
  final String? trainerName;
  final PackageExpiry? packageExpiry;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final expiry = packageExpiry;
    String? expiryLabel;
    Color? expiryColor;
    if (expiry != null) {
      if (expiry.isExpired) {
        expiryLabel = 'Package expired';
        expiryColor = scheme.error;
      } else if (expiry.daysUntilExpiry != null) {
        expiryLabel = 'Expires in ${expiry.daysUntilExpiry} days'
            '${expiry.endDate != null ? ' · ${Fmt.dayMonth(expiry.endDate)}' : ''}';
        if (expiry.daysUntilExpiry! <= 7) expiryColor = Colors.orange.shade300;
      }
    }
    return Card(
      child: ListTile(
        leading: const Icon(Icons.person_pin),
        title: Text(trainerName ?? 'No trainer assigned'),
        subtitle: expiryLabel == null
            ? null
            : Text(expiryLabel, style: TextStyle(color: expiryColor)),
      ),
    );
  }
}

class _LoadingList extends StatelessWidget {
  const _LoadingList();

  @override
  Widget build(BuildContext context) {
    return ListView(
      children: const [
        SizedBox(height: 160),
        Center(child: CircularProgressIndicator()),
      ],
    );
  }
}
