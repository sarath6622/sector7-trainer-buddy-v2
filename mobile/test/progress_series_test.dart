import 'package:flutter_test/flutter_test.dart';
import 'package:sector7_mobile/src/features/client/data/progress_models.dart';
import 'package:sector7_mobile/src/features/client/domain/progress_series.dart';

ProgressEntry entry(String id, DateTime? at, {double? weight}) =>
    ProgressEntry(id: id, recordedAt: at, weightKg: weight);

DateTime day(int d) => DateTime(2026, 4, d);

void main() {
  group('seriesFor', () {
    test('keeps only entries with a date AND value, sorted ascending', () {
      // API order is newest-first; mix in null date and null value rows.
      final entries = [
        entry('c', day(10), weight: 60),
        entry('b', day(5), weight: 62),
        entry('null-val', day(7)), // value null → dropped
        entry('null-date', null, weight: 99), // date null → dropped
        entry('a', day(1), weight: 65),
      ];
      final s = seriesFor(entries, (e) => e.weightKg);
      expect(s.map((p) => p.value).toList(), [65, 62, 60]);
      expect(s.map((p) => p.date).toList(), [day(1), day(5), day(10)]);
    });

    test('returns empty when no entries carry the metric', () {
      final s = seriesFor([entry('a', day(1))], (e) => e.weightKg);
      expect(s, isEmpty);
    });
  });

  group('inRange', () {
    final points = [
      ChartPoint(date: day(1), value: 65),
      ChartPoint(date: day(20), value: 60),
      ChartPoint(date: day(29), value: 56),
    ];

    test('all keeps every point', () {
      expect(inRange(points, ProgressRange.all, now: day(30)), hasLength(3));
    });

    test('window filters out points older than the cutoff', () {
      // 7-day window from the 30th → cutoff is the 23rd → only day 29 survives.
      final r = inRange(points, ProgressRange.d7, now: day(30));
      expect(r.map((p) => p.value).toList(), [56]);
    });

    test('cutoff is inclusive at the boundary', () {
      // 10-day window from the 30th → cutoff is the 20th → day 20 is kept.
      final r = inRange(points, ProgressRange.d30, now: DateTime(2026, 4, 30));
      expect(r.map((p) => p.value).toList(), [65, 60, 56]);
      final tight = inRange(points, ProgressRange.d7, now: DateTime(2026, 4, 27));
      expect(tight.map((p) => p.value).toList(), [60, 56]);
    });
  });

  group('statsFor', () {
    test('computes first/latest/min/max/avg/change + min/max dates', () {
      final s = statsFor([
        ChartPoint(date: day(1), value: 65),
        ChartPoint(date: day(2), value: 61),
        ChartPoint(date: day(3), value: 60),
      ]);
      expect(s.count, 3);
      expect(s.first, 65);
      expect(s.latest, 60);
      expect(s.min, 60);
      expect(s.max, 65);
      expect(s.avg, closeTo(62, 0.001));
      expect(s.change, -5);
      expect(s.maxDate, day(1));
      expect(s.minDate, day(3));
    });

    test('empty series → isEmpty, all null', () {
      final s = statsFor(const []);
      expect(s.isEmpty, isTrue);
      expect(s.latest, isNull);
      expect(s.change, isNull);
    });

    test('single point → no change reported', () {
      final s = statsFor([ChartPoint(date: day(1), value: 70)]);
      expect(s.count, 1);
      expect(s.latest, 70);
      expect(s.change, isNull);
    });
  });

  group('longestDayStreak', () {
    test('counts the longest run of consecutive days, dedup same-day', () {
      final entries = [
        entry('a', day(1), weight: 1),
        entry('b', day(2), weight: 1),
        entry('b2', day(2), weight: 2), // same day → counts once
        entry('c', day(3), weight: 1),
        // gap (no day 4)
        entry('d', day(6), weight: 1),
        entry('e', day(7), weight: 1),
      ];
      expect(longestDayStreak(entries), 3); // days 1-2-3
    });

    test('empty → 0, single day → 1, ignores null dates', () {
      expect(longestDayStreak(const []), 0);
      expect(longestDayStreak([entry('a', day(1), weight: 1)]), 1);
      expect(longestDayStreak([entry('a', null, weight: 1)]), 0);
    });
  });
}
