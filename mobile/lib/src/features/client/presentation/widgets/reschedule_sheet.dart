import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../../core/network/api_exception.dart';
import '../../../../core/util/formatters.dart';
import '../../data/client_models.dart';
import '../../data/client_repository.dart';

/// Opens the reschedule-request form for [session]. Returns true if a request
/// was submitted (so the caller can refresh).
Future<bool> showRescheduleSheet(
  BuildContext context,
  SessionSummary session,
) async {
  final result = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: _RescheduleForm(session: session),
    ),
  );
  return result ?? false;
}

class _RescheduleForm extends ConsumerStatefulWidget {
  const _RescheduleForm({required this.session});
  final SessionSummary session;

  @override
  ConsumerState<_RescheduleForm> createState() => _RescheduleFormState();
}

class _RescheduleFormState extends ConsumerState<_RescheduleForm> {
  DateTime? _date;
  TimeOfDay? _time;
  final _reason = TextEditingController();
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    // Seed the time from the original slot for convenience.
    final parts = widget.session.scheduledTime.split(':');
    if (parts.length >= 2) {
      final h = int.tryParse(parts[0]);
      final m = int.tryParse(parts[1]);
      if (h != null && m != null) _time = TimeOfDay(hour: h, minute: m);
    }
  }

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _date ?? now.add(const Duration(days: 1)),
      firstDate: DateTime(now.year, now.month, now.day),
      lastDate: now.add(const Duration(days: 180)),
    );
    if (picked != null) setState(() => _date = picked);
  }

  Future<void> _pickTime() async {
    final picked =
        await showTimePicker(context: context, initialTime: _time ?? TimeOfDay.now());
    if (picked != null) setState(() => _time = picked);
  }

  Future<void> _submit() async {
    final date = _date, time = _time;
    if (date == null || time == null) return;
    final hhmm =
        '${time.hour.toString().padLeft(2, '0')}:${time.minute.toString().padLeft(2, '0')}';

    setState(() => _busy = true);
    try {
      await ref.read(clientRepositoryProvider).submitReschedule(
            sessionInstanceId: widget.session.id,
            requestedDate: DateFormat('yyyy-MM-dd').format(date),
            requestedTime: hhmm,
            reason: _reason.text.trim(),
          );
      ref.invalidate(rescheduleRequestsProvider);
      ref.invalidate(clientSessionProvider(widget.session.id));
      ref.invalidate(clientSessionsProvider);
      if (mounted) Navigator.pop(context, true);
    } on ApiException catch (e) {
      _fail(e.message);
    } catch (_) {
      _fail('Could not submit request.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _fail(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  @override
  Widget build(BuildContext context) {
    final canSubmit = _date != null && _time != null && !_busy;
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Request reschedule',
              style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 4),
          Text(
            'Current: ${Fmt.dateTime(widget.session.scheduledDate, widget.session.scheduledTime)}',
            style: Theme.of(context)
                .textTheme
                .bodySmall
                ?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: _busy ? null : _pickDate,
                  icon: const Icon(Icons.calendar_today, size: 18),
                  label: Text(_date == null ? 'Pick date' : Fmt.dayMonth(_date)),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: _busy ? null : _pickTime,
                  icon: const Icon(Icons.schedule, size: 18),
                  label: Text(_time == null ? 'Pick time' : _time!.format(context)),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _reason,
            maxLength: 500,
            minLines: 2,
            maxLines: 4,
            decoration: const InputDecoration(
              labelText: 'Reason (optional)',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 8),
          FilledButton(
            onPressed: canSubmit ? _submit : null,
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
            child: _busy
                ? const SizedBox(
                    width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                : const Text('Submit request'),
          ),
        ],
      ),
    );
  }
}
