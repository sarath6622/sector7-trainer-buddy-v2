import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/util/formatters.dart';
import '../../../core/widgets/skeleton.dart';
import '../../client/presentation/widgets/client_widgets.dart';
import '../data/trainer_models.dart';
import '../data/trainer_repository.dart';

/// Trainer "Reschedule requests" — the pending requests raised by this trainer's
/// clients, each approvable / rejectable inline (with an optional review note).
class TrainerRescheduleScreen extends ConsumerWidget {
  const TrainerRescheduleScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final requests = ref.watch(trainerRescheduleProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Reschedule Requests')),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(trainerRescheduleProvider.future),
        child: requests.when(
          loading: () => const SkeletonList(),
          error: (e, _) => ListView(
            children: [
              const SizedBox(height: 120),
              ErrorRetry(
                message: e.toString(),
                onRetry: () => ref.invalidate(trainerRescheduleProvider),
              ),
            ],
          ),
          data: (list) {
            if (list.isEmpty) {
              return ListView(
                children: const [
                  SizedBox(height: 120),
                  EmptyState(
                    icon: Icons.event_available_outlined,
                    message: 'No pending reschedule requests.',
                  ),
                ],
              );
            }
            return ListView(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
              children: [for (final r in list) _RequestCard(request: r)],
            );
          },
        ),
      ),
    );
  }
}

class _RequestCard extends ConsumerStatefulWidget {
  const _RequestCard({required this.request});
  final TrainerRescheduleRequest request;

  @override
  ConsumerState<_RequestCard> createState() => _RequestCardState();
}

class _RequestCardState extends ConsumerState<_RequestCard> {
  bool _busy = false;

  Future<void> _act({required bool approve}) async {
    final messenger = ScaffoldMessenger.of(context);
    final repo = ref.read(trainerRepositoryProvider);
    final notes = await _askNotes(approve: approve);
    if (notes == null) return; // cancelled
    setState(() => _busy = true);
    try {
      if (approve) {
        await repo.approveReschedule(widget.request.id, notes: notes);
      } else {
        await repo.rejectReschedule(widget.request.id, notes: notes);
      }
      ref.invalidate(trainerRescheduleProvider);
      messenger.showSnackBar(
        SnackBar(content: Text(approve ? 'Request approved' : 'Request rejected')),
      );
    } on ApiException catch (e) {
      if (mounted) setState(() => _busy = false);
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    } catch (e) {
      if (mounted) setState(() => _busy = false);
      messenger.showSnackBar(SnackBar(content: Text(e.toString())));
    }
  }

  Future<String?> _askNotes({required bool approve}) {
    final controller = TextEditingController();
    return showDialog<String?>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(approve ? 'Approve request' : 'Reject request'),
        content: TextField(
          controller: controller,
          maxLines: 2,
          decoration: const InputDecoration(
            labelText: 'Review note (optional)',
            border: OutlineInputBorder(),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(null),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(controller.text.trim()),
            child: Text(approve ? 'Approve' : 'Reject'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final r = widget.request;
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              r.clientName ?? 'Client',
              style: Theme.of(context)
                  .textTheme
                  .titleMedium
                  ?.copyWith(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 8),
            _Line(
              icon: Icons.event_busy,
              label: 'From',
              value: Fmt.dateTime(r.originalDate, r.originalTime ?? ''),
            ),
            _Line(
              icon: Icons.event_available,
              label: 'To',
              value: Fmt.dateTime(r.requestedDate, r.requestedTime),
            ),
            if (r.reason != null && r.reason!.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(
                r.reason!,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: scheme.onSurfaceVariant,
                    ),
              ),
            ],
            const SizedBox(height: 12),
            if (_busy)
              const Center(
                child: Padding(
                  padding: EdgeInsets.all(4),
                  child: SizedBox(
                    height: 22, width: 22, child: CircularProgressIndicator(strokeWidth: 2)),
                ),
              )
            else
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => _act(approve: false),
                      child: const Text('Reject'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: FilledButton(
                      onPressed: () => _act(approve: true),
                      child: const Text('Approve'),
                    ),
                  ),
                ],
              ),
          ],
        ),
      ),
    );
  }
}

class _Line extends StatelessWidget {
  const _Line({required this.icon, required this.label, required this.value});
  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        children: [
          Icon(icon, size: 16, color: scheme.onSurfaceVariant),
          const SizedBox(width: 8),
          SizedBox(
            width: 44,
            child: Text(
              label,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: scheme.onSurfaceVariant,
                  ),
            ),
          ),
          Expanded(
            child: Text(value, style: Theme.of(context).textTheme.bodyMedium),
          ),
        ],
      ),
    );
  }
}
