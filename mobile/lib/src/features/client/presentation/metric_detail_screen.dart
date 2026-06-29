import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/feedback/haptics.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/util/formatters.dart';
import '../data/client_repository.dart';
import '../data/progress_models.dart';
import '../domain/progress_metrics.dart';
import '../domain/progress_series.dart';
import 'widgets/client_widgets.dart';
import 'widgets/log_measurement_sheet.dart';
import 'widgets/metric_line_chart.dart';
import 'widgets/segmented_bar.dart';

/// Per-metric drill-down: full chart, range selector, summary stats and the
/// metric's logged history. Reached from a Body-Metrics grid card.
class MetricDetailScreen extends ConsumerStatefulWidget {
  const MetricDetailScreen({super.key, required this.metricKey});
  final String metricKey;

  @override
  ConsumerState<MetricDetailScreen> createState() => _MetricDetailScreenState();
}

class _MetricDetailScreenState extends ConsumerState<MetricDetailScreen> {
  ProgressRange _range = ProgressRange.d90;

  @override
  Widget build(BuildContext context) {
    final metric = metricByKey(widget.metricKey);
    final entriesAsync = ref.watch(progressEntriesProvider);

    return Scaffold(
      appBar: AppBar(title: Text(metric?.label ?? 'Metric')),
      body: metric == null
          ? const Center(child: Text('Unknown metric'))
          : entriesAsync.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => ErrorRetry(
                message: e.toString(),
                onRetry: () => ref.invalidate(progressEntriesProvider),
              ),
              data: (entries) => _Body(
                metric: metric,
                entries: entries,
                range: _range,
                onRange: (r) {
                  Haptics.select();
                  setState(() => _range = r);
                },
                onLog: () => _log(context, metric, entries),
              ),
            ),
    );
  }

  Future<void> _log(
    BuildContext context,
    MetricDef metric,
    List<ProgressEntry> entries,
  ) async {
    final saved =
        await showLogMeasurementSheet(context, entries: entries, focus: metric);
    if (saved) ref.invalidate(progressEntriesProvider);
  }
}

class _Body extends StatelessWidget {
  const _Body({
    required this.metric,
    required this.entries,
    required this.range,
    required this.onRange,
    required this.onLog,
  });

  final MetricDef metric;
  final List<ProgressEntry> entries;
  final ProgressRange range;
  final ValueChanged<ProgressRange> onRange;
  final VoidCallback onLog;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final all = seriesFor(entries, metric.read);
    final ranged = inRange(all, range);
    final stats = statsFor(ranged);

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
      children: [
        // Headline.
        Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Hero(
              tag: 'metric-${metric.key}',
              child: Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                    color: metric.color.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(14)),
                child: Icon(metric.icon, color: metric.color),
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(metric.label.toUpperCase(),
                      style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 0.6,
                          color: scheme.onSurfaceVariant)),
                  Text.rich(TextSpan(
                    text: stats.latest != null ? _trim(stats.latest!) : '—',
                    style: const TextStyle(
                        fontSize: 30, fontWeight: FontWeight.w800, height: 1.1),
                    children: stats.latest != null
                        ? [
                            TextSpan(
                                text: ' ${metric.unit}',
                                style: TextStyle(
                                    fontSize: 14,
                                    fontWeight: FontWeight.w500,
                                    color: scheme.onSurfaceVariant)),
                          ]
                        : null,
                  )),
                ],
              ),
            ),
            _DeltaPill(
                diff: stats.change,
                unit: metric.unit,
                lowerIsBetter: metric.lowerIsBetter),
          ],
        ),
        const SizedBox(height: 16),

        // Range selector.
        SegmentedBar(
          labels: [for (final r in ProgressRange.values) r.label],
          index: range.index,
          onChanged: (i) => onRange(ProgressRange.values[i]),
        ),
        const SizedBox(height: 16),

        // Chart.
        Container(
          padding: const EdgeInsets.fromLTRB(12, 16, 16, 12),
          decoration: BoxDecoration(
            color: scheme.surfaceContainerLow,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: scheme.outlineVariant),
          ),
          child: SizedBox(
            height: 200,
            child: ranged.length < 2
                ? Center(
                    child: Text(
                      'Need at least two ${metric.label.toLowerCase()} entries '
                      'in this range to chart a trend.',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                          fontSize: 12, color: scheme.onSurfaceVariant),
                    ),
                  )
                : MetricLineChart(
                    points: ranged, unit: metric.unit, color: metric.color),
          ),
        ),
        const SizedBox(height: 16),

        // Stat grid.
        if (!stats.isEmpty) ...[
          Row(children: [
            _Stat(label: 'Current', value: _fmt(stats.latest, metric.unit)),
            _Stat(
                label: 'Change',
                value: stats.change == null
                    ? '—'
                    : '${stats.change! > 0 ? '+' : ''}'
                        '${_trim(stats.change!)}${metric.unit}'),
            _Stat(label: 'Average', value: _fmt(stats.avg, metric.unit)),
          ]),
          const SizedBox(height: 10),
          Row(children: [
            _Stat(label: 'Lowest', value: _fmt(stats.min, metric.unit)),
            _Stat(label: 'Highest', value: _fmt(stats.max, metric.unit)),
            _Stat(label: 'Entries', value: '${stats.count}'),
          ]),
          const SizedBox(height: 20),
        ],

        // History (newest first).
        Text('HISTORY',
            style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.8,
                color: scheme.onSurfaceVariant)),
        const SizedBox(height: 8),
        if (all.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 24),
            child: Center(
              child: Text('No ${metric.label.toLowerCase()} logged yet.',
                  style: TextStyle(
                      fontSize: 13, color: scheme.onSurfaceVariant)),
            ),
          )
        else
          for (var i = all.length - 1; i >= 0; i--)
            _HistoryRow(
              point: all[i],
              prev: i > 0 ? all[i - 1] : null,
              unit: metric.unit,
              lowerIsBetter: metric.lowerIsBetter,
            ),

        if (metric.loggable) ...[
          const SizedBox(height: 20),
          OutlinedButton.icon(
            onPressed: onLog,
            icon: const Icon(Icons.add, size: 18),
            label: Text('Log ${metric.label}'),
          ),
        ],
      ],
    );
  }

  String _fmt(double? v, String unit) => v == null ? '—' : '${_trim(v)}$unit';
}

class _Stat extends StatelessWidget {
  const _Stat({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Expanded(
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 3),
        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 10),
        decoration: BoxDecoration(
          color: scheme.surfaceContainerLow,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: scheme.outlineVariant),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label,
                style: TextStyle(
                    fontSize: 10, color: scheme.onSurfaceVariant)),
            const SizedBox(height: 3),
            Text(value,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style:
                    const TextStyle(fontSize: 14, fontWeight: FontWeight.w800)),
          ],
        ),
      ),
    );
  }
}

class _HistoryRow extends StatelessWidget {
  const _HistoryRow({
    required this.point,
    required this.prev,
    required this.unit,
    required this.lowerIsBetter,
  });

  final ChartPoint point;
  final ChartPoint? prev;
  final String unit;
  final bool lowerIsBetter;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final diff = prev == null ? null : point.value - prev!.value;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Expanded(
            child: Text(Fmt.dayMonthYear(point.date),
                style: TextStyle(
                    fontSize: 13, color: scheme.onSurfaceVariant)),
          ),
          Text('${_trim(point.value)}$unit',
              style:
                  const TextStyle(fontSize: 14, fontWeight: FontWeight.w700)),
          const SizedBox(width: 10),
          SizedBox(
            width: 64,
            child: Align(
              alignment: Alignment.centerRight,
              child: _DeltaPill(
                  diff: diff, unit: unit, lowerIsBetter: lowerIsBetter),
            ),
          ),
        ],
      ),
    );
  }
}

class _DeltaPill extends StatelessWidget {
  const _DeltaPill({
    required this.diff,
    required this.unit,
    required this.lowerIsBetter,
  });
  final double? diff;
  final String unit;
  final bool lowerIsBetter;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final colors = AppColors.of(context);
    if (diff == null || diff!.abs() < 0.01) {
      return Text('—',
          style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant));
    }
    final positive = lowerIsBetter ? diff! < 0 : diff! > 0;
    final color = positive ? colors.success : colors.error;
    return Row(mainAxisSize: MainAxisSize.min, children: [
      Icon(diff! < 0 ? Icons.arrow_downward : Icons.arrow_upward,
          size: 12, color: color),
      Flexible(
        child: Text('${diff! > 0 ? '+' : ''}${_trim(diff!)}$unit',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
                fontSize: 12, fontWeight: FontWeight.w700, color: color)),
      ),
    ]);
  }
}

String _trim(double v) =>
    v == v.roundToDouble() ? v.toInt().toString() : v.toStringAsFixed(1);
