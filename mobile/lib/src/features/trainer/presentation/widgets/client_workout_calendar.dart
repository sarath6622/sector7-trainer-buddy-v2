import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/util/formatters.dart';
import '../../data/trainer_models.dart';
import '../../data/trainer_repository.dart';

const _kWorkout = Color(0xFF22C55E); // emerald-500
const _kPR = Color(0xFFFBBF24); // amber-400
const _kToday = Color(0xFFF97316); // orange-500

const _weekdays = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const _months = [
  'January', 'February', 'March', 'April', 'May', 'June', //
  'July', 'August', 'September', 'October', 'November', 'December',
];

/// Trainer-facing per-client workout calendar — a horizontal strip of client
/// tabs above a month grid of that client's completed PT days + PR days. Ports
/// the web `ClientWorkoutCalendar` + `WorkoutCalendarCard`. Tapping a workout
/// day opens a detail sheet of the logged exercises.
class ClientWorkoutCalendar extends ConsumerStatefulWidget {
  const ClientWorkoutCalendar({super.key, required this.clients});

  final List<TrainerClient> clients;

  @override
  ConsumerState<ClientWorkoutCalendar> createState() =>
      _ClientWorkoutCalendarState();
}

class _ClientWorkoutCalendarState extends ConsumerState<ClientWorkoutCalendar> {
  late String _selectedId = widget.clients.first.clientProfileId;
  late DateTime _viewMonth = DateTime(DateTime.now().year, DateTime.now().month);

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final now = DateTime.now();
    final isCurrentMonth =
        _viewMonth.year == now.year && _viewMonth.month == now.month;
    final monthParam = '${_viewMonth.year.toString().padLeft(4, '0')}-'
        '${_viewMonth.month.toString().padLeft(2, '0')}';
    final calendar = ref.watch(
      trainerWorkoutCalendarProvider((clientId: _selectedId, month: monthParam)),
    );
    final month = calendar.valueOrNull ?? WorkoutCalendarMonth.empty;
    final loading = calendar.isLoading;

    return Container(
      decoration: BoxDecoration(
        color: scheme.surfaceContainer,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: scheme.outlineVariant.withValues(alpha: 0.08)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Title
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
            child: Row(
              children: [
                Icon(Icons.calendar_month_outlined,
                    size: 18, color: scheme.onSurfaceVariant),
                const SizedBox(width: 8),
                Text(
                  'Client Calendar',
                  style: Theme.of(context)
                      .textTheme
                      .titleSmall
                      ?.copyWith(fontWeight: FontWeight.w700),
                ),
                const SizedBox(width: 6),
                Text(
                  '· workout history',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: scheme.onSurfaceVariant,
                      ),
                ),
              ],
            ),
          ),

          // Client picker
          SizedBox(
            height: 56,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
              itemCount: widget.clients.length,
              separatorBuilder: (_, _) => const SizedBox(width: 8),
              itemBuilder: (context, i) {
                final c = widget.clients[i];
                final active = c.clientProfileId == _selectedId;
                return _ClientPill(
                  name: c.name,
                  active: active,
                  onTap: () => setState(() {
                    _selectedId = c.clientProfileId;
                    _viewMonth = DateTime(now.year, now.month);
                  }),
                );
              },
            ),
          ),

          Divider(
              height: 1, color: scheme.outlineVariant.withValues(alpha: 0.08)),

          // Month nav
          Padding(
            padding: const EdgeInsets.fromLTRB(8, 10, 8, 0),
            child: Row(
              children: [
                IconButton(
                  onPressed: () => setState(() => _viewMonth =
                      DateTime(_viewMonth.year, _viewMonth.month - 1)),
                  icon: const Icon(Icons.chevron_left, size: 20),
                ),
                Expanded(
                  child: Column(
                    children: [
                      Text(
                        '${_months[_viewMonth.month - 1]} ${_viewMonth.year}',
                        style: Theme.of(context)
                            .textTheme
                            .titleSmall
                            ?.copyWith(fontWeight: FontWeight.w700),
                      ),
                      Text(
                        loading
                            ? '…'
                            : '${month.totalDays} PT day${month.totalDays == 1 ? '' : 's'}',
                        style: Theme.of(context).textTheme.labelSmall?.copyWith(
                              color: scheme.onSurfaceVariant,
                            ),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  onPressed: isCurrentMonth
                      ? null
                      : () => setState(() => _viewMonth =
                          DateTime(_viewMonth.year, _viewMonth.month + 1)),
                  icon: const Icon(Icons.chevron_right, size: 20),
                ),
              ],
            ),
          ),

          // Weekday row
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 6, 12, 0),
            child: Row(
              children: [
                for (final w in _weekdays)
                  Expanded(
                    child: Text(
                      w,
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.labelSmall?.copyWith(
                            color: scheme.onSurfaceVariant,
                            fontSize: 9,
                          ),
                    ),
                  ),
              ],
            ),
          ),

          // Day grid
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 4, 12, 12),
            child: _MonthGrid(
              viewMonth: _viewMonth,
              days: month.days,
              onTapDay: (dateStr, isPR) => _openDay(dateStr, isPR),
            ),
          ),

          Divider(
              height: 1, color: scheme.outlineVariant.withValues(alpha: 0.08)),

          // Legend
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 14),
            child: Wrap(
              alignment: WrapAlignment.center,
              spacing: 16,
              runSpacing: 8,
              children: const [
                _LegendItem(color: _kWorkout, label: 'Workout', filled: true),
                _LegendItem(color: _kPR, label: 'PR Day', star: true),
                _LegendItem(color: _kToday, label: 'Today', ring: true),
                _LegendItem(color: null, label: 'No workout'),
              ],
            ),
          ),
        ],
      ),
    );
  }

  void _openDay(String dateStr, bool isPR) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _DayDetailSheet(
        clientProfileId: _selectedId,
        date: dateStr,
        isPR: isPR,
      ),
    );
  }
}

class _ClientPill extends StatelessWidget {
  const _ClientPill(
      {required this.name, required this.active, required this.onTap});
  final String name;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Material(
      color: active ? scheme.primary.withValues(alpha: 0.12) : Colors.transparent,
      borderRadius: BorderRadius.circular(999),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(999),
            border: Border.all(
              color: active
                  ? scheme.primary
                  : scheme.outlineVariant.withValues(alpha: 0.08),
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 22,
                height: 22,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: active
                      ? scheme.primary.withValues(alpha: 0.2)
                      : scheme.surfaceContainerHighest,
                ),
                child: Text(
                  _initials(name),
                  style: Theme.of(context).textTheme.labelSmall?.copyWith(
                        fontWeight: FontWeight.w800,
                        fontSize: 9,
                        color: active ? scheme.primary : scheme.onSurface,
                      ),
                ),
              ),
              const SizedBox(width: 8),
              Text(
                name,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      fontWeight: FontWeight.w600,
                      color: active ? scheme.primary : scheme.onSurfaceVariant,
                    ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _MonthGrid extends StatelessWidget {
  const _MonthGrid({
    required this.viewMonth,
    required this.days,
    required this.onTapDay,
  });

  final DateTime viewMonth;
  final Map<String, WorkoutCalendarDay> days;
  final void Function(String dateStr, bool isPR) onTapDay;

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final todayStr = _ymd(DateTime(now.year, now.month, now.day));
    final first = DateTime(viewMonth.year, viewMonth.month, 1);
    final daysInMonth = DateTime(viewMonth.year, viewMonth.month + 1, 0).day;
    final lead = (first.weekday + 6) % 7; // Monday-first leading blanks

    final cells = <({DateTime date, bool inMonth})>[];
    for (var i = lead; i > 0; i--) {
      cells.add((date: first.subtract(Duration(days: i)), inMonth: false));
    }
    for (var d = 1; d <= daysInMonth; d++) {
      cells.add((date: DateTime(viewMonth.year, viewMonth.month, d), inMonth: true));
    }
    while (cells.length % 7 != 0) {
      cells.add((date: cells.last.date.add(const Duration(days: 1)), inMonth: false));
    }

    return GridView.count(
      crossAxisCount: 7,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 4,
      crossAxisSpacing: 4,
      children: [
        for (final cell in cells)
          _DayCell(
            date: cell.date,
            inMonth: cell.inMonth,
            day: cell.inMonth ? days[_ymd(cell.date)] : null,
            isToday: cell.inMonth && _ymd(cell.date) == todayStr,
            onTapDay: onTapDay,
          ),
      ],
    );
  }
}

class _DayCell extends StatelessWidget {
  const _DayCell({
    required this.date,
    required this.inMonth,
    required this.day,
    required this.isToday,
    required this.onTapDay,
  });

  final DateTime date;
  final bool inMonth;
  final WorkoutCalendarDay? day;
  final bool isToday;
  final void Function(String dateStr, bool isPR) onTapDay;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final clickable = day != null;

    Color border = Colors.transparent;
    Color bg = Colors.transparent;
    Color fg = scheme.onSurfaceVariant.withValues(alpha: inMonth ? 0.6 : 0.3);
    if (day?.isPR == true) {
      border = _kPR.withValues(alpha: 0.6);
      bg = _kPR.withValues(alpha: 0.1);
      fg = _kPR;
    } else if (day != null) {
      border = _kWorkout.withValues(alpha: 0.6);
      bg = _kWorkout.withValues(alpha: 0.1);
      fg = _kWorkout;
    } else if (inMonth) {
      border = scheme.outlineVariant.withValues(alpha: 0.14);
    }

    return Center(
      child: GestureDetector(
        onTap: clickable ? () => onTapDay(_ymd(date), day!.isPR) : null,
        child: Container(
          width: 36,
          height: 36,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: bg,
            shape: BoxShape.circle,
            border: Border.all(
              color: isToday ? _kToday : border,
              width: isToday ? 2 : 1,
            ),
          ),
          child: day?.isPR == true
              ? const Icon(Icons.star_rounded, size: 18, color: _kPR)
              : Text(
                  '${date.day}',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: fg,
                        fontWeight: FontWeight.w600,
                      ),
                ),
        ),
      ),
    );
  }
}

class _LegendItem extends StatelessWidget {
  const _LegendItem({
    required this.color,
    required this.label,
    this.filled = false,
    this.star = false,
    this.ring = false,
  });

  final Color? color;
  final String label;
  final bool filled;
  final bool star;
  final bool ring;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    Widget marker;
    if (star) {
      marker = const Icon(Icons.star_rounded, size: 15, color: _kPR);
    } else if (ring) {
      marker = Container(
        width: 14,
        height: 14,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          border: Border.all(color: _kToday, width: 2),
        ),
      );
    } else if (filled && color != null) {
      marker = Container(
        width: 14,
        height: 14,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: color!.withValues(alpha: 0.1),
          border: Border.all(color: color!.withValues(alpha: 0.6)),
        ),
        child: Icon(Icons.check, size: 9, color: color),
      );
    } else {
      marker = Container(
        width: 14,
        height: 14,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          border: Border.all(color: scheme.outlineVariant),
        ),
      );
    }
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        marker,
        const SizedBox(width: 6),
        Text(
          label,
          style: Theme.of(context).textTheme.labelSmall?.copyWith(
                color: scheme.onSurfaceVariant,
              ),
        ),
      ],
    );
  }
}

/// Bottom sheet showing one day's logged exercises for the selected client.
class _DayDetailSheet extends ConsumerWidget {
  const _DayDetailSheet({
    required this.clientProfileId,
    required this.date,
    required this.isPR,
  });

  final String clientProfileId;
  final String date;
  final bool isPR;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    final logsAsync = ref.watch(
      trainerDayWorkoutsProvider((clientId: clientProfileId, date: date)),
    );
    final parsed = DateTime.tryParse('${date}T00:00:00');

    return SafeArea(
      child: Container(
        margin: const EdgeInsets.all(8),
        constraints: BoxConstraints(
          maxHeight: MediaQuery.of(context).size.height * 0.8,
        ),
        decoration: BoxDecoration(
          color: scheme.surfaceContainerHigh,
          borderRadius: BorderRadius.circular(20),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Header
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 8, 8),
              child: Row(
                children: [
                  Expanded(
                    child: Wrap(
                      crossAxisAlignment: WrapCrossAlignment.center,
                      spacing: 8,
                      children: [
                        Text(
                          parsed == null ? date : Fmt.dayMonth(parsed),
                          style: Theme.of(context)
                              .textTheme
                              .titleMedium
                              ?.copyWith(fontWeight: FontWeight.w700),
                        ),
                        if (isPR)
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 8, vertical: 2),
                            decoration: BoxDecoration(
                              color: _kPR.withValues(alpha: 0.12),
                              borderRadius: BorderRadius.circular(999),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: const [
                                Icon(Icons.star_rounded, size: 13, color: _kPR),
                                SizedBox(width: 4),
                                Text('PR Day',
                                    style: TextStyle(
                                        color: _kPR,
                                        fontSize: 11,
                                        fontWeight: FontWeight.w700)),
                              ],
                            ),
                          ),
                      ],
                    ),
                  ),
                  IconButton(
                    onPressed: () => Navigator.of(context).pop(),
                    icon: const Icon(Icons.close, size: 20),
                  ),
                ],
              ),
            ),
            Flexible(
              child: logsAsync.when(
                loading: () => const Padding(
                  padding: EdgeInsets.all(36),
                  child: Center(child: CircularProgressIndicator()),
                ),
                error: (e, _) => Padding(
                  padding: const EdgeInsets.all(28),
                  child: Text(
                    'Could not load this day.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: scheme.onSurfaceVariant),
                  ),
                ),
                data: (logs) => _DayBody(logs: logs),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _DayBody extends StatelessWidget {
  const _DayBody({required this.logs});
  final List<CalendarDayLog> logs;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    if (logs.isEmpty) {
      return Padding(
        padding: const EdgeInsets.fromLTRB(24, 8, 24, 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.fitness_center,
                size: 30, color: scheme.onSurfaceVariant.withValues(alpha: 0.5)),
            const SizedBox(height: 10),
            Text(
              'Session completed — no exercises were logged.',
              textAlign: TextAlign.center,
              style: TextStyle(color: scheme.onSurfaceVariant),
            ),
          ],
        ),
      );
    }

    final session = logs.first;
    final totalSets = logs.fold<int>(0, (sum, l) => sum + l.sets.length);
    final muscles = <String>{
      for (final l in logs)
        if (l.muscleGroup != null && l.muscleGroup!.isNotEmpty) l.muscleGroup!,
    }.toList();

    return ListView(
      shrinkWrap: true,
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 20),
      children: [
        // Summary card
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: scheme.surfaceContainerHighest.withValues(alpha: 0.5),
            borderRadius: BorderRadius.circular(14),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Wrap(
                spacing: 12,
                runSpacing: 4,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  if (session.scheduledTime != null)
                    _MetaChip(
                        icon: Icons.schedule,
                        text: Fmt.time(session.scheduledTime!)),
                  if (session.trainerName != null)
                    _MetaChip(
                        icon: Icons.person_outline,
                        text: session.trainerName!),
                  Text(
                    '${logs.length} exercise${logs.length == 1 ? '' : 's'} · $totalSets sets',
                    style: Theme.of(context)
                        .textTheme
                        .bodySmall
                        ?.copyWith(fontWeight: FontWeight.w600),
                  ),
                ],
              ),
              if (muscles.isNotEmpty) ...[
                const SizedBox(height: 8),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    for (final m in muscles)
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: scheme.primary.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: Text(
                          m,
                          style: TextStyle(
                              color: scheme.primary,
                              fontSize: 10,
                              fontWeight: FontWeight.w600),
                        ),
                      ),
                  ],
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: 10),

        // Exercise list
        for (final log in logs)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(14),
                border: Border.all(
                    color: scheme.outlineVariant.withValues(alpha: 0.08)),
              ),
              child: Row(
                children: [
                  Container(
                    width: 34,
                    height: 34,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: scheme.primary.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Icon(Icons.fitness_center,
                        size: 16, color: scheme.primary),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          log.exerciseName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: Theme.of(context)
                              .textTheme
                              .bodyMedium
                              ?.copyWith(fontWeight: FontWeight.w600),
                        ),
                        if (log.muscleGroup != null)
                          Text(
                            log.muscleGroup!,
                            style: Theme.of(context)
                                .textTheme
                                .labelSmall
                                ?.copyWith(color: scheme.onSurfaceVariant),
                          ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(
                        '${log.sets.length} set${log.sets.length == 1 ? '' : 's'}',
                        style: Theme.of(context)
                            .textTheme
                            .bodySmall
                            ?.copyWith(fontWeight: FontWeight.w700),
                      ),
                      if (log.setSummary != null)
                        Text(
                          log.setSummary!,
                          style: Theme.of(context)
                              .textTheme
                              .labelSmall
                              ?.copyWith(color: scheme.onSurfaceVariant),
                        ),
                    ],
                  ),
                ],
              ),
            ),
          ),

        if (session.sessionId != null) ...[
          const SizedBox(height: 4),
          FilledButton.tonal(
            onPressed: () {
              Navigator.of(context).pop();
              context.push('/trainer/sessions/${session.sessionId}');
            },
            style: FilledButton.styleFrom(
              minimumSize: const Size.fromHeight(44),
            ),
            child: const Text('View full session'),
          ),
        ],
      ],
    );
  }
}

class _MetaChip extends StatelessWidget {
  const _MetaChip({required this.icon, required this.text});
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 13, color: scheme.onSurfaceVariant),
        const SizedBox(width: 4),
        Text(
          text,
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: scheme.onSurfaceVariant,
              ),
        ),
      ],
    );
  }
}

String _ymd(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-'
    '${d.month.toString().padLeft(2, '0')}-'
    '${d.day.toString().padLeft(2, '0')}';

String _initials(String name) {
  final parts =
      name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
  if (parts.isEmpty) return '?';
  if (parts.length == 1) return parts.first.substring(0, 1).toUpperCase();
  return (parts.first.substring(0, 1) + parts.last.substring(0, 1))
      .toUpperCase();
}
