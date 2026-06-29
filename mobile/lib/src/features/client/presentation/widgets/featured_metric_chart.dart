import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../data/progress_models.dart';

/// The large hero chart on the Progress featured card: an area-filled line with
/// a right-hand value axis, sparse date labels, and the latest point pinned with
/// a value badge. Single series, presentation-only.
class FeaturedMetricChart extends StatelessWidget {
  const FeaturedMetricChart({
    super.key,
    required this.points,
    required this.unit,
    required this.color,
  });

  final List<ChartPoint> points;
  final String unit;
  final Color color;

  String _fmt(double v) =>
      v == v.roundToDouble() ? v.toInt().toString() : v.toStringAsFixed(1);

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final spots = [
      for (var i = 0; i < points.length; i++)
        FlSpot(i.toDouble(), points[i].value),
    ];

    final values = points.map((p) => p.value).toList();
    final minV = values.reduce((a, b) => a < b ? a : b);
    final maxV = values.reduce((a, b) => a > b ? a : b);
    final pad = ((maxV - minV).abs() * 0.18).clamp(1.0, double.infinity);
    final minY = minV - pad;
    final maxY = maxV + pad;

    final df = DateFormat('d MMM');
    final lastIdx = points.length - 1;
    final midIdx = lastIdx ~/ 2;

    return LineChart(
      LineChartData(
        minY: minY,
        maxY: maxY,
        minX: 0,
        maxX: lastIdx.toDouble(),
        gridData: FlGridData(
          show: true,
          drawVerticalLine: false,
          horizontalInterval: ((maxY - minY) / 4).clamp(0.1, double.infinity),
          getDrawingHorizontalLine: (_) => FlLine(
            color: scheme.outlineVariant.withValues(alpha: 0.22),
            strokeWidth: 1,
          ),
        ),
        borderData: FlBorderData(show: false),
        titlesData: FlTitlesData(
          topTitles:
              const AxisTitles(sideTitles: SideTitles(showTitles: false)),
          leftTitles:
              const AxisTitles(sideTitles: SideTitles(showTitles: false)),
          rightTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              reservedSize: 34,
              interval: ((maxY - minY) / 4).clamp(0.1, double.infinity),
              getTitlesWidget: (value, meta) {
                if (value <= meta.min || value >= meta.max) {
                  return const SizedBox.shrink();
                }
                return Padding(
                  padding: const EdgeInsets.only(left: 6),
                  child: Text(_fmt(value),
                      style: TextStyle(
                          color: scheme.onSurfaceVariant, fontSize: 10)),
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
                if (i != 0 && i != midIdx && i != lastIdx) {
                  return const SizedBox.shrink();
                }
                if (i < 0 || i >= points.length) return const SizedBox.shrink();
                return Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Text(df.format(points[i].date),
                      style: TextStyle(
                          color: scheme.onSurfaceVariant, fontSize: 10)),
                );
              },
            ),
          ),
        ),
        lineTouchData: LineTouchData(
          touchTooltipData: LineTouchTooltipData(
            getTooltipColor: (_) => color,
            tooltipRoundedRadius: 8,
            tooltipPadding:
                const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            getTooltipItems: (spots) => spots
                .map((s) => LineTooltipItem(
                      '${_fmt(s.y)}$unit',
                      const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w700,
                          fontSize: 11),
                    ))
                .toList(),
          ),
        ),
        // Pin the latest point's value badge.
        showingTooltipIndicators: spots.isEmpty
            ? const []
            : [
                ShowingTooltipIndicators([
                  LineBarSpot(_bar(spots), 0, spots.last),
                ]),
              ],
        lineBarsData: [_bar(spots)],
      ),
    );
  }

  LineChartBarData _bar(List<FlSpot> spots) => LineChartBarData(
        spots: spots,
        isCurved: true,
        preventCurveOverShooting: true,
        color: color,
        barWidth: 2.5,
        dotData: FlDotData(
          // Only draw a dot on the final point.
          checkToShowDot: (spot, _) => spot.x == (spots.length - 1).toDouble(),
          getDotPainter: (spot, _, _, _) => FlDotCirclePainter(
            radius: 4,
            color: color,
            strokeColor: Colors.white,
            strokeWidth: 2,
          ),
        ),
        belowBarData: BarAreaData(
          show: true,
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [color.withValues(alpha: 0.30), color.withValues(alpha: 0)],
          ),
        ),
      );
}
