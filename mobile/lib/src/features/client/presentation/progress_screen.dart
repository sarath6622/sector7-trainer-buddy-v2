import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/feedback/haptics.dart';
import '../../../core/util/formatters.dart';
import '../../../core/widgets/glass_dock_nav_bar.dart';
import '../../../core/widgets/skeleton.dart';
import '../data/client_repository.dart';
import '../data/progress_models.dart';
import 'widgets/client_widgets.dart';
import 'widgets/metric_line_chart.dart';

// Accent palette — mirrors the PWA metric tiles.
const _blue = Color(0xFF3B82F6);
const _orange = Color(0xFFF97316);
const _emerald = Color(0xFF10B981);
const _violet = Color(0xFF8B5CF6);
const _pink = Color(0xFFEC4899);
const _amber = Color(0xFFF59E0B);
const _cyan = Color(0xFF06B6D4);
const _indigo = Color(0xFF6366F1);
const _red = Color(0xFFEF4444);

/// One body-metric tracked by the chips + quick-log.
class _Metric {
  const _Metric({
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
  final double? Function(ProgressEntry) read;
  final double? Function(ProgressEntry)? readPaired;

  /// Quick-log field keys (the API body keys). One for most, two for paired.
  final List<({String key, String hint})> fields;
  final bool lowerIsBetter;

  bool get paired => readPaired != null;
}

final _metrics = <_Metric>[
  _Metric(
    key: 'weight',
    icon: Icons.monitor_weight_outlined,
    color: _blue,
    label: 'Weight',
    unit: 'kg',
    read: (e) => e.weightKg,
    fields: const [(key: 'weightKg', hint: 'e.g. 74.5')],
    lowerIsBetter: true,
  ),
  _Metric(
    key: 'bodyFat',
    icon: Icons.local_fire_department_outlined,
    color: _orange,
    label: 'Body Fat',
    unit: '%',
    read: (e) => e.bodyFatPercent,
    fields: const [(key: 'bodyFatPercent', hint: 'e.g. 18.2')],
    lowerIsBetter: true,
  ),
  _Metric(
    key: 'muscleMass',
    icon: Icons.fitness_center,
    color: _emerald,
    label: 'Muscle',
    unit: 'kg',
    read: (e) => e.muscleMass,
    fields: const [(key: 'muscleMass', hint: 'e.g. 62.0')],
  ),
  _Metric(
    key: 'waist',
    icon: Icons.straighten,
    color: _violet,
    label: 'Waist',
    unit: 'cm',
    read: (e) => e.waist,
    fields: const [(key: 'waist', hint: 'e.g. 82.0')],
    lowerIsBetter: true,
  ),
  _Metric(
    key: 'chest',
    icon: Icons.favorite_outline,
    color: _pink,
    label: 'Chest',
    unit: 'cm',
    read: (e) => e.chest,
    fields: const [(key: 'chest', hint: 'e.g. 96.0')],
  ),
  _Metric(
    key: 'hips',
    icon: Icons.swap_horiz,
    color: _amber,
    label: 'Hips',
    unit: 'cm',
    read: (e) => e.hips,
    fields: const [(key: 'hips', hint: 'e.g. 94.0')],
  ),
  _Metric(
    key: 'bicep',
    icon: Icons.bolt_outlined,
    color: _cyan,
    label: 'Bicep',
    unit: 'cm',
    read: (e) => e.bicepLeft,
    readPaired: (e) => e.bicepRight,
    fields: const [
      (key: 'bicepLeft', hint: 'Left (cm)'),
      (key: 'bicepRight', hint: 'Right (cm)'),
    ],
  ),
  _Metric(
    key: 'thigh',
    icon: Icons.height,
    color: _indigo,
    label: 'Thigh',
    unit: 'cm',
    read: (e) => e.thighLeft,
    readPaired: (e) => e.thighRight,
    fields: const [
      (key: 'thighLeft', hint: 'Left (cm)'),
      (key: 'thighRight', hint: 'Right (cm)'),
    ],
  ),
];

/// Client progress — mirrors the PWA `/client/progress`: header, a horizontal
/// metric-chip strip with inline logging, and Body Metrics / Workouts / History
/// tabs.
class ProgressScreen extends ConsumerStatefulWidget {
  const ProgressScreen({super.key});

  @override
  ConsumerState<ProgressScreen> createState() => _ProgressScreenState();
}

class _ProgressScreenState extends ConsumerState<ProgressScreen> {
  int _tab = 0; // 0 body, 1 workouts, 2 history

  @override
  Widget build(BuildContext context) {
    final entriesAsync = ref.watch(progressEntriesProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Progress')),
      body: RefreshIndicator(
        onRefresh: () async {
          Haptics.tap();
          ref.invalidate(progressEntriesProvider);
          for (final m in ChartMetric.values) {
            ref.invalidate(progressChartProvider(m));
          }
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
            tab: _tab,
            onTab: (i) => setState(() => _tab = i),
            onLog: (m) => _openQuickLog(context, m),
          ),
        ),
      ),
    );
  }

  Future<void> _openQuickLog(BuildContext context, _Metric m) async {
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _QuickLogSheet(metric: m),
    );
    if (saved == true) {
      ref.invalidate(progressEntriesProvider);
      for (final cm in ChartMetric.values) {
        ref.invalidate(progressChartProvider(cm));
      }
    }
  }
}

class _Body extends StatelessWidget {
  const _Body({
    required this.entries,
    required this.tab,
    required this.onTab,
    required this.onLog,
  });

  final List<ProgressEntry> entries;
  final int tab;
  final ValueChanged<int> onTab;
  final ValueChanged<_Metric> onLog;

  double? _latest(_Metric m) {
    for (final e in entries) {
      final v = m.read(e);
      if (v != null) return v;
    }
    return null;
  }

  double? _latestPaired(_Metric m) {
    if (m.readPaired == null) return null;
    for (final e in entries) {
      final v = m.readPaired!(e);
      if (v != null) return v;
    }
    return null;
  }

  double? _previous(_Metric m) {
    var seenLatest = false;
    for (final e in entries) {
      final v = m.read(e);
      if (v == null) continue;
      if (!seenLatest) {
        seenLatest = true;
        continue;
      }
      return v;
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return ListView(
      padding: EdgeInsets.fromLTRB(16, 16, 16, glassDockScrollInset(context)),
      children: [
        // Header.
        Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('My Progress',
                      style: Theme.of(context)
                          .textTheme
                          .titleLarge
                          ?.copyWith(fontWeight: FontWeight.w800)),
                  Text('${entries.length} entries recorded',
                      style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant)),
                ],
              ),
            ),
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                  color: scheme.primary.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(12)),
              child: Icon(Icons.trending_up, size: 18, color: scheme.primary),
            ),
          ],
        ),
        const SizedBox(height: 16),

        // Metric chips strip.
        SizedBox(
          height: 116,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: _metrics.length,
            separatorBuilder: (_, _) => const SizedBox(width: 10),
            itemBuilder: (_, i) {
              final m = _metrics[i];
              return _MetricChip(
                metric: m,
                value: _latest(m),
                paired: _latestPaired(m),
                prev: _previous(m),
                onLog: () => onLog(m),
              );
            },
          ),
        ),
        const SizedBox(height: 16),

        // Tabs.
        _TabBar(index: tab, onChanged: onTab),
        const SizedBox(height: 16),

        if (tab == 0) _BodyMetricsTab(onLog: onLog),
        if (tab == 1) const _WorkoutsTab(),
        if (tab == 2) _HistoryTab(entries: entries),
      ],
    );
  }
}

// ── Metric chip ───────────────────────────────────────────────────────────────
class _MetricChip extends StatelessWidget {
  const _MetricChip({
    required this.metric,
    required this.value,
    required this.paired,
    required this.prev,
    required this.onLog,
  });

  final _Metric metric;
  final double? value;
  final double? paired;
  final double? prev;
  final VoidCallback onLog;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final hasData = value != null;
    final display = !hasData
        ? '—'
        : (metric.paired ? '${_f(value)}/${_f(paired)}' : _f(value));
    return Container(
      width: 130,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerLow,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: scheme.outlineVariant),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Container(
                width: 28,
                height: 28,
                decoration: BoxDecoration(
                    color: metric.color.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(9)),
                child: Icon(metric.icon, size: 14, color: metric.color),
              ),
              InkWell(
                onTap: onLog,
                borderRadius: BorderRadius.circular(6),
                child: Padding(
                  padding: const EdgeInsets.all(2),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    Icon(Icons.add, size: 12, color: scheme.primary),
                    Text('Log',
                        style: TextStyle(
                            fontSize: 10, color: scheme.primary, fontWeight: FontWeight.w600)),
                  ]),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(metric.label,
              style: TextStyle(fontSize: 10, color: scheme.onSurfaceVariant)),
          const SizedBox(height: 2),
          Text.rich(TextSpan(
            text: display,
            style: TextStyle(
                fontSize: display.contains('/') ? 14 : 18,
                fontWeight: FontWeight.w800,
                height: 1),
            children: hasData
                ? [
                    TextSpan(
                        text: ' ${metric.unit}',
                        style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.w400,
                            color: scheme.onSurfaceVariant)),
                  ]
                : null,
          )),
          const SizedBox(height: 4),
          if (!hasData)
            Text('Tap + Log to start',
                style: TextStyle(fontSize: 9, color: scheme.onSurfaceVariant))
          else
            _DeltaChip(
                diff: (value != null && prev != null) ? value! - prev! : null,
                unit: metric.unit,
                lowerIsBetter: metric.lowerIsBetter),
        ],
      ),
    );
  }
}

class _DeltaChip extends StatelessWidget {
  const _DeltaChip({required this.diff, required this.unit, this.lowerIsBetter = false});
  final double? diff;
  final String unit;
  final bool lowerIsBetter;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    if (diff == null || diff!.abs() < 0.01) {
      return Text('No change', style: TextStyle(fontSize: 10, color: scheme.onSurfaceVariant));
    }
    final positive = lowerIsBetter ? diff! < 0 : diff! > 0;
    final color = positive ? _emerald : _red;
    return Row(mainAxisSize: MainAxisSize.min, children: [
      Icon(diff! < 0 ? Icons.arrow_downward : Icons.arrow_upward, size: 11, color: color),
      Text('${diff! > 0 ? '+' : ''}${diff!.toStringAsFixed(1)}$unit',
          style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: color)),
    ]);
  }
}

// ── Tab bar (segmented) ───────────────────────────────────────────────────────
class _TabBar extends StatelessWidget {
  const _TabBar({required this.index, required this.onChanged});
  final int index;
  final ValueChanged<int> onChanged;

  static const _labels = ['Body Metrics', 'Workouts', 'History'];

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
          color: scheme.surfaceContainerHigh,
          borderRadius: BorderRadius.circular(12)),
      child: Row(
        children: [
          for (var i = 0; i < _labels.length; i++)
            Expanded(
              child: GestureDetector(
                onTap: () => onChanged(i),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 150),
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  decoration: BoxDecoration(
                    color: i == index ? scheme.surfaceContainerLow : Colors.transparent,
                    borderRadius: BorderRadius.circular(9),
                    border: i == index ? Border.all(color: scheme.outlineVariant) : null,
                  ),
                  child: Text(
                    _labels[i],
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: i == index ? FontWeight.w700 : FontWeight.w500,
                      color: i == index ? scheme.onSurface : scheme.onSurfaceVariant,
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

// ── Body Metrics tab (charts) ─────────────────────────────────────────────────
class _BodyMetricsTab extends ConsumerWidget {
  const _BodyMetricsTab({required this.onLog});
  final ValueChanged<_Metric> onLog;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    final charts = <Widget>[];
    const specs = [
      (ChartMetric.weight, 'Weight', 'weight', _blue),
      (ChartMetric.bodyFat, 'Body Fat %', 'bodyFat', _orange),
      (ChartMetric.muscleMass, 'Muscle Mass', 'muscleMass', _emerald),
    ];
    for (final (metric, title, key, color) in specs) {
      final points = ref.watch(progressChartProvider(metric)).valueOrNull ?? const [];
      if (points.length < 2) continue;
      charts.add(Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: scheme.surfaceContainerLow,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: scheme.outlineVariant),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(title.toUpperCase(),
                    style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.8,
                        color: scheme.onSurfaceVariant)),
                InkWell(
                  onTap: () => onLog(_metrics.firstWhere((m) => m.key == key)),
                  borderRadius: BorderRadius.circular(8),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
                    child: Row(mainAxisSize: MainAxisSize.min, children: [
                      Icon(Icons.add, size: 12, color: scheme.primary),
                      Text('Log',
                          style: TextStyle(
                              fontSize: 10, color: scheme.primary, fontWeight: FontWeight.w600)),
                    ]),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            SizedBox(
              height: 160,
              child: MetricLineChart(points: points, unit: metric.unit, color: color),
            ),
          ],
        ),
      ));
    }

    if (charts.isEmpty) {
      return _DashedEmpty(
        icon: Icons.trending_up,
        title: 'No body metric data yet',
        subtitle: 'Tap + Log on any metric above to start tracking',
      );
    }
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: charts);
  }
}

// ── Workouts tab ──────────────────────────────────────────────────────────────
class _WorkoutsTab extends StatelessWidget {
  const _WorkoutsTab();

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return InkWell(
      onTap: () => context.push('/client/workouts'),
      borderRadius: BorderRadius.circular(18),
      child: Container(
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          color: scheme.surfaceContainerLow,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: scheme.outlineVariant),
        ),
        child: Row(children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
                color: _emerald.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(12)),
            child: const Icon(Icons.fitness_center, color: _emerald),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Workout history',
                    style: TextStyle(fontWeight: FontWeight.w700)),
                Text('Every exercise & set you have logged',
                    style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant)),
              ],
            ),
          ),
          Icon(Icons.chevron_right, color: scheme.onSurfaceVariant),
        ]),
      ),
    );
  }
}

// ── History tab ───────────────────────────────────────────────────────────────
class _HistoryTab extends StatelessWidget {
  const _HistoryTab({required this.entries});
  final List<ProgressEntry> entries;

  @override
  Widget build(BuildContext context) {
    if (entries.isEmpty) {
      return _DashedEmpty(
        icon: Icons.trending_up,
        title: 'No progress entries recorded yet',
        subtitle: 'Log a measurement above to begin your history',
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (var i = 0; i < entries.length; i++) ...[
          if (i > 0) const SizedBox(height: 10),
          _HistoryCard(entry: entries[i], isLatest: i == 0),
        ],
      ],
    );
  }
}

class _HistoryCard extends StatelessWidget {
  const _HistoryCard({required this.entry, required this.isLatest});
  final ProgressEntry entry;
  final bool isLatest;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final date = entry.recordedAt;
    final measurements = entry.measurements;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerLow,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: scheme.outlineVariant),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                  color: scheme.primary.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(14)),
              child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                Text(date != null ? '${date.day}' : '—',
                    style: TextStyle(
                        fontSize: 16, height: 1, fontWeight: FontWeight.w800, color: scheme.primary)),
                Text(date != null ? Fmt.monthShort(date).toUpperCase() : '',
                    style: TextStyle(
                        fontSize: 9, fontWeight: FontWeight.w600, color: scheme.primary.withValues(alpha: 0.7))),
              ]),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(children: [
                    Flexible(
                      child: Text(Fmt.dayMonthYear(date),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
                    ),
                    if (isLatest) ...[
                      const SizedBox(width: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                        decoration: BoxDecoration(
                            color: scheme.primary.withValues(alpha: 0.15),
                            borderRadius: BorderRadius.circular(999)),
                        child: Text('LATEST',
                            style: TextStyle(
                                fontSize: 9, fontWeight: FontWeight.w700, color: scheme.primary)),
                      ),
                    ],
                  ]),
                  Text('${measurements.length} measurements',
                      style: TextStyle(fontSize: 11, color: scheme.onSurfaceVariant)),
                ],
              ),
            ),
          ]),
          if (measurements.isNotEmpty) ...[
            const SizedBox(height: 12),
            Divider(height: 1, color: scheme.outlineVariant),
            const SizedBox(height: 12),
            Wrap(
              spacing: 16,
              runSpacing: 12,
              children: [
                for (final m in measurements)
                  SizedBox(
                    width: (MediaQuery.sizeOf(context).width - 32 - 32 - 32) / 3,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(m.label,
                            style: TextStyle(fontSize: 10, color: scheme.onSurfaceVariant)),
                        Text(m.value,
                            style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
                      ],
                    ),
                  ),
              ],
            ),
          ],
          if (entry.notes != null && entry.notes!.isNotEmpty) ...[
            const SizedBox(height: 10),
            Text(entry.notes!,
                style: TextStyle(
                    fontSize: 12, fontStyle: FontStyle.italic, color: scheme.onSurfaceVariant)),
          ],
        ],
      ),
    );
  }
}

// ── Quick-log bottom sheet ────────────────────────────────────────────────────
class _QuickLogSheet extends ConsumerStatefulWidget {
  const _QuickLogSheet({required this.metric});
  final _Metric metric;

  @override
  ConsumerState<_QuickLogSheet> createState() => _QuickLogSheetState();
}

class _QuickLogSheetState extends ConsumerState<_QuickLogSheet> {
  late final Map<String, TextEditingController> _controllers = {
    for (final f in widget.metric.fields) f.key: TextEditingController(),
  };
  bool _saving = false;
  bool _saved = false;

  @override
  void dispose() {
    for (final c in _controllers.values) {
      c.dispose();
    }
    super.dispose();
  }

  bool get _hasInput =>
      _controllers.values.any((c) => double.tryParse(c.text.trim()) != null);

  Future<void> _save() async {
    final payload = <String, double>{};
    _controllers.forEach((k, c) {
      final v = double.tryParse(c.text.trim());
      if (v != null) payload[k] = v;
    });
    if (payload.isEmpty) return;
    setState(() => _saving = true);
    try {
      await ref.read(clientRepositoryProvider).logProgress(payload);
      if (mounted) setState(() => _saved = true);
      await Future<void>.delayed(const Duration(milliseconds: 900));
      if (mounted) Navigator.of(context).pop(true);
    } catch (_) {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final m = widget.metric;
    return Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 20,
        bottom: MediaQuery.viewInsetsOf(context).bottom + 24,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(children: [
            Icon(Icons.add, size: 18, color: scheme.primary),
            const SizedBox(width: 6),
            Text('Log ${m.label}',
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
          ]),
          const SizedBox(height: 4),
          Text("Enter today's ${m.label.toLowerCase()} in ${m.unit}.",
              style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant)),
          const SizedBox(height: 16),
          if (_saved)
            Column(children: [
              const Icon(Icons.check_circle, size: 40, color: _emerald),
              const SizedBox(height: 8),
              Text('Saved!',
                  style: TextStyle(color: _emerald, fontWeight: FontWeight.w600)),
              const SizedBox(height: 12),
            ])
          else ...[
            for (final f in m.fields) ...[
              TextField(
                controller: _controllers[f.key],
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                inputFormatters: [
                  FilteringTextInputFormatter.allow(RegExp(r'[0-9.]')),
                ],
                autofocus: m.fields.first.key == f.key,
                decoration: InputDecoration(
                  hintText: f.hint,
                  suffixText: m.unit,
                  isDense: true,
                ),
                onChanged: (_) => setState(() {}),
                onSubmitted: (_) => _hasInput ? _save() : null,
              ),
              const SizedBox(height: 10),
            ],
            const SizedBox(height: 4),
            FilledButton(
              onPressed: (_saving || !_hasInput) ? null : _save,
              child: Text(_saving ? 'Saving…' : 'Save ${m.label}'),
            ),
          ],
        ],
      ),
    );
  }
}

// ── Shared bits ───────────────────────────────────────────────────────────────
class _DashedEmpty extends StatelessWidget {
  const _DashedEmpty({required this.icon, required this.title, required this.subtitle});
  final IconData icon;
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 48, horizontal: 24),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: scheme.outlineVariant),
      ),
      child: Column(children: [
        Container(
          width: 60,
          height: 60,
          decoration: BoxDecoration(
              color: scheme.surfaceContainerHigh, shape: BoxShape.circle),
          child: Icon(icon, size: 26, color: scheme.onSurfaceVariant),
        ),
        const SizedBox(height: 14),
        Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
        const SizedBox(height: 4),
        Text(subtitle,
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 13, color: scheme.onSurfaceVariant)),
      ]),
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
          Bone(width: 160, height: 24, radius: 8),
          SizedBox(height: 16),
          Bone(width: double.infinity, height: 200, radius: 16),
          SizedBox(height: 16),
          Bone(width: double.infinity, height: 88, radius: 16),
          SizedBox(height: 12),
          Bone(width: double.infinity, height: 88, radius: 16),
        ],
      ),
    );
  }
}

String _f(double? v) =>
    v == null ? '—' : (v == v.roundToDouble() ? v.toStringAsFixed(1) : v.toStringAsFixed(1));
