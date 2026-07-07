import 'package:flutter/material.dart';

import '../data/progress_models.dart';

/// Decorative accent palette for the body-metric cards/charts. These are
/// intentionally *not* status colours — they only distinguish one metric from
/// another, so they stay hardcoded (cf. the AppColors status migration which
/// deliberately exempts this rainbow).
const metricBlue = Color(0xFF3B82F6);
const metricOrange = Color(0xFFF97316);
const metricEmerald = Color(0xFF10B981);
const metricViolet = Color(0xFF8B5CF6);
const metricPink = Color(0xFFEC4899);
const metricAmber = Color(0xFFF59E0B);
const metricCyan = Color(0xFF06B6D4);
const metricIndigo = Color(0xFF6366F1);

/// One body-metric tracked by the Progress screen — the single source of truth
/// shared by the hero, the metric grid, the detail screen and the log sheets.
class MetricDef {
  const MetricDef({
    required this.key,
    required this.icon,
    required this.color,
    required this.label,
    required this.unit,
    required this.read,
    this.readPaired,
    this.fields = const [],
    this.lowerIsBetter = false,
  });

  final String key;
  final IconData icon;
  final Color color;
  final String label;
  final String unit;

  /// Primary value reader (e.g. left bicep for the paired metrics).
  final double? Function(ProgressEntry) read;

  /// Secondary value reader for paired metrics (e.g. right bicep), or null.
  final double? Function(ProgressEntry)? readPaired;

  /// Quick-log field keys (the API body keys). One for most, two for paired.
  final List<({String key, String hint})> fields;

  /// True when a downward trend is an improvement (weight, body-fat, waist).
  final bool lowerIsBetter;

  bool get paired => readPaired != null;

  /// Derived metrics (e.g. Lean Mass) have no input fields — they're computed
  /// from other entries and can't be logged directly.
  bool get loggable => fields.isNotEmpty;
}

/// All tracked body metrics, in display order. Weight first so it's the default
/// hero metric.
const kProgressMetrics = <MetricDef>[
  MetricDef(
    key: 'weight',
    icon: Icons.monitor_weight_outlined,
    color: metricBlue,
    label: 'Weight',
    unit: 'kg',
    read: _weight,
    fields: [(key: 'weightKg', hint: 'e.g. 74.5')],
    lowerIsBetter: true,
  ),
  MetricDef(
    key: 'bodyFat',
    icon: Icons.local_fire_department_outlined,
    color: metricOrange,
    label: 'Body Fat',
    unit: '%',
    read: _bodyFat,
    fields: [(key: 'bodyFatPercent', hint: 'e.g. 18.2')],
    lowerIsBetter: true,
  ),
  MetricDef(
    key: 'muscleMass',
    icon: Icons.fitness_center,
    color: metricEmerald,
    label: 'Muscle',
    unit: 'kg',
    read: _muscle,
    fields: [(key: 'muscleMass', hint: 'e.g. 62.0')],
  ),
  MetricDef(
    key: 'waist',
    icon: Icons.straighten,
    color: metricViolet,
    label: 'Waist',
    unit: 'cm',
    read: _waist,
    fields: [(key: 'waist', hint: 'e.g. 82.0')],
    lowerIsBetter: true,
  ),
  MetricDef(
    key: 'chest',
    icon: Icons.favorite_outline,
    color: metricPink,
    label: 'Chest',
    unit: 'cm',
    read: _chest,
    fields: [(key: 'chest', hint: 'e.g. 96.0')],
  ),
  MetricDef(
    key: 'hips',
    icon: Icons.swap_horiz,
    color: metricAmber,
    label: 'Hips',
    unit: 'cm',
    read: _hips,
    fields: [(key: 'hips', hint: 'e.g. 94.0')],
  ),
  MetricDef(
    key: 'bicep',
    icon: Icons.bolt_outlined,
    color: metricCyan,
    label: 'Bicep',
    unit: 'cm',
    read: _bicepL,
    readPaired: _bicepR,
    fields: [
      (key: 'bicepLeft', hint: 'Left (cm)'),
      (key: 'bicepRight', hint: 'Right (cm)'),
    ],
  ),
  MetricDef(
    key: 'thigh',
    icon: Icons.height,
    color: metricIndigo,
    label: 'Thigh',
    unit: 'cm',
    read: _thighL,
    readPaired: _thighR,
    fields: [
      (key: 'thighLeft', hint: 'Left (cm)'),
      (key: 'thighRight', hint: 'Right (cm)'),
    ],
  ),
  // Derived: lean mass = weight × (1 − bodyfat%). Computed per entry; not
  // loggable (no fields). Needs both weight + body-fat on the same entry.
  MetricDef(
    key: 'leanMass',
    icon: Icons.accessibility_new,
    color: metricEmerald,
    label: 'Lean Mass',
    unit: 'kg',
    read: _leanMass,
  ),
];

/// Look up a metric by its [MetricDef.key]; null when unknown.
MetricDef? metricByKey(String key) {
  for (final m in kProgressMetrics) {
    if (m.key == key) return m;
  }
  return null;
}

// Top-level readers so the registry can stay `const`.
double? _weight(ProgressEntry e) => e.weightKg;
double? _bodyFat(ProgressEntry e) => e.bodyFatPercent;
double? _muscle(ProgressEntry e) => e.muscleMass;
double? _waist(ProgressEntry e) => e.waist;
double? _chest(ProgressEntry e) => e.chest;
double? _hips(ProgressEntry e) => e.hips;
double? _bicepL(ProgressEntry e) => e.bicepLeft;
double? _bicepR(ProgressEntry e) => e.bicepRight;
double? _thighL(ProgressEntry e) => e.thighLeft;
double? _thighR(ProgressEntry e) => e.thighRight;
double? _leanMass(ProgressEntry e) {
  final w = e.weightKg;
  final bf = e.bodyFatPercent;
  if (w == null || bf == null) return null;
  return w * (1 - bf / 100);
}
