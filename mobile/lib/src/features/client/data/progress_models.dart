/// Models for the Progress + Workout-history screens (Phase 2). Mirror the
/// existing endpoints:
///   GET /api/client/progress/charts?metric=...  → [{ date, value, label }]
///   GET /api/client/progress                     → ProgressEntry[]
///   GET /api/client/workouts                     → WorkoutLog[] (with session)
library;

import 'client_models.dart';

double? _asDouble(Object? v) =>
    v == null ? null : (v is num ? v.toDouble() : (v is String ? double.tryParse(v) : null));

DateTime? _asDate(Object? v) =>
    v is String && v.isNotEmpty ? DateTime.tryParse(v)?.toLocal() : null;

String _trimDouble(double v) =>
    v == v.roundToDouble() ? v.toInt().toString() : v.toStringAsFixed(1);

/// Body metrics the charts endpoint can plot without an exerciseId.
enum ChartMetric {
  weight('weight', 'Weight', 'kg'),
  bodyFat('bodyFat', 'Body fat', '%'),
  muscleMass('muscleMass', 'Muscle', 'kg');

  const ChartMetric(this.apiValue, this.label, this.unit);
  final String apiValue;
  final String label;
  final String unit;
}

/// One point on a progress line chart.
class ChartPoint {
  const ChartPoint({required this.date, required this.value});
  final DateTime date;
  final double value;

  static List<ChartPoint> listFromJson(List<dynamic> data) => data
      .whereType<Map>()
      .map((m) => ChartPoint(
            date: _asDate(m['date']) ?? DateTime.fromMillisecondsSinceEpoch(0),
            value: _asDouble(m['value']) ?? 0,
          ))
      .where((p) => p.date.millisecondsSinceEpoch > 0)
      .toList();
}

/// A body-measurement snapshot. Every field is optional — entries are sparse.
class ProgressEntry {
  const ProgressEntry({
    required this.id,
    required this.recordedAt,
    this.weightKg,
    this.bodyFatPercent,
    this.muscleMass,
    this.chest,
    this.waist,
    this.hips,
    this.bicepLeft,
    this.bicepRight,
    this.thighLeft,
    this.thighRight,
    this.notes,
  });

  final String id;
  final DateTime? recordedAt;
  final double? weightKg;
  final double? bodyFatPercent;
  final double? muscleMass;
  final double? chest;
  final double? waist;
  final double? hips;
  final double? bicepLeft;
  final double? bicepRight;
  final double? thighLeft;
  final double? thighRight;
  final String? notes;

  factory ProgressEntry.fromJson(Map<String, dynamic> json) => ProgressEntry(
        id: json['id'] as String,
        recordedAt: _asDate(json['recordedAt']),
        weightKg: _asDouble(json['weightKg']),
        bodyFatPercent: _asDouble(json['bodyFatPercent']),
        muscleMass: _asDouble(json['muscleMass']),
        chest: _asDouble(json['chest']),
        waist: _asDouble(json['waist']),
        hips: _asDouble(json['hips']),
        bicepLeft: _asDouble(json['bicepLeft']),
        bicepRight: _asDouble(json['bicepRight']),
        thighLeft: _asDouble(json['thighLeft']),
        thighRight: _asDouble(json['thighRight']),
        notes: json['notes'] as String?,
      );

  /// Label/value pairs for whichever measurements are present (for a grid).
  List<({String label, String value})> get measurements {
    final out = <({String label, String value})>[];
    void add(String label, double? v, String unit) {
      if (v != null) out.add((label: label, value: '${_trimDouble(v)}$unit'));
    }

    add('Weight', weightKg, ' kg');
    add('Body fat', bodyFatPercent, '%');
    add('Muscle', muscleMass, ' kg');
    add('Chest', chest, ' cm');
    add('Waist', waist, ' cm');
    add('Hips', hips, ' cm');
    add('Bicep L', bicepLeft, ' cm');
    add('Bicep R', bicepRight, ' cm');
    add('Thigh L', thighLeft, ' cm');
    add('Thigh R', thighRight, ' cm');
    return out;
  }
}

/// One logged exercise from the workout-history feed, with the session it
/// belongs to (for grouping/labelling). Reuses [WorkoutLogEntry] for the
/// exercise + sets shape, which is identical to the session-detail payload.
class WorkoutHistoryEntry {
  const WorkoutHistoryEntry({
    required this.log,
    required this.sessionId,
    required this.sessionDate,
    required this.scheduledTime,
    this.trainerName,
  });

  final WorkoutLogEntry log;
  final String sessionId;
  final DateTime? sessionDate;
  final String scheduledTime;
  final String? trainerName;

  factory WorkoutHistoryEntry.fromJson(Map<String, dynamic> json) {
    final si = (json['sessionInstance'] as Map?) ?? const {};
    final trainerUser = (si['trainer'] as Map?)?['user'] as Map?;
    final name = trainerUser == null
        ? null
        : '${trainerUser['firstName'] ?? ''} ${trainerUser['lastName'] ?? ''}'.trim();
    return WorkoutHistoryEntry(
      log: WorkoutLogEntry.fromJson(json),
      sessionId: (si['id'] ?? '') as String,
      sessionDate: _asDate(si['scheduledDate']),
      scheduledTime: (si['scheduledTime'] ?? '') as String,
      trainerName: (name?.isEmpty ?? true) ? null : name,
    );
  }
}
