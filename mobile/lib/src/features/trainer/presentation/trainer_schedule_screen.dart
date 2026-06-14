import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/util/formatters.dart';
import '../../client/presentation/widgets/client_widgets.dart';
import '../data/trainer_models.dart';
import '../data/trainer_repository.dart';
import 'widgets/trainer_session_tile.dart';

/// Trainer "Schedule" tab — an agenda of upcoming sessions (today onward),
/// grouped by day. Tap any row to open the session detail.
class TrainerScheduleScreen extends ConsumerWidget {
  const TrainerScheduleScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final upcoming = ref.watch(trainerUpcomingProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Schedule')),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(trainerUpcomingProvider.future),
        child: upcoming.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ListView(
            children: [
              const SizedBox(height: 120),
              ErrorRetry(
                message: e.toString(),
                onRetry: () => ref.invalidate(trainerUpcomingProvider),
              ),
            ],
          ),
          data: (sessions) {
            if (sessions.isEmpty) {
              return ListView(
                children: const [
                  SizedBox(height: 120),
                  EmptyState(
                    icon: Icons.calendar_today,
                    message: 'No upcoming sessions.',
                  ),
                ],
              );
            }
            final groups = _groupByDay(sessions);
            return ListView(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
              children: [
                for (final entry in groups.entries) ...[
                  SectionHeader(title: _dayLabel(entry.key)),
                  for (final s in entry.value)
                    TrainerSessionTile(
                      session: s,
                      onTap: () => context.push('/trainer/sessions/${s.id}'),
                    ),
                  const SizedBox(height: 8),
                ],
              ],
            );
          },
        ),
      ),
    );
  }

  /// Stable insertion-ordered grouping by local calendar day (the API already
  /// returns sessions sorted by date then time).
  static Map<DateTime, List<TrainerSession>> _groupByDay(
    List<TrainerSession> sessions,
  ) {
    final map = <DateTime, List<TrainerSession>>{};
    for (final s in sessions) {
      final d = s.scheduledDate;
      final key = d == null ? DateTime(0) : DateTime(d.year, d.month, d.day);
      (map[key] ??= []).add(s);
    }
    return map;
  }

  static String _dayLabel(DateTime day) {
    if (day == DateTime(0)) return 'Unscheduled';
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final diff = day.difference(today).inDays;
    if (diff == 0) return 'Today';
    if (diff == 1) return 'Tomorrow';
    return Fmt.dayMonthYear(day);
  }
}
