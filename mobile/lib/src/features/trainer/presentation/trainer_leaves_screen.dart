import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/feedback/haptics.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/util/formatters.dart';
import '../../../core/widgets/skeleton.dart';
import '../../client/presentation/widgets/client_widgets.dart';
import '../data/trainer_models.dart';
import '../data/trainer_repository.dart';

/// Trainer "My Leaves" — this month's quota usage, the trainer's leave-request
/// history, and a full-day apply form. Half-day / custom leaves stay on the web
/// console; this covers the common full-day case on the floor.
class TrainerLeavesScreen extends ConsumerWidget {
  const TrainerLeavesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final leaves = ref.watch(trainerLeavesProvider);
    final balance = ref.watch(trainerLeaveBalanceProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('My Leaves')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _openApplySheet(context, ref),
        icon: const Icon(Icons.add),
        label: const Text('Apply'),
      ),
      body: RefreshIndicator(
        onRefresh: () {
          Haptics.tap();
          ref.invalidate(trainerLeaveBalanceProvider);
          return ref.refresh(trainerLeavesProvider.future);
        },
        child: leaves.when(
          loading: () => const SkeletonList(),
          error: (e, _) => ListView(
            children: [
              const SizedBox(height: 120),
              ErrorRetry(
                message: e.toString(),
                onRetry: () => ref.invalidate(trainerLeavesProvider),
              ),
            ],
          ),
          data: (list) => ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
            children: [
              balance.maybeWhen(
                data: (b) => _BalanceCard(balance: b),
                orElse: () => const SizedBox.shrink(),
              ),
              const SizedBox(height: 16),
              const SectionHeader(title: 'Requests'),
              if (list.isEmpty)
                const EmptyState(
                  icon: Icons.beach_access_outlined,
                  message: 'No leave requests yet.',
                )
              else
                for (final l in list) _LeaveCard(leave: l),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _openApplySheet(BuildContext context, WidgetRef ref) async {
    final applied = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => const _ApplyLeaveSheet(),
    );
    if (applied == true) {
      ref.invalidate(trainerLeavesProvider);
      ref.invalidate(trainerLeaveBalanceProvider);
    }
  }
}

class _BalanceCard extends StatelessWidget {
  const _BalanceCard({required this.balance});
  final LeaveBalance balance;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Card(
      color: scheme.surfaceContainerHigh,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Quota · ${balance.month}',
              style: Theme.of(context)
                  .textTheme
                  .titleSmall
                  ?.copyWith(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                _QuotaStat(
                  label: 'Regular left',
                  value: '${balance.regular.remaining}/${balance.regular.quota}',
                ),
                _QuotaStat(
                  label: 'Emergency left',
                  value: '${balance.emergency.remaining}/${balance.emergency.quota}',
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _QuotaStat extends StatelessWidget {
  const _QuotaStat({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Expanded(
      child: Column(
        children: [
          Text(
            value,
            style: Theme.of(context)
                .textTheme
                .headlineSmall
                ?.copyWith(fontWeight: FontWeight.w700),
          ),
          Text(
            label,
            style: Theme.of(context)
                .textTheme
                .bodySmall
                ?.copyWith(color: scheme.onSurfaceVariant),
          ),
        ],
      ),
    );
  }
}

class _LeaveCard extends StatelessWidget {
  const _LeaveCard({required this.leave});
  final TrainerLeave leave;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final range = leave.startDate == leave.endDate
        ? Fmt.dayMonthYear(leave.startDate)
        : '${Fmt.dayMonth(leave.startDate)} – ${Fmt.dayMonthYear(leave.endDate)}';
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
                    range,
                    style: Theme.of(context)
                        .textTheme
                        .titleSmall
                        ?.copyWith(fontWeight: FontWeight.w700),
                  ),
                ),
                _LeaveStatusChip(status: leave.status),
              ],
            ),
            if (leave.reason != null && leave.reason!.isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(leave.reason!),
            ],
            if (leave.reviewNotes != null && leave.reviewNotes!.isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(
                'Review: ${leave.reviewNotes!}',
                style: Theme.of(context)
                    .textTheme
                    .bodySmall
                    ?.copyWith(color: scheme.onSurfaceVariant),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _LeaveStatusChip extends StatelessWidget {
  const _LeaveStatusChip({required this.status});
  final LeaveStatus status;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final (bg, fg) = switch (status) {
      LeaveStatus.approved => (Colors.green.withValues(alpha: 0.18), Colors.green.shade300),
      LeaveStatus.pending => (scheme.primary.withValues(alpha: 0.22), scheme.primary),
      LeaveStatus.rejected => (Colors.red.withValues(alpha: 0.16), Colors.red.shade300),
      LeaveStatus.cancelled => (scheme.surfaceContainerHighest, scheme.onSurfaceVariant),
      LeaveStatus.unknown => (scheme.surfaceContainerHighest, scheme.onSurfaceVariant),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(999)),
      child: Text(
        status.label,
        style: TextStyle(color: fg, fontSize: 12, fontWeight: FontWeight.w600),
      ),
    );
  }
}

/// Full-day leave apply form. Pops `true` once the leave is submitted.
class _ApplyLeaveSheet extends ConsumerStatefulWidget {
  const _ApplyLeaveSheet();

  @override
  ConsumerState<_ApplyLeaveSheet> createState() => _ApplyLeaveSheetState();
}

class _ApplyLeaveSheetState extends ConsumerState<_ApplyLeaveSheet> {
  DateTime _start = DateTime.now();
  DateTime _end = DateTime.now();
  final _reason = TextEditingController();
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  Future<void> _pick({required bool isStart}) async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: isStart ? _start : _end,
      firstDate: DateTime(now.year, now.month, now.day),
      lastDate: DateTime(now.year + 1, 12, 31),
    );
    if (picked == null) return;
    setState(() {
      if (isStart) {
        _start = picked;
        if (_end.isBefore(_start)) _end = picked;
      } else {
        _end = picked;
        if (_start.isAfter(_end)) _start = picked;
      }
    });
  }

  Future<void> _submit() async {
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      await ref.read(trainerRepositoryProvider).applyLeave(
            startDate: TrainerRepository.ymd(_start),
            endDate: TrainerRepository.ymd(_end),
            reason: _reason.text.trim(),
          );
      Haptics.success();
      if (mounted) Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      Haptics.error();
      setState(() => _error = e.message);
    } catch (e) {
      Haptics.error();
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 0, 16, 16 + bottomInset),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Apply for leave',
            style: Theme.of(context)
                .textTheme
                .titleLarge
                ?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: _DateField(
                  label: 'From',
                  value: Fmt.dayMonthYear(_start),
                  onTap: () => _pick(isStart: true),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _DateField(
                  label: 'To',
                  value: Fmt.dayMonthYear(_end),
                  onTap: () => _pick(isStart: false),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _reason,
            maxLines: 2,
            decoration: const InputDecoration(
              labelText: 'Reason (optional)',
              border: OutlineInputBorder(),
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
          ],
          const SizedBox(height: 16),
          FilledButton(
            onPressed: _submitting ? null : _submit,
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
            child: _submitting
                ? const SizedBox(
                    height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
                : const Text('Submit request'),
          ),
        ],
      ),
    );
  }
}

class _DateField extends StatelessWidget {
  const _DateField({required this.label, required this.value, required this.onTap});
  final String label;
  final String value;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: InputDecorator(
        decoration: InputDecoration(
          labelText: label,
          border: const OutlineInputBorder(),
        ),
        child: Text(value),
      ),
    );
  }
}
