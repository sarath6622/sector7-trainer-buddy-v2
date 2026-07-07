import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/feedback/haptics.dart';
import '../../../core/util/formatters.dart';
import '../data/client_extras_models.dart';
import '../../../core/widgets/skeleton.dart';
import '../data/client_repository.dart';
import 'widgets/client_widgets.dart';

class RescheduleRequestsScreen extends ConsumerWidget {
  const RescheduleRequestsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final requests = ref.watch(rescheduleRequestsProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Reschedule requests')),
      body: RefreshIndicator(
        onRefresh: () => Haptics.onRefresh(() => ref.refresh(rescheduleRequestsProvider.future)),
        child: requests.when(
          loading: () => const SkeletonList(),
          error: (e, _) => ListView(children: [
            const SizedBox(height: 120),
            ErrorRetry(
                message: e.toString(),
                onRetry: () => ref.invalidate(rescheduleRequestsProvider)),
          ]),
          data: (list) => list.isEmpty
              ? ListView(children: const [
                  SizedBox(height: 120),
                  EmptyState(
                    icon: Icons.swap_horiz,
                    message: 'No reschedule requests.\nAsk to move a session from its detail screen.',
                  ),
                ])
              : ListView(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
                  children: [for (final r in list) _RequestCard(request: r)],
                ),
        ),
      ),
    );
  }
}

class _RequestCard extends StatelessWidget {
  const _RequestCard({required this.request});
  final RescheduleRequestItem request;

  @override
  Widget build(BuildContext context) {
    final r = request;
    final scheme = Theme.of(context).colorScheme;
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Requested ${Fmt.dayMonth(r.createdAt)}',
                    style: Theme.of(context)
                        .textTheme
                        .bodySmall
                        ?.copyWith(color: scheme.onSurfaceVariant),
                  ),
                ),
                RescheduleStatusChip(status: r.status),
              ],
            ),
            const SizedBox(height: 10),
            _MoveRow(
              fromDate: r.originalDate,
              fromTime: r.originalTime,
              toDate: r.requestedDate,
              toTime: r.requestedTime,
            ),
            if (r.trainerName != null) ...[
              const SizedBox(height: 6),
              Text('with ${r.trainerName}',
                  style: Theme.of(context)
                      .textTheme
                      .bodySmall
                      ?.copyWith(color: scheme.onSurfaceVariant)),
            ],
            if (r.reason != null && r.reason!.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text('“${r.reason}”', style: const TextStyle(fontStyle: FontStyle.italic)),
            ],
            if (r.reviewNotes != null && r.reviewNotes!.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text('Trainer: ${r.reviewNotes}',
                  style: TextStyle(color: scheme.onSurfaceVariant)),
            ],
          ],
        ),
      ),
    );
  }
}

class _MoveRow extends StatelessWidget {
  const _MoveRow({
    required this.fromDate,
    required this.fromTime,
    required this.toDate,
    required this.toTime,
  });
  final DateTime? fromDate;
  final String? fromTime;
  final DateTime? toDate;
  final String toTime;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final from = fromDate == null
        ? '—'
        : '${Fmt.dayMonth(fromDate)}${fromTime != null ? ', ${Fmt.time(fromTime!)}' : ''}';
    final to = '${Fmt.dayMonth(toDate)}, ${Fmt.time(toTime)}';
    return Row(
      children: [
        Expanded(
          child: Text(from,
              style: const TextStyle(decoration: TextDecoration.lineThrough)),
        ),
        Icon(Icons.arrow_forward, size: 16, color: scheme.onSurfaceVariant),
        const SizedBox(width: 8),
        Expanded(
          child: Text(to,
              textAlign: TextAlign.end,
              style: const TextStyle(fontWeight: FontWeight.w700)),
        ),
      ],
    );
  }
}

/// Coloured pill for a reschedule request status.
class RescheduleStatusChip extends StatelessWidget {
  const RescheduleStatusChip({super.key, required this.status});
  final RescheduleStatus status;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final (bg, fg) = switch (status) {
      RescheduleStatus.approved => (Colors.green.withValues(alpha: 0.18), Colors.green.shade300),
      RescheduleStatus.pending => (scheme.surfaceContainerHighest, scheme.onSurfaceVariant),
      RescheduleStatus.rejected => (Colors.red.withValues(alpha: 0.16), Colors.red.shade300),
      RescheduleStatus.unknown => (scheme.surfaceContainerHighest, scheme.onSurfaceVariant),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(999)),
      child: Text(status.label,
          style: TextStyle(color: fg, fontSize: 12, fontWeight: FontWeight.w600)),
    );
  }
}
