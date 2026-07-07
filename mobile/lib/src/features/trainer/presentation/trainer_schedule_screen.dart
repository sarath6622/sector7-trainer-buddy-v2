import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/feedback/haptics.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/util/formatters.dart';
import '../../../core/widgets/glass_dock_nav_bar.dart';
import '../../../core/widgets/skeleton.dart';
import '../../client/data/client_models.dart';
import '../../client/presentation/widgets/client_widgets.dart';
import '../data/trainer_models.dart';
import '../data/trainer_repository.dart';
import 'widgets/schedule_booking_sheet.dart';

// Agenda accent palette — shared vocabulary with the web schedule. Booked and
// available map to the design-system info/success colours (theme-aware, resolved
// via AppColors at the call sites below).

/// Trainer "Schedule" tab — a per-day agenda (ported from the web mobile view):
/// a Mon→Sun week strip, a booked/available summary for the day, the day's
/// sessions, the trainer's free slots (tap to book), and a legend.
class TrainerScheduleScreen extends ConsumerStatefulWidget {
  const TrainerScheduleScreen({super.key});

  @override
  ConsumerState<TrainerScheduleScreen> createState() =>
      _TrainerScheduleScreenState();
}

class _TrainerScheduleScreenState extends ConsumerState<TrainerScheduleScreen> {
  DateTime _selected = _dateOnly(DateTime.now());

  static DateTime _dateOnly(DateTime d) => DateTime(d.year, d.month, d.day);

  String get _selectedYmd => TrainerRepository.ymd(_selected);

  void _refresh() {
    ref.invalidate(trainerDayViewProvider(_selectedYmd));
    // Keep the dashboard's session lists in sync after a booking.
    ref.invalidate(trainerTodayProvider);
    ref.invalidate(trainerUpcomingProvider);
  }

  void _openBooking({String? startTime, int? durationMin}) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => ScheduleBookingSheet(
        date: _selectedYmd,
        presetStartTime: startTime,
        presetDurationMin: durationMin,
        onBooked: _refresh,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final day = ref.watch(trainerDayViewProvider(_selectedYmd));

    return Scaffold(
      appBar: AppBar(
        title: const Text('Schedule'),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: _AddButton(onTap: () => _openBooking()),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () => Haptics.onRefresh(() => ref.refresh(trainerDayViewProvider(_selectedYmd).future)),
        child: ListView(
          padding: EdgeInsets.fromLTRB(16, 12, 16, glassDockScrollInset(context)),
          children: [
            _WeekStrip(
              selected: _selected,
              onSelect: (d) => setState(() => _selected = d),
            ),
            const SizedBox(height: 16),
            _DaySummary(
              selected: _selected,
              day: day.valueOrNull,
              loading: day.isLoading,
              onToday: () =>
                  setState(() => _selected = _dateOnly(DateTime.now())),
            ),
            const SizedBox(height: 16),
            day.when(
              loading: () => const _AgendaSkeleton(),
              error: (e, _) => ErrorRetry(
                message: e.toString(),
                onRetry: () =>
                    ref.invalidate(trainerDayViewProvider(_selectedYmd)),
              ),
              data: (view) => Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _SectionLabel('Your Schedule'),
                  const SizedBox(height: 8),
                  if (view.sessions.isEmpty)
                    const _EmptyRow('No sessions booked for this day')
                  else
                    for (final s in view.sessions)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: _SessionRow(
                          session: s,
                          onTap: () =>
                              context.push('/trainer/sessions/${s.id}'),
                        ),
                      ),
                  const SizedBox(height: 16),
                  _SectionLabel('Available Slots',
                      subtitle: 'Tap a slot to schedule a session'),
                  const SizedBox(height: 8),
                  _SlotList(
                    view: view,
                    selected: _selected,
                    onBook: (slot) => _openBooking(
                      startTime: slot.startTime,
                      durationMin: slot.durationMin,
                    ),
                  ),
                  const SizedBox(height: 16),
                  const _Legend(),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Header "+" button ────────────────────────────────────────────────────────

class _AddButton extends StatelessWidget {
  const _AddButton({required this.onTap});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Material(
      color: scheme.primary,
      shape: const CircleBorder(),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: SizedBox(
          width: 38,
          height: 38,
          child: Icon(Icons.add, size: 22, color: scheme.onPrimary),
        ),
      ),
    );
  }
}

// ── Week strip ───────────────────────────────────────────────────────────────

class _WeekStrip extends StatelessWidget {
  const _WeekStrip({required this.selected, required this.onSelect});
  final DateTime selected;
  final void Function(DateTime) onSelect;

  @override
  Widget build(BuildContext context) {
    final today = DateTime(
        DateTime.now().year, DateTime.now().month, DateTime.now().day);
    // Monday of the selected week.
    final monday =
        selected.subtract(Duration(days: (selected.weekday + 6) % 7));
    final days = List.generate(7, (i) => monday.add(Duration(days: i)));
    const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    return Row(
      children: [
        for (var i = 0; i < 7; i++) ...[
          if (i > 0) const SizedBox(width: 6),
          Expanded(
            child: _DayCell(
              label: labels[i],
              day: days[i].day,
              isSelected: _sameDay(days[i], selected),
              isToday: _sameDay(days[i], today),
              onTap: () => onSelect(days[i]),
            ),
          ),
        ],
      ],
    );
  }

  static bool _sameDay(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;
}

class _DayCell extends StatelessWidget {
  const _DayCell({
    required this.label,
    required this.day,
    required this.isSelected,
    required this.isToday,
    required this.onTap,
  });
  final String label;
  final int day;
  final bool isSelected;
  final bool isToday;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final labelColor = isSelected
        ? scheme.onPrimary.withValues(alpha: 0.85)
        : isToday
            ? scheme.primary
            : scheme.onSurfaceVariant;
    return Material(
      color: isSelected ? scheme.primary : Colors.transparent,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Column(
            children: [
              Text(label,
                  style: Theme.of(context).textTheme.labelSmall?.copyWith(
                        color: labelColor,
                        fontWeight: FontWeight.w600,
                      )),
              const SizedBox(height: 4),
              Text('$day',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        color: isSelected ? scheme.onPrimary : scheme.onSurface,
                        fontWeight: FontWeight.w700,
                      )),
              const SizedBox(height: 4),
              Container(
                width: 4,
                height: 4,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: isToday
                      ? (isSelected ? scheme.onPrimary : scheme.primary)
                      : Colors.transparent,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Day summary ──────────────────────────────────────────────────────────────

class _DaySummary extends StatelessWidget {
  const _DaySummary({
    required this.selected,
    required this.day,
    required this.loading,
    required this.onToday,
  });
  final DateTime selected;
  final TrainerDayView? day;
  final bool loading;
  final VoidCallback onToday;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final colors = AppColors.of(context);
    final now = DateTime.now();
    final isToday = selected.year == now.year &&
        selected.month == now.month &&
        selected.day == now.day;
    final label = '${isToday ? 'Today, ' : ''}${Fmt.weekdayDayMonth(selected)}';
    final summary = day?.summary ?? TrainerDaySummary.empty;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: scheme.surfaceContainer,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: scheme.outlineVariant.withValues(alpha: 0.08)),
      ),
      child: Row(
        children: [
          Container(
            width: 38,
            height: 38,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: scheme.primary.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(Icons.calendar_today, size: 18, color: scheme.primary),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label,
                    style: Theme.of(context)
                        .textTheme
                        .titleSmall
                        ?.copyWith(fontWeight: FontWeight.w700)),
                const SizedBox(height: 2),
                if (loading)
                  Container(
                    height: 12,
                    width: 160,
                    decoration: BoxDecoration(
                      color: scheme.surfaceContainerHighest,
                      borderRadius: BorderRadius.circular(6),
                    ),
                  )
                else
                  Text.rich(
                    TextSpan(
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: scheme.onSurfaceVariant,
                          ),
                      children: [
                        TextSpan(
                            text:
                                '${summary.sessionCount} session${summary.sessionCount == 1 ? '' : 's'} · '),
                        TextSpan(
                            text: '${Fmt.durationMin(summary.bookedMin)} booked · '),
                        TextSpan(
                          text: '${Fmt.durationMin(summary.availableMin)} available',
                          style: TextStyle(color: colors.success),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
          ),
          if (!isToday) ...[
            const SizedBox(width: 8),
            OutlinedButton(
              onPressed: onToday,
              style: OutlinedButton.styleFrom(
                foregroundColor: scheme.primary,
                side: BorderSide(color: scheme.primary.withValues(alpha: 0.4)),
                padding: const EdgeInsets.symmetric(horizontal: 12),
                minimumSize: const Size(0, 34),
                visualDensity: VisualDensity.compact,
              ),
              child: const Text('Today'),
            ),
          ],
        ],
      ),
    );
  }
}

// ── Session row ──────────────────────────────────────────────────────────────

({Color color, String label}) _statusStyle(SessionStatus s, AppColors c) =>
    switch (s) {
      SessionStatus.scheduled => (color: c.info, label: 'PT Session'),
      SessionStatus.inProgress => (color: c.success, label: 'In Progress'),
      SessionStatus.completed =>
        (color: const Color(0xFF10B981), label: 'Completed'),
      SessionStatus.noShow =>
        (color: const Color(0xFFF59E0B), label: 'No Show'),
      SessionStatus.cancelled => (color: c.error, label: 'Cancelled'),
      SessionStatus.unknown => (color: c.info, label: 'Session'),
    };

class _SessionRow extends StatelessWidget {
  const _SessionRow({required this.session, required this.onTap});
  final TrainerDaySession session;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final colors = AppColors.of(context);
    final st = _statusStyle(session.status, colors);
    final booked = colors.info;
    final endTime = Fmt.addMinutes(session.startTime, session.durationMin);

    return Material(
      color: booked.withValues(alpha: 0.04),
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          clipBehavior: Clip.antiAlias,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: booked.withValues(alpha: 0.3)),
          ),
          child: IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Time range block
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  decoration: BoxDecoration(
                    border: Border(
                      right: BorderSide(
                          color: booked.withValues(alpha: 0.2)),
                    ),
                  ),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(Fmt.time(session.startTime),
                          style: TextStyle(
                              color: booked, fontWeight: FontWeight.w700)),
                      Text(Fmt.time(endTime),
                          style: TextStyle(
                              color: booked, fontWeight: FontWeight.w700)),
                    ],
                  ),
                ),
                // Body
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 12, vertical: 10),
                    child: Row(
                      children: [
                        Container(
                          width: 34,
                          height: 34,
                          alignment: Alignment.center,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: booked.withValues(alpha: 0.15),
                          ),
                          child: Icon(Icons.person, size: 18, color: booked),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(session.clientName,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                      fontWeight: FontWeight.w700)),
                              const SizedBox(height: 3),
                              Container(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 8, vertical: 2),
                                decoration: BoxDecoration(
                                  color: st.color.withValues(alpha: 0.12),
                                  borderRadius: BorderRadius.circular(6),
                                ),
                                child: Text(st.label,
                                    style: TextStyle(
                                        color: st.color,
                                        fontSize: 11,
                                        fontWeight: FontWeight.w600)),
                              ),
                              const SizedBox(height: 4),
                              Text('${Fmt.durationMin(session.durationMin)} session',
                                  style: Theme.of(context)
                                      .textTheme
                                      .bodySmall
                                      ?.copyWith(
                                          color: scheme.onSurfaceVariant)),
                            ],
                          ),
                        ),
                        Icon(Icons.chevron_right,
                            color: scheme.onSurfaceVariant),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ── Available slots ──────────────────────────────────────────────────────────

class _SlotList extends StatelessWidget {
  const _SlotList(
      {required this.view, required this.selected, required this.onBook});
  final TrainerDayView view;
  final DateTime selected;
  final void Function(TrainerAvailableSlot) onBook;

  @override
  Widget build(BuildContext context) {
    if (!view.workingDay) {
      return const _EmptyRow("You're not scheduled to work this day");
    }
    if (view.availableSlots.isEmpty) {
      return const _EmptyRow('No available slots — fully booked');
    }
    final now = DateTime.now();
    final isToday = selected.year == now.year &&
        selected.month == now.month &&
        selected.day == now.day;
    final nowHHMM =
        '${now.hour.toString().padLeft(2, '0')}:${now.minute.toString().padLeft(2, '0')}';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final slot in view.availableSlots)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: _SlotRow(
              slot: slot,
              isPast: isToday && slot.startTime.compareTo(nowHHMM) <= 0,
              onBook: () => onBook(slot),
            ),
          ),
      ],
    );
  }
}

class _SlotRow extends StatelessWidget {
  const _SlotRow(
      {required this.slot, required this.isPast, required this.onBook});
  final TrainerAvailableSlot slot;
  final bool isPast;
  final VoidCallback onBook;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final available = AppColors.of(context).success;
    final accent = isPast ? scheme.onSurfaceVariant : available;
    return Opacity(
      opacity: isPast ? 0.5 : 1,
      child: Container(
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(
          color: isPast ? null : available.withValues(alpha: 0.04),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: isPast
                ? scheme.outlineVariant.withValues(alpha: 0.12)
                : available.withValues(alpha: 0.3),
          ),
        ),
        child: IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                decoration: BoxDecoration(
                  border: Border(
                    right: BorderSide(color: accent.withValues(alpha: 0.2)),
                  ),
                ),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(Fmt.time(slot.startTime),
                        style: TextStyle(
                            color: accent, fontWeight: FontWeight.w700)),
                    Text(Fmt.time(slot.endTime),
                        style: TextStyle(
                            color: accent, fontWeight: FontWeight.w700)),
                  ],
                ),
              ),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 12, vertical: 10),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Container(
                                  width: 6,
                                  height: 6,
                                  decoration: BoxDecoration(
                                      shape: BoxShape.circle, color: accent),
                                ),
                                const SizedBox(width: 6),
                                const Text('Available',
                                    style: TextStyle(
                                        fontWeight: FontWeight.w700)),
                              ],
                            ),
                            const SizedBox(height: 4),
                            Text('${Fmt.durationMin(slot.durationMin)} slot',
                                style: Theme.of(context)
                                    .textTheme
                                    .bodySmall
                                    ?.copyWith(
                                        color: scheme.onSurfaceVariant)),
                          ],
                        ),
                      ),
                      _SlotAddButton(
                          enabled: !isPast, accent: accent, onTap: onBook),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SlotAddButton extends StatelessWidget {
  const _SlotAddButton(
      {required this.enabled, required this.accent, required this.onTap});
  final bool enabled;
  final Color accent;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      shape: CircleBorder(
          side: BorderSide(color: accent.withValues(alpha: enabled ? 0.4 : 0.3))),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: enabled ? onTap : null,
        child: SizedBox(
          width: 36,
          height: 36,
          child: Icon(Icons.add, size: 18, color: accent),
        ),
      ),
    );
  }
}

// ── Legend ───────────────────────────────────────────────────────────────────

class _Legend extends StatelessWidget {
  const _Legend();

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final colors = AppColors.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 14),
      decoration: BoxDecoration(
        color: scheme.surfaceContainer,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: scheme.outlineVariant.withValues(alpha: 0.08)),
      ),
      child: Wrap(
        alignment: WrapAlignment.center,
        spacing: 20,
        runSpacing: 8,
        children: [
          _LegendDot(color: colors.info, label: 'Booked'),
          _LegendDot(color: colors.success, label: 'Available'),
          _LegendDot(
              color: scheme.onSurfaceVariant.withValues(alpha: 0.5),
              label: 'Unavailable'),
        ],
      ),
    );
  }
}

class _LegendDot extends StatelessWidget {
  const _LegendDot({required this.color, required this.label});
  final Color color;
  final String label;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 8,
          height: 8,
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

// ── Small shared bits ────────────────────────────────────────────────────────

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.title, {this.subtitle});
  final String title;
  final String? subtitle;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title,
            style: Theme.of(context)
                .textTheme
                .titleSmall
                ?.copyWith(fontWeight: FontWeight.w700)),
        if (subtitle != null)
          Text(subtitle!,
              style: Theme.of(context)
                  .textTheme
                  .bodySmall
                  ?.copyWith(color: scheme.onSurfaceVariant)),
      ],
    );
  }
}

class _EmptyRow extends StatelessWidget {
  const _EmptyRow(this.message);
  final String message;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 22, horizontal: 16),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest.withValues(alpha: 0.2),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: scheme.outlineVariant.withValues(alpha: 0.08)),
      ),
      child: Text(message,
          textAlign: TextAlign.center,
          style: TextStyle(color: scheme.onSurfaceVariant)),
    );
  }
}

class _AgendaSkeleton extends StatelessWidget {
  const _AgendaSkeleton();

  @override
  Widget build(BuildContext context) {
    return const Shimmer(
      child: Column(
        children: [
          Bone(width: double.infinity, height: 72, radius: 16),
          SizedBox(height: 10),
          Bone(width: double.infinity, height: 64, radius: 16),
          SizedBox(height: 10),
          Bone(width: double.infinity, height: 64, radius: 16),
        ],
      ),
    );
  }
}
