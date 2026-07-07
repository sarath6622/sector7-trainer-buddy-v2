import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/feedback/haptics.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/util/formatters.dart';
import '../../../../core/widgets/skeleton.dart';
import '../../../trainer/data/trainer_models.dart' show WorkoutCalendarDay;
import '../../data/client_repository.dart';
import '../../data/progress_models.dart' show WorkoutHistoryEntry;
import 'client_widgets.dart' show WorkoutLogCard;

// A logged PT day maps to the design-system success colour (theme-aware,
// resolved via AppColors at the call sites below).
const _kPR = Color(0xFFFBBF24); // amber-400 — a PR day
const _kToday = Color(0xFFF97316); // orange-500 — today's ring

const _weekdays = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const _months = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

String _ymd(DateTime d) =>
    '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

/// The client home's workout calendar — mirrors the PWA `WorkoutCalendarCard`:
/// a month grid marking completed PT days (green), PR days (gold star) and today
/// (orange ring), with a per-day workout sheet. Read-only, the client's own data.
class ClientWorkoutCalendarCard extends ConsumerStatefulWidget {
  const ClientWorkoutCalendarCard({super.key});

  @override
  ConsumerState<ClientWorkoutCalendarCard> createState() =>
      _ClientWorkoutCalendarCardState();
}

class _ClientWorkoutCalendarCardState
    extends ConsumerState<ClientWorkoutCalendarCard> {
  late DateTime _viewMonth = DateTime(DateTime.now().year, DateTime.now().month);

  String get _monthKey =>
      '${_viewMonth.year}-${_viewMonth.month.toString().padLeft(2, '0')}';

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final now = DateTime.now();
    final isCurrentMonth =
        _viewMonth.year == now.year && _viewMonth.month == now.month;
    final monthAsync = ref.watch(clientWorkoutCalendarProvider(_monthKey));
    final month = monthAsync.valueOrNull;
    final totalDays = month?.totalDays ?? 0;

    return Container(
      decoration: BoxDecoration(
        color: scheme.surfaceContainerLow,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: scheme.outlineVariant),
      ),
      child: Column(
        children: [
          // Month nav.
          Padding(
            padding: const EdgeInsets.fromLTRB(8, 10, 8, 0),
            child: Row(
              children: [
                IconButton(
                  onPressed: () => setState(() =>
                      _viewMonth = DateTime(_viewMonth.year, _viewMonth.month - 1)),
                  icon: const Icon(Icons.chevron_left, size: 20),
                  color: scheme.onSurfaceVariant,
                ),
                Expanded(
                  child: Column(
                    children: [
                      Text('${_months[_viewMonth.month - 1]} ${_viewMonth.year}',
                          style: const TextStyle(fontWeight: FontWeight.w700)),
                      Text(
                        monthAsync.isLoading
                            ? '…'
                            : '$totalDays PT day${totalDays == 1 ? '' : 's'}',
                        style:
                            TextStyle(fontSize: 11, color: scheme.onSurfaceVariant),
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
                  color: scheme.onSurfaceVariant,
                ),
              ],
            ),
          ),
          // Weekday row.
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 6, 12, 0),
            child: Row(
              children: [
                for (final w in _weekdays)
                  Expanded(
                    child: Text(w,
                        textAlign: TextAlign.center,
                        style: TextStyle(fontSize: 9, color: scheme.onSurfaceVariant)),
                  ),
              ],
            ),
          ),
          // Grid.
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 4, 12, 12),
            child: _MonthGrid(
              viewMonth: _viewMonth,
              days: month?.days ?? const {},
              onTapDay: _openDay,
            ),
          ),
          Divider(height: 1, color: scheme.outlineVariant),
          // Legend.
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 14),
            child: Wrap(
              alignment: WrapAlignment.center,
              spacing: 16,
              runSpacing: 8,
              children: [
                _LegendItem(
                    color: AppColors.of(context).success,
                    label: 'Workout',
                    filled: true),
                const _LegendItem(color: _kPR, label: 'PR Day', star: true),
                const _LegendItem(color: _kToday, label: 'Today', ring: true),
                const _LegendItem(color: null, label: 'No workout'),
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
      builder: (_) => _DaySheet(date: dateStr, isPR: isPR),
    );
  }
}

class _MonthGrid extends StatelessWidget {
  const _MonthGrid({required this.viewMonth, required this.days, required this.onTapDay});

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

    // Plain Column of Rows rather than a shrink-wrapped GridView: nesting a
    // scrollable GridView inside the page's scroll view mis-sized its main-axis
    // extent (box taller than its rows -> dead space above/below the weeks).
    // A non-scrolling Column is deterministic: height == rows*36 + gaps. Wrapped
    // in one RepaintBoundary so the static grid still rasterizes to a single
    // cacheable texture (no per-cell layers) for scroll perf on weak GPUs.
    final rowCount = cells.length ~/ 7;
    return RepaintBoundary(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (var r = 0; r < rowCount; r++) ...[
            if (r > 0) const SizedBox(height: 3),
            SizedBox(
              height: 36,
              child: Row(
                children: [
                  for (var c = 0; c < 7; c++)
                    Expanded(
                      child: _DayCell(
                        date: cells[r * 7 + c].date,
                        inMonth: cells[r * 7 + c].inMonth,
                        day: cells[r * 7 + c].inMonth
                            ? days[_ymd(cells[r * 7 + c].date)]
                            : null,
                        isToday: cells[r * 7 + c].inMonth &&
                            _ymd(cells[r * 7 + c].date) == todayStr,
                        onTapDay: onTapDay,
                      ),
                    ),
                ],
              ),
            ),
          ],
        ],
      ),
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
    final workout = AppColors.of(context).success;
    final clickable = day != null;

    Color border = Colors.transparent;
    Color bg = Colors.transparent;
    Color fg = scheme.onSurfaceVariant.withValues(alpha: inMonth ? 0.6 : 0.3);
    if (day?.isPR == true) {
      border = _kPR.withValues(alpha: 0.6);
      bg = _kPR.withValues(alpha: 0.1);
      fg = _kPR;
    } else if (day != null) {
      border = workout.withValues(alpha: 0.6);
      bg = workout.withValues(alpha: 0.1);
      fg = workout;
    } else if (inMonth) {
      border = scheme.outlineVariant.withValues(alpha: 0.14);
    }

    return Center(
      child: GestureDetector(
        onTap: clickable
            ? () {
                Haptics.select();
                onTapDay(_ymd(date), day!.isPR);
              }
            : null,
        child: Container(
          width: 32,
          height: 32,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: bg,
            shape: BoxShape.circle,
            // Skip stroking a (transparent) border on empty out-of-month cells.
            border: (isToday || border != Colors.transparent)
                ? Border.all(
                    color: isToday ? _kToday : border,
                    width: isToday ? 2 : 1,
                  )
                : null,
          ),
          child: day?.isPR == true
              ? const Icon(Icons.star_rounded, size: 18, color: _kPR)
              : Text('${date.day}',
                  style: TextStyle(color: fg, fontWeight: FontWeight.w600, fontSize: 13)),
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
      marker = Icon(Icons.star_rounded, size: 16, color: color);
    } else if (ring) {
      marker = Container(
        width: 14,
        height: 14,
        decoration: BoxDecoration(
            shape: BoxShape.circle, border: Border.all(color: color!, width: 2)),
      );
    } else {
      marker = Container(
        width: 14,
        height: 14,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: filled ? color!.withValues(alpha: 0.15) : Colors.transparent,
          border: Border.all(
            color: color ?? scheme.outlineVariant.withValues(alpha: 0.3),
            width: filled ? 1.5 : 1,
          ),
        ),
        child: filled ? Icon(Icons.check, size: 9, color: color) : null,
      );
    }
    return Row(mainAxisSize: MainAxisSize.min, children: [
      marker,
      const SizedBox(width: 6),
      Text(label, style: TextStyle(fontSize: 11, color: scheme.onSurfaceVariant)),
    ]);
  }
}

/// Per-day workouts, derived from the client's workout history (filtered to the
/// tapped date — no extra endpoint needed).
class _DaySheet extends ConsumerWidget {
  const _DaySheet({required this.date, required this.isPR});
  final String date;
  final bool isPR;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    final parsed = DateTime.tryParse(date);
    final history = ref.watch(workoutHistoryProvider);
    final logs = history.valueOrNull
            ?.where((e) => e.sessionDate != null && _ymd(e.sessionDate!) == date)
            .toList() ??
        const <WorkoutHistoryEntry>[];

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                margin: const EdgeInsets.only(bottom: 12),
                decoration: BoxDecoration(
                    color: scheme.outlineVariant, borderRadius: BorderRadius.circular(2)),
              ),
            ),
            Row(children: [
              Text(parsed != null ? Fmt.dayMonthYear(parsed) : date,
                  style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
              if (isPR) ...[
                const SizedBox(width: 8),
                const Icon(Icons.star_rounded, size: 18, color: _kPR),
                const Text(' PR', style: TextStyle(color: _kPR, fontWeight: FontWeight.w700)),
              ],
            ]),
            const SizedBox(height: 12),
            Flexible(
              child: history.isLoading
                  ? const Padding(
                      padding: EdgeInsets.symmetric(vertical: 16),
                      child: Shimmer(
                        child: Column(
                          children: [
                            Bone(width: double.infinity, height: 56, radius: 12),
                            SizedBox(height: 10),
                            Bone(width: double.infinity, height: 56, radius: 12),
                          ],
                        ),
                      ),
                    )
                  : logs.isEmpty
                      ? Padding(
                          padding: const EdgeInsets.symmetric(vertical: 24),
                          child: Text('No logged exercises for this day.',
                              style: TextStyle(color: scheme.onSurfaceVariant)),
                        )
                      : ListView(
                          shrinkWrap: true,
                          children: [for (final e in logs) WorkoutLogCard(log: e.log)],
                        ),
            ),
          ],
        ),
      ),
    );
  }
}
