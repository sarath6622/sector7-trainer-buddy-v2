import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/util/formatters.dart';
import '../data/progress_models.dart';
import '../data/client_repository.dart';
import 'widgets/client_widgets.dart';
import 'widgets/metric_line_chart.dart';

class ProgressScreen extends ConsumerStatefulWidget {
  const ProgressScreen({super.key});

  @override
  ConsumerState<ProgressScreen> createState() => _ProgressScreenState();
}

class _ProgressScreenState extends ConsumerState<ProgressScreen> {
  ChartMetric _metric = ChartMetric.weight;

  @override
  Widget build(BuildContext context) {
    final chart = ref.watch(progressChartProvider(_metric));
    final entries = ref.watch(progressEntriesProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Progress')),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(progressChartProvider(_metric));
          ref.invalidate(progressEntriesProvider);
          await ref.read(progressEntriesProvider.future);
        },
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
          children: [
            // Metric selector.
            SegmentedButton<ChartMetric>(
              segments: [
                for (final m in ChartMetric.values)
                  ButtonSegment(value: m, label: Text(m.label)),
              ],
              selected: {_metric},
              showSelectedIcon: false,
              onSelectionChanged: (s) => setState(() => _metric = s.first),
            ),
            const SizedBox(height: 16),

            // Chart card.
            Card(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(8, 20, 16, 12),
                child: SizedBox(
                  height: 240,
                  child: chart.when(
                    loading: () => const Center(child: CircularProgressIndicator()),
                    error: (e, _) => ErrorRetry(
                      message: e.toString(),
                      onRetry: () => ref.invalidate(progressChartProvider(_metric)),
                    ),
                    data: (points) => points.length < 2
                        ? EmptyState(
                            icon: Icons.show_chart,
                            message: points.isEmpty
                                ? 'No ${_metric.label.toLowerCase()} data logged yet.'
                                : 'Need at least 2 entries to chart a trend.',
                          )
                        : MetricLineChart(points: points, unit: _metric.unit),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 16),

            // Latest measurements.
            const SectionHeader(title: 'Latest measurements'),
            entries.when(
              loading: () => const Card(
                child: Padding(
                  padding: EdgeInsets.all(24),
                  child: Center(child: CircularProgressIndicator()),
                ),
              ),
              error: (e, _) => ErrorRetry(
                message: e.toString(),
                onRetry: () => ref.invalidate(progressEntriesProvider),
              ),
              data: (list) => list.isEmpty
                  ? const Card(
                      child: Padding(
                        padding: EdgeInsets.all(24),
                        child: EmptyState(
                          icon: Icons.straighten,
                          message: 'No measurements recorded yet.',
                        ),
                      ),
                    )
                  : _LatestMeasurements(entry: list.first),
            ),
            const SizedBox(height: 16),

            // Workout history entry point.
            Card(
              child: ListTile(
                onTap: () => context.push('/client/workouts'),
                leading: const Icon(Icons.history),
                title: const Text('Workout history'),
                subtitle: const Text('Every exercise you have logged'),
                trailing: const Icon(Icons.chevron_right),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _LatestMeasurements extends StatelessWidget {
  const _LatestMeasurements({required this.entry});
  final ProgressEntry entry;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final measurements = entry.measurements;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Recorded ${Fmt.dayMonthYear(entry.recordedAt)}',
              style: Theme.of(context)
                  .textTheme
                  .bodySmall
                  ?.copyWith(color: scheme.onSurfaceVariant),
            ),
            const SizedBox(height: 12),
            if (measurements.isEmpty)
              Text(
                'No numeric measurements on this entry.',
                style: TextStyle(color: scheme.onSurfaceVariant),
              )
            else
              Wrap(
                spacing: 12,
                runSpacing: 12,
                children: [
                  for (final m in measurements)
                    SizedBox(
                      width: (MediaQuery.sizeOf(context).width - 32 - 32 - 24) / 3,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            m.value,
                            style: Theme.of(context)
                                .textTheme
                                .titleMedium
                                ?.copyWith(fontWeight: FontWeight.w700),
                          ),
                          Text(
                            m.label,
                            style: Theme.of(context)
                                .textTheme
                                .bodySmall
                                ?.copyWith(color: scheme.onSurfaceVariant),
                          ),
                        ],
                      ),
                    ),
                ],
              ),
            if (entry.notes != null && entry.notes!.isNotEmpty) ...[
              const SizedBox(height: 12),
              Text(entry.notes!, style: TextStyle(color: scheme.onSurfaceVariant)),
            ],
          ],
        ),
      ),
    );
  }
}
