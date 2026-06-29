import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/feedback/haptics.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/glass_dock_nav_bar.dart';
import '../../../core/widgets/skeleton.dart';
import '../data/client_repository.dart';
import '../data/progress_models.dart';
import '../domain/progress_metrics.dart';
import '../domain/progress_series.dart';
import 'widgets/client_widgets.dart';
import 'widgets/featured_metric_chart.dart';
import 'widgets/log_measurement_sheet.dart';
import 'widgets/segmented_bar.dart';

/// Client progress — a single Body-Metrics dashboard: a metric selector, a
/// featured trend chart, a page-wide time range, insight stats, an all-metric
/// grid and achievements. Every series/stat is derived client-side from the
/// `/client/progress` entries feed (no per-metric chart calls, no goal/BMI —
/// those need data we don't have).
class ProgressScreen extends ConsumerStatefulWidget {
  const ProgressScreen({super.key});

  @override
  ConsumerState<ProgressScreen> createState() => _ProgressScreenState();
}

class _ProgressScreenState extends ConsumerState<ProgressScreen> {
  String _selectedKey = 'weight';
  ProgressRange _range = ProgressRange.d90;

  @override
  Widget build(BuildContext context) {
    final entriesAsync = ref.watch(progressEntriesProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Progress'),
        actions: [
          TextButton.icon(
            onPressed: () => _openLog(entriesAsync.valueOrNull ?? const []),
            icon: const Icon(Icons.add, size: 18),
            label: const Text('Log'),
          ),
          const SizedBox(width: 4),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          Haptics.tap();
          ref.invalidate(progressEntriesProvider);
          await ref.read(progressEntriesProvider.future);
        },
        child: entriesAsync.when(
          loading: () => const _Loading(),
          error: (e, _) => ListView(children: [
            const SizedBox(height: 80),
            ErrorRetry(
              message: e.toString(),
              onRetry: () => ref.invalidate(progressEntriesProvider),
            ),
          ]),
          data: (entries) => _Body(
            entries: entries,
            selectedKey: _selectedKey,
            range: _range,
            onSelect: (k) {
              Haptics.select();
              setState(() => _selectedKey = k);
            },
            onRange: (r) {
              Haptics.select();
              setState(() => _range = r);
            },
            onLog: () => _openLog(entries),
          ),
        ),
      ),
    );
  }

  Future<void> _openLog(List<ProgressEntry> entries) async {
    final saved = await showLogMeasurementSheet(context, entries: entries);
    if (saved) ref.invalidate(progressEntriesProvider);
  }
}

class _Body extends StatelessWidget {
  const _Body({
    required this.entries,
    required this.selectedKey,
    required this.range,
    required this.onSelect,
    required this.onRange,
    required this.onLog,
  });

  final List<ProgressEntry> entries;
  final String selectedKey;
  final ProgressRange range;
  final ValueChanged<String> onSelect;
  final ValueChanged<ProgressRange> onRange;
  final VoidCallback onLog;

  MetricDef get _selected =>
      metricByKey(selectedKey) ?? kProgressMetrics.first;

  @override
  Widget build(BuildContext context) {
    if (entries.isEmpty) {
      return ListView(
        padding: EdgeInsets.fromLTRB(16, 24, 16, glassDockScrollInset(context)),
        children: [
          _DashedEmpty(
            icon: Icons.trending_up,
            title: 'No measurements yet',
            subtitle: 'Tap Log to record your first weigh-in',
            onTap: onLog,
          ),
        ],
      );
    }

    final m = _selected;
    return ListView(
      padding: EdgeInsets.fromLTRB(16, 12, 16, glassDockScrollInset(context)),
      children: [
        // Metric selector chips.
        _MetricChips(
            entries: entries, selectedKey: m.key, onSelect: onSelect),
        const SizedBox(height: 14),

        // Featured trend card.
        _FeaturedCard(
            entries: entries, metric: m, range: range, onRange: onRange),
        const SizedBox(height: 14),

        // Page-wide range.
        SegmentedBar(
          labels: [for (final r in ProgressRange.values) r.label],
          index: range.index,
          onChanged: (i) => onRange(ProgressRange.values[i]),
        ),
        const SizedBox(height: 22),

        // Insights.
        _SectionHeader(
            title: 'Insights',
            onViewAll: () => context.push('/client/progress/${m.key}')),
        const SizedBox(height: 10),
        _Insights(entries: entries, metric: m, range: range),
        const SizedBox(height: 22),

        // Body metrics grid.
        const _SectionHeader(title: 'Body Metrics'),
        const SizedBox(height: 10),
        _MetricGrid(entries: entries, range: range),
        const SizedBox(height: 22),

        // Achievements.
        const _SectionHeader(title: 'Achievements'),
        const SizedBox(height: 10),
        _Achievements(entries: entries, metric: m),
      ],
    );
  }
}

// ── Metric selector chips ─────────────────────────────────────────────────────
class _MetricChips extends StatelessWidget {
  const _MetricChips({
    required this.entries,
    required this.selectedKey,
    required this.onSelect,
  });

  final List<ProgressEntry> entries;
  final String selectedKey;
  final ValueChanged<String> onSelect;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return SizedBox(
      height: 38,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: kProgressMetrics.length,
        separatorBuilder: (_, _) => const SizedBox(width: 8),
        itemBuilder: (_, i) {
          final m = kProgressMetrics[i];
          final selected = m.key == selectedKey;
          return GestureDetector(
            onTap: () => onSelect(m.key),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 150),
              padding: const EdgeInsets.symmetric(horizontal: 14),
              decoration: BoxDecoration(
                color: selected ? scheme.primary : scheme.surfaceContainer,
                borderRadius: BorderRadius.circular(20),
                border: selected
                    ? null
                    : Border.all(color: scheme.outlineVariant),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(m.icon,
                      size: 15,
                      color: selected ? scheme.onPrimary : scheme.onSurfaceVariant),
                  const SizedBox(width: 6),
                  Text(m.label,
                      style: TextStyle(
                          fontSize: 13,
                          fontWeight:
                              selected ? FontWeight.w700 : FontWeight.w500,
                          color:
                              selected ? scheme.onPrimary : scheme.onSurface)),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

// ── Featured card ─────────────────────────────────────────────────────────────
class _FeaturedCard extends StatelessWidget {
  const _FeaturedCard({
    required this.entries,
    required this.metric,
    required this.range,
    required this.onRange,
  });

  final List<ProgressEntry> entries;
  final MetricDef metric;
  final ProgressRange range;
  final ValueChanged<ProgressRange> onRange;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final all = seriesFor(entries, metric.read);
    final ranged = inRange(all, range);
    final spark = ranged.length >= 2 ? ranged : all;
    final current = statsFor(all).latest;
    final change = statsFor(ranged).change;
    final streak = longestDayStreak(entries);

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerLow,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: scheme.outlineVariant),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Current ${metric.label}',
                        style: TextStyle(
                            fontSize: 13, color: scheme.onSurfaceVariant)),
                    const SizedBox(height: 2),
                    Text.rich(TextSpan(
                      text: current != null ? _trim(current) : '—',
                      style: const TextStyle(
                          fontSize: 34, fontWeight: FontWeight.w800, height: 1.05),
                      children: current != null
                          ? [
                              TextSpan(
                                  text: ' ${metric.unit}',
                                  style: TextStyle(
                                      fontSize: 15,
                                      fontWeight: FontWeight.w500,
                                      color: scheme.onSurfaceVariant)),
                            ]
                          : null,
                    )),
                    const SizedBox(height: 6),
                    if (change != null)
                      Row(children: [
                        _DeltaPill(
                            diff: change,
                            unit: metric.unit,
                            lowerIsBetter: metric.lowerIsBetter),
                        const SizedBox(width: 8),
                        Flexible(
                          child: Text(
                            range == ProgressRange.all
                                ? 'since start'
                                : 'vs ${_rangeWords(range).toLowerCase()} ago',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                                fontSize: 12, color: scheme.onSurfaceVariant),
                          ),
                        ),
                      ]),
                  ],
                ),
              ),
              _RangeDropdown(value: range, onChanged: onRange),
            ],
          ),
          const SizedBox(height: 12),
          SizedBox(
            height: 180,
            child: spark.length < 2
                ? Center(
                    child: Text(
                      'Log at least two ${metric.label.toLowerCase()} entries '
                      'to see a trend.',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                          fontSize: 12, color: scheme.onSurfaceVariant),
                    ),
                  )
                : FeaturedMetricChart(
                    points: spark, unit: metric.unit, color: metric.color),
          ),
          if (streak >= 2) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: scheme.surfaceContainerHigh,
                borderRadius: BorderRadius.circular(14),
              ),
              child: Row(children: [
                Container(
                  width: 34,
                  height: 34,
                  decoration: BoxDecoration(
                      color: scheme.primary.withValues(alpha: 0.14),
                      shape: BoxShape.circle),
                  child: Icon(Icons.star_rounded, size: 18, color: scheme.primary),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Your best streak',
                          style: TextStyle(
                              fontSize: 13, fontWeight: FontWeight.w700)),
                      Text('You logged $streak days in a row. Keep it up!',
                          style: TextStyle(
                              fontSize: 12, color: scheme.onSurfaceVariant)),
                    ],
                  ),
                ),
              ]),
            ),
          ],
        ],
      ),
    );
  }
}

class _RangeDropdown extends StatelessWidget {
  const _RangeDropdown({required this.value, required this.onChanged});
  final ProgressRange value;
  final ValueChanged<ProgressRange> onChanged;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return PopupMenuButton<ProgressRange>(
      initialValue: value,
      onSelected: onChanged,
      position: PopupMenuPosition.under,
      itemBuilder: (_) => [
        for (final r in ProgressRange.values)
          PopupMenuItem(value: r, child: Text(_rangeWords(r))),
      ],
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: scheme.surfaceContainerHigh,
          borderRadius: BorderRadius.circular(10),
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Text(_rangeWords(value),
              style:
                  const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
          const SizedBox(width: 2),
          Icon(Icons.keyboard_arrow_down,
              size: 16, color: scheme.onSurfaceVariant),
        ]),
      ),
    );
  }
}

// ── Insights ──────────────────────────────────────────────────────────────────
class _Insights extends StatelessWidget {
  const _Insights({
    required this.entries,
    required this.metric,
    required this.range,
  });

  final List<ProgressEntry> entries;
  final MetricDef metric;
  final ProgressRange range;

  @override
  Widget build(BuildContext context) {
    final s = statsFor(inRange(seriesFor(entries, metric.read), range));
    final u = metric.unit;
    final df = DateFormat('d MMM');
    final period = range == ProgressRange.all ? 'all time' : range.label;
    final cards = <Widget>[
      _InsightCard(
          icon: Icons.north_east,
          label: 'Highest',
          value: s.max == null ? '—' : '${_trim(s.max!)}$u',
          sub: s.maxDate == null ? '' : df.format(s.maxDate!)),
      _InsightCard(
          icon: Icons.south_east,
          label: 'Lowest',
          value: s.min == null ? '—' : '${_trim(s.min!)}$u',
          sub: s.minDate == null ? '' : df.format(s.minDate!)),
      _InsightCard(
          icon: Icons.show_chart,
          label: 'Average',
          value: s.avg == null ? '—' : '${_trim(s.avg!)}$u',
          sub: period),
      _InsightCard(
          icon: Icons.swap_vert,
          label: 'Change',
          value: s.change == null
              ? '—'
              : '${s.change! > 0 ? '+' : ''}${_trim(s.change!)}$u',
          sub: 'vs $period'),
      _InsightCard(
          icon: Icons.calendar_today,
          label: 'Entries',
          value: '${s.count}',
          sub: 'this period'),
    ];
    return SizedBox(
      height: 96,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: cards.length,
        separatorBuilder: (_, _) => const SizedBox(width: 10),
        itemBuilder: (_, i) => cards[i],
      ),
    );
  }
}

class _InsightCard extends StatelessWidget {
  const _InsightCard({
    required this.icon,
    required this.label,
    required this.value,
    required this.sub,
  });
  final IconData icon;
  final String label;
  final String value;
  final String sub;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      width: 116,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerLow,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: scheme.outlineVariant),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 16, color: scheme.onSurfaceVariant),
          const Spacer(),
          Text(label,
              style: TextStyle(fontSize: 11, color: scheme.onSurfaceVariant)),
          Text(value,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
          if (sub.isNotEmpty)
            Text(sub,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 10, color: scheme.onSurfaceVariant)),
        ],
      ),
    );
  }
}

// ── Body-metric grid ──────────────────────────────────────────────────────────
class _MetricGrid extends StatelessWidget {
  const _MetricGrid({required this.entries, required this.range});
  final List<ProgressEntry> entries;
  final ProgressRange range;

  @override
  Widget build(BuildContext context) {
    final rows = <Widget>[];
    for (var i = 0; i < kProgressMetrics.length; i += 2) {
      final left = kProgressMetrics[i];
      final right =
          i + 1 < kProgressMetrics.length ? kProgressMetrics[i + 1] : null;
      rows.add(Padding(
        padding: EdgeInsets.only(top: i == 0 ? 0 : 10),
        child: Row(
          children: [
            Expanded(
                child: _MetricGridCard(
                    entries: entries, metric: left, range: range)),
            const SizedBox(width: 10),
            Expanded(
              child: right == null
                  ? const SizedBox()
                  : _MetricGridCard(
                      entries: entries, metric: right, range: range),
            ),
          ],
        ),
      ));
    }
    return Column(children: rows);
  }
}

class _MetricGridCard extends StatelessWidget {
  const _MetricGridCard({
    required this.entries,
    required this.metric,
    required this.range,
  });

  final List<ProgressEntry> entries;
  final MetricDef metric;
  final ProgressRange range;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final all = seriesFor(entries, metric.read);
    final current = statsFor(all).latest;
    final change = statsFor(inRange(all, range)).change;
    final hasData = current != null;

    return InkWell(
      onTap: () {
        Haptics.tap();
        context.push('/client/progress/${metric.key}');
      },
      borderRadius: BorderRadius.circular(16),
      child: Container(
        height: 116,
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: scheme.surfaceContainerLow,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: scheme.outlineVariant),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              Container(
                width: 28,
                height: 28,
                decoration: BoxDecoration(
                    color: metric.color.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(9)),
                child: Icon(metric.icon, size: 14, color: metric.color),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(metric.label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                        fontSize: 12, color: scheme.onSurfaceVariant)),
              ),
            ]),
            const Spacer(),
            Text.rich(TextSpan(
              text: hasData ? _trim(current) : '—',
              style:
                  const TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
              children: hasData
                  ? [
                      TextSpan(
                          text: ' ${metric.unit}',
                          style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w400,
                              color: scheme.onSurfaceVariant)),
                    ]
                  : null,
            )),
            const SizedBox(height: 4),
            if (change != null)
              Row(children: [
                _DeltaPill(
                    diff: change,
                    unit: metric.unit,
                    lowerIsBetter: metric.lowerIsBetter,
                    compact: true),
                const SizedBox(width: 6),
                Flexible(
                  child: Text(
                    range == ProgressRange.all
                        ? 'all time'
                        : 'vs ${range.label}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style:
                        TextStyle(fontSize: 10, color: scheme.onSurfaceVariant),
                  ),
                ),
              ])
            else
              Text(hasData ? 'Tap to view' : 'Tap to log',
                  style: TextStyle(
                      fontSize: 10,
                      color: scheme.onSurfaceVariant.withValues(alpha: 0.7))),
          ],
        ),
      ),
    );
  }
}

// ── Achievements ──────────────────────────────────────────────────────────────
class _Achievements extends StatelessWidget {
  const _Achievements({required this.entries, required this.metric});
  final List<ProgressEntry> entries;
  final MetricDef metric;

  @override
  Widget build(BuildContext context) {
    final streak = longestDayStreak(entries);
    final s = statsFor(seriesFor(entries, metric.read));
    final best = metric.lowerIsBetter ? s.min : s.max;
    return Row(
      children: [
        Expanded(
          child: _AchievementCard(
            icon: Icons.local_fire_department,
            color: const Color(0xFFF97316),
            value: '$streak day${streak == 1 ? '' : 's'}',
            title: 'Longest streak',
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: _AchievementCard(
            icon: Icons.emoji_events,
            color: const Color(0xFFF59E0B),
            value: '${entries.length} log${entries.length == 1 ? '' : 's'}',
            title: 'Total entries',
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: _AchievementCard(
            icon: Icons.star,
            color: const Color(0xFFEAB308),
            value: best == null ? '—' : '${_trim(best)}${metric.unit}',
            title: 'Best ${metric.label.toLowerCase()}',
          ),
        ),
      ],
    );
  }
}

class _AchievementCard extends StatelessWidget {
  const _AchievementCard({
    required this.icon,
    required this.color,
    required this.value,
    required this.title,
  });
  final IconData icon;
  final Color color;
  final String value;
  final String title;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      height: 104,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerLow,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: scheme.outlineVariant),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Icon(icon, size: 20, color: color),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(value,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style:
                      const TextStyle(fontSize: 15, fontWeight: FontWeight.w800)),
              Text(title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style:
                      TextStyle(fontSize: 10, color: scheme.onSurfaceVariant)),
            ],
          ),
        ],
      ),
    );
  }
}

// ── Delta pill ────────────────────────────────────────────────────────────────
class _DeltaPill extends StatelessWidget {
  const _DeltaPill({
    required this.diff,
    required this.unit,
    required this.lowerIsBetter,
    this.compact = false,
  });

  final double diff;
  final String unit;
  final bool lowerIsBetter;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final colors = AppColors.of(context);
    final flat = diff.abs() < 0.01;
    final good = lowerIsBetter ? diff < 0 : diff > 0;
    // Improvements read green; regressions use the warm warning tone (matches
    // the reference mock — not an alarming red).
    final fg = flat
        ? scheme.onSurfaceVariant
        : (good ? colors.success : colors.warning);
    final bg = flat
        ? scheme.surfaceContainerHigh
        : (good ? colors.successBg : colors.warningBg);
    return Container(
      padding: EdgeInsets.symmetric(
          horizontal: compact ? 6 : 8, vertical: compact ? 2 : 4),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        if (!flat)
          Icon(diff < 0 ? Icons.arrow_downward : Icons.arrow_upward,
              size: compact ? 11 : 13, color: fg),
        Text(
          flat ? 'No change' : '${diff > 0 ? '+' : ''}${_trim(diff)}$unit',
          style: TextStyle(
              fontSize: compact ? 10 : 12,
              fontWeight: FontWeight.w700,
              color: fg),
        ),
      ]),
    );
  }
}

// ── Section header ────────────────────────────────────────────────────────────
class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.title, this.onViewAll});
  final String title;
  final VoidCallback? onViewAll;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(title,
            style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
        if (onViewAll != null)
          GestureDetector(
            onTap: onViewAll,
            child: Text('View all',
                style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: scheme.primary)),
          ),
      ],
    );
  }
}

// ── Shared bits ───────────────────────────────────────────────────────────────
class _DashedEmpty extends StatelessWidget {
  const _DashedEmpty({
    required this.icon,
    required this.title,
    required this.subtitle,
    this.onTap,
  });
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(18),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 40, horizontal: 24),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: scheme.outlineVariant),
        ),
        child: Column(children: [
          Container(
            width: 56,
            height: 56,
            decoration: BoxDecoration(
                color: scheme.surfaceContainerHigh, shape: BoxShape.circle),
            child: Icon(icon, size: 24, color: scheme.onSurfaceVariant),
          ),
          const SizedBox(height: 12),
          Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
          const SizedBox(height: 4),
          Text(subtitle,
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 13, color: scheme.onSurfaceVariant)),
        ]),
      ),
    );
  }
}

class _Loading extends StatelessWidget {
  const _Loading();
  @override
  Widget build(BuildContext context) {
    return Shimmer(
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
        children: const [
          Bone(width: double.infinity, height: 38, radius: 19),
          SizedBox(height: 14),
          Bone(width: double.infinity, height: 300, radius: 18),
          SizedBox(height: 14),
          Bone(width: double.infinity, height: 44, radius: 12),
          SizedBox(height: 22),
          Bone(width: 120, height: 18, radius: 6),
          SizedBox(height: 12),
          Bone(width: double.infinity, height: 96, radius: 16),
        ],
      ),
    );
  }
}

String _rangeWords(ProgressRange r) => switch (r) {
      ProgressRange.d7 => '7 Days',
      ProgressRange.d30 => '30 Days',
      ProgressRange.d90 => '90 Days',
      ProgressRange.y1 => '1 Year',
      ProgressRange.all => 'All time',
    };

String _trim(double v) =>
    v == v.roundToDouble() ? v.toInt().toString() : v.toStringAsFixed(1);
