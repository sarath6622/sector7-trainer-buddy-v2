import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../data/progress_models.dart';

/// A single-series line chart for a body metric over time. X is the point
/// index (evenly spaced); date labels are derived from the points. Kept
/// presentation-only — the server owns the values.
class MetricLineChart extends StatelessWidget {
  const MetricLineChart({
    super.key,
    required this.points,
    required this.unit,
    this.color,
  });

  final List<ChartPoint> points;
  final String unit;

  /// Line/area accent. Defaults to the brand primary when null.
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final c = color ?? scheme.primary;
    final spots = [
      for (var i = 0; i < points.length; i++)
        FlSpot(i.toDouble(), points[i].value),
    ];

    final values = points.map((p) => p.value).toList();
    final minV = values.reduce((a, b) => a < b ? a : b);
    final maxV = values.reduce((a, b) => a > b ? a : b);
    // Pad the Y range a touch so the line isn't glued to the edges.
    final pad = ((maxV - minV).abs() * 0.15).clamp(1.0, double.infinity);
    final minY = minV - pad;
    final maxY = maxV + pad;

    final df = DateFormat('d MMM');
    // Show at most ~4 date labels to avoid crowding.
    final step = (points.length / 4).ceil().clamp(1, points.length);

    return LineChart(
      LineChartData(
        minY: minY,
        maxY: maxY,
        minX: 0,
        maxX: (points.length - 1).toDouble(),
        gridData: FlGridData(
          show: true,
          drawVerticalLine: false,
          horizontalInterval: ((maxY - minY) / 4).clamp(0.1, double.infinity),
          getDrawingHorizontalLine: (_) =>
              FlLine(color: scheme.outlineVariant.withValues(alpha: 0.25), strokeWidth: 1),
        ),
        borderData: FlBorderData(show: false),
        titlesData: FlTitlesData(
          topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
          rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
          leftTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              reservedSize: 40,
              getTitlesWidget: (value, meta) {
                if (value == meta.min || value == meta.max) {
                  return const SizedBox.shrink();
                }
                return Text(
                  value.toStringAsFixed(0),
                  style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 10),
                );
              },
            ),
          ),
          bottomTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              reservedSize: 22,
              interval: 1,
              getTitlesWidget: (value, meta) {
                final i = value.round();
                if (i < 0 || i >= points.length) return const SizedBox.shrink();
                if (i % step != 0 && i != points.length - 1) {
                  return const SizedBox.shrink();
                }
                return Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Text(
                    df.format(points[i].date),
                    style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 10),
                  ),
                );
              },
            ),
          ),
        ),
        lineTouchData: LineTouchData(
          touchTooltipData: LineTouchTooltipData(
            getTooltipColor: (_) => scheme.inverseSurface,
            getTooltipItems: (spots) => spots.map((s) {
              final p = points[s.x.round().clamp(0, points.length - 1)];
              return LineTooltipItem(
                '${p.value % 1 == 0 ? p.value.toInt() : p.value}$unit\n',
                TextStyle(
                  color: scheme.onInverseSurface,
                  fontWeight: FontWeight.w700,
                ),
                children: [
                  TextSpan(
                    text: DateFormat('d MMM yyyy').format(p.date),
                    style: TextStyle(
                      color: scheme.onInverseSurface.withValues(alpha: 0.8),
                      fontWeight: FontWeight.normal,
                      fontSize: 11,
                    ),
                  ),
                ],
              );
            }).toList(),
          ),
        ),
        lineBarsData: [
          LineChartBarData(
            spots: spots,
            isCurved: true,
            preventCurveOverShooting: true,
            color: c,
            barWidth: 3,
            dotData: FlDotData(
              show: points.length <= 12,
              getDotPainter: (spot, _, _, _) => FlDotCirclePainter(
                radius: 3,
                color: c,
                strokeWidth: 0,
              ),
            ),
            belowBarData: BarAreaData(
              show: true,
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [
                  c.withValues(alpha: 0.25),
                  c.withValues(alpha: 0.0),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
