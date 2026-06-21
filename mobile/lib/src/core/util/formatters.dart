import 'package:intl/intl.dart';

/// Small presentation formatters shared across screens. Server stays the source
/// of truth for values; these only shape them for display.
class Fmt {
  const Fmt._();

  static final _dayMonth = DateFormat('EEE, d MMM'); // Mon, 16 Jun
  static final _weekdayDayMonth = DateFormat('EEE d MMM'); // Mon 16 Jun
  static final _dayMonthYear = DateFormat('EEE, d MMM yyyy');
  static final _monthYear = DateFormat('MMMM yyyy');

  static String dayMonth(DateTime? d) => d == null ? '—' : _dayMonth.format(d);

  /// Comma-free "Mon 16 Jun" — reads cleanly after a "Today, " prefix.
  static String weekdayDayMonth(DateTime? d) =>
      d == null ? '—' : _weekdayDayMonth.format(d);
  static String dayMonthYear(DateTime? d) =>
      d == null ? '—' : _dayMonthYear.format(d);
  static String monthYear(DateTime d) => _monthYear.format(d);

  /// "HH:MM" (24h) → "6:30 AM". Falls back to the raw string if unparseable.
  static String time(String hhmm) {
    final parts = hhmm.split(':');
    if (parts.length < 2) return hhmm;
    final h = int.tryParse(parts[0]);
    final m = int.tryParse(parts[1]);
    if (h == null || m == null) return hhmm;
    return DateFormat('h:mm a').format(DateTime(2000, 1, 1, h, m));
  }

  /// Combined date + time line, e.g. "Mon, 16 Jun · 6:30 AM".
  static String dateTime(DateTime? date, String hhmm) =>
      '${dayMonth(date)} · ${time(hhmm)}';

  /// Minutes → compact duration. "60" → "1h", "90" → "1h 30m", "30" → "30m".
  static String durationMin(int min) {
    final h = min ~/ 60;
    final m = min % 60;
    if (h == 0) return '${m}m';
    if (m == 0) return '${h}h';
    return '${h}h ${m}m';
  }

  /// Add [min] minutes to an "HH:MM" string, returning "HH:MM" (wraps at 24h).
  static String addMinutes(String hhmm, int min) {
    final parts = hhmm.split(':');
    if (parts.length < 2) return hhmm;
    final h = int.tryParse(parts[0]) ?? 0;
    final m = int.tryParse(parts[1]) ?? 0;
    final total = h * 60 + m + min;
    final hh = ((total ~/ 60) % 24).toString().padLeft(2, '0');
    final mm = (total % 60).toString().padLeft(2, '0');
    return '$hh:$mm';
  }

  /// Relative "days ago" phrasing for engagement stats.
  static String daysAgo(int? days) {
    if (days == null) return 'never';
    if (days <= 0) return 'today';
    if (days == 1) return 'yesterday';
    return '$days days ago';
  }
}
