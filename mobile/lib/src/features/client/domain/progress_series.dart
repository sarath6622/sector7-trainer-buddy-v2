import '../data/progress_models.dart';

/// Time windows for the Progress hero + charts. [all] keeps every point.
enum ProgressRange {
  d7('7D', Duration(days: 7)),
  d30('30D', Duration(days: 30)),
  d90('90D', Duration(days: 90)),
  y1('1Y', Duration(days: 365)),
  all('All', null);

  const ProgressRange(this.label, this.window);
  final String label;
  final Duration? window;
}

/// Summary stats for a series of points (already filtered to a range/metric).
/// All value getters are null when [count] is 0.
class MetricStats {
  const MetricStats({
    required this.count,
    this.first,
    this.latest,
    this.min,
    this.max,
    this.avg,
    this.minDate,
    this.maxDate,
  });

  final int count;
  final double? first;
  final double? latest;
  final double? min;
  final double? max;
  final double? avg;
  final DateTime? minDate;
  final DateTime? maxDate;

  bool get isEmpty => count == 0;

  /// Net change across the window (latest − first). Null when fewer than two
  /// points (no movement to report).
  double? get change =>
      (count >= 2 && first != null && latest != null) ? latest! - first! : null;
}

/// Build an ascending-by-date series for [read] over [entries] (which arrive
/// newest-first from the API). Skips entries with a null date or null value.
List<ChartPoint> seriesFor(
  List<ProgressEntry> entries,
  double? Function(ProgressEntry) read,
) {
  final points = <ChartPoint>[];
  for (final e in entries) {
    final d = e.recordedAt;
    final v = read(e);
    if (d == null || v == null) continue;
    points.add(ChartPoint(date: d, value: v));
  }
  points.sort((a, b) => a.date.compareTo(b.date));
  return points;
}

/// Keep only the points within [range] of [now] (defaults to `DateTime.now()`).
/// [ProgressRange.all] returns the list unchanged.
List<ChartPoint> inRange(
  List<ChartPoint> points,
  ProgressRange range, {
  DateTime? now,
}) {
  final window = range.window;
  if (window == null) return points;
  final cutoff = (now ?? DateTime.now()).subtract(window);
  return points.where((p) => !p.date.isBefore(cutoff)).toList();
}

/// Compute summary stats for an ascending series.
MetricStats statsFor(List<ChartPoint> points) {
  if (points.isEmpty) return const MetricStats(count: 0);
  var min = points.first.value;
  var max = points.first.value;
  var minDate = points.first.date;
  var maxDate = points.first.date;
  var sum = 0.0;
  for (final p in points) {
    if (p.value < min) {
      min = p.value;
      minDate = p.date;
    }
    if (p.value > max) {
      max = p.value;
      maxDate = p.date;
    }
    sum += p.value;
  }
  return MetricStats(
    count: points.length,
    first: points.first.value,
    latest: points.last.value,
    min: min,
    max: max,
    avg: sum / points.length,
    minDate: minDate,
    maxDate: maxDate,
  );
}

/// Longest run of consecutive calendar days that carry at least one entry.
/// Used for the "logging streak" callout + achievement. Multiple entries on the
/// same day count once; gaps reset the run.
int longestDayStreak(List<ProgressEntry> entries) {
  final days = <DateTime>{};
  for (final e in entries) {
    final d = e.recordedAt;
    if (d != null) days.add(DateTime(d.year, d.month, d.day));
  }
  if (days.isEmpty) return 0;
  final sorted = days.toList()..sort();
  var best = 1;
  var run = 1;
  for (var i = 1; i < sorted.length; i++) {
    final gap = sorted[i].difference(sorted[i - 1]).inDays;
    if (gap == 1) {
      run++;
      if (run > best) best = run;
    } else {
      run = 1;
    }
  }
  return best;
}
