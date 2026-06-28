import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/feedback/haptics.dart';
import '../../../../core/util/formatters.dart';
import '../../data/trainer_repository.dart';

const _kBook = Color(0xFF3B82F6); // blue-500

/// Bottom sheet to book a session for the trainer — a focused port of the web
/// "Schedule Sessions" modal: pick one of your active clients, a start time and
/// duration, and create a session on [date] via the bulk endpoint. Opened from
/// the Schedule FAB (no preset) or an available-slot "+" (preset time/duration).
class ScheduleBookingSheet extends ConsumerStatefulWidget {
  const ScheduleBookingSheet({
    super.key,
    required this.date,
    this.presetStartTime,
    this.presetDurationMin,
    required this.onBooked,
  });

  /// The day to book on (YYYY-MM-DD) — fixed; the date is chosen by the agenda.
  final String date;
  final String? presetStartTime;
  final int? presetDurationMin;

  /// Called after a successful create so the agenda can refresh.
  final VoidCallback onBooked;

  @override
  ConsumerState<ScheduleBookingSheet> createState() =>
      _ScheduleBookingSheetState();
}

class _ScheduleBookingSheetState extends ConsumerState<ScheduleBookingSheet> {
  String? _clientId;
  late TimeOfDay _start;
  late int _durationMin;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _durationMin = widget.presetDurationMin ?? 60;
    final preset = widget.presetStartTime;
    if (preset != null && preset.contains(':')) {
      final p = preset.split(':');
      _start = TimeOfDay(
          hour: int.tryParse(p[0]) ?? 7, minute: int.tryParse(p[1]) ?? 0);
    } else {
      _start = const TimeOfDay(hour: 7, minute: 0);
    }
  }

  String get _startHHMM =>
      '${_start.hour.toString().padLeft(2, '0')}:${_start.minute.toString().padLeft(2, '0')}';

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final clients = (ref.watch(trainerClientsProvider).valueOrNull ?? const [])
        .where((c) => !c.isReassigned)
        .toList();
    final dateLabel =
        Fmt.dayMonth(DateTime.tryParse('${widget.date}T00:00:00'));
    final endHHMM = Fmt.addMinutes(_startHHMM, _durationMin);

    return SafeArea(
      child: Padding(
        padding: EdgeInsets.only(
            bottom: MediaQuery.of(context).viewInsets.bottom),
        child: Container(
          margin: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            color: scheme.surfaceContainerHigh,
            borderRadius: BorderRadius.circular(20),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Header
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 16, 8, 8),
                child: Row(
                  children: [
                    Container(
                      width: 36,
                      height: 36,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: _kBook.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(11),
                      ),
                      child: const Icon(Icons.event_available,
                          size: 18, color: _kBook),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Schedule Session',
                              style: Theme.of(context)
                                  .textTheme
                                  .titleMedium
                                  ?.copyWith(fontWeight: FontWeight.w700)),
                          Text('$dateLabel · ${Fmt.time(_startHHMM)} – ${Fmt.time(endHHMM)}',
                              style: Theme.of(context)
                                  .textTheme
                                  .bodySmall
                                  ?.copyWith(color: scheme.onSurfaceVariant)),
                        ],
                      ),
                    ),
                    IconButton(
                      onPressed: () => Navigator.of(context).pop(),
                      icon: const Icon(Icons.close, size: 20),
                    ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Client
                    _Label('Client', scheme),
                    const SizedBox(height: 6),
                    if (clients.isEmpty)
                      Text('No active clients assigned to you yet.',
                          style: TextStyle(color: scheme.onSurfaceVariant))
                    else
                      DropdownButtonFormField<String>(
                        initialValue: _clientId,
                        isExpanded: true,
                        decoration: InputDecoration(
                          prefixIcon: const Icon(Icons.person_outline, size: 18),
                          hintText: 'Select client',
                          border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(12)),
                          contentPadding: const EdgeInsets.symmetric(
                              horizontal: 12, vertical: 4),
                        ),
                        items: [
                          for (final c in clients)
                            DropdownMenuItem(
                              value: c.clientProfileId,
                              child: Text(c.name,
                                  overflow: TextOverflow.ellipsis),
                            ),
                        ],
                        onChanged: (v) => setState(() {
                          _clientId = v;
                          _error = null;
                        }),
                      ),
                    const SizedBox(height: 16),

                    // Start time + duration
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              _Label('Start time', scheme),
                              const SizedBox(height: 6),
                              OutlinedButton.icon(
                                onPressed: _pickTime,
                                style: OutlinedButton.styleFrom(
                                  minimumSize: const Size.fromHeight(48),
                                  alignment: Alignment.centerLeft,
                                  side: BorderSide(
                                      color: scheme.outlineVariant
                                          .withValues(alpha: 0.5)),
                                  foregroundColor: scheme.onSurface,
                                ),
                                icon: const Icon(Icons.schedule, size: 18),
                                label: Text(Fmt.time(_startHHMM)),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),

                    _Label('Duration', scheme),
                    const SizedBox(height: 6),
                    Wrap(
                      spacing: 8,
                      children: [
                        for (final d in const [30, 45, 60, 90])
                          ChoiceChip(
                            label: Text(Fmt.durationMin(d)),
                            selected: _durationMin == d,
                            onSelected: (_) =>
                                setState(() => _durationMin = d),
                          ),
                      ],
                    ),

                    if (_error != null) ...[
                      const SizedBox(height: 12),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 8),
                        decoration: BoxDecoration(
                          color: scheme.error.withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Row(
                          children: [
                            Icon(Icons.error_outline,
                                size: 16, color: scheme.error),
                            const SizedBox(width: 8),
                            Expanded(
                                child: Text(_error!,
                                    style: TextStyle(color: scheme.error))),
                          ],
                        ),
                      ),
                    ],
                    const SizedBox(height: 16),
                    FilledButton(
                      onPressed:
                          _saving || _clientId == null ? null : _submit,
                      style: FilledButton.styleFrom(
                        backgroundColor: _kBook,
                        foregroundColor: Colors.white,
                        minimumSize: const Size.fromHeight(48),
                      ),
                      child: _saving
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(
                                  strokeWidth: 2, color: Colors.white),
                            )
                          : const Text('Schedule Session',
                              style: TextStyle(fontWeight: FontWeight.w700)),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _pickTime() async {
    final picked = await showTimePicker(context: context, initialTime: _start);
    if (picked != null) setState(() => _start = picked);
  }

  Future<void> _submit() async {
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await ref.read(trainerRepositoryProvider).bulkCreateSessions(
            clientProfileId: _clientId!,
            dates: [widget.date],
            startTime: _startHHMM,
            durationMin: _durationMin,
          );
      if (!mounted) return;
      Haptics.success();
      widget.onBooked();
      Navigator.of(context).pop();
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Session scheduled')));
    } catch (e) {
      if (!mounted) return;
      Haptics.error();
      final msg = e.toString();
      setState(() {
        _saving = false;
        _error = msg.startsWith('Exception: ') ? msg.substring(11) : msg;
      });
    }
  }
}

class _Label extends StatelessWidget {
  const _Label(this.text, this.scheme);
  final String text;
  final ColorScheme scheme;

  @override
  Widget build(BuildContext context) => Text(
        text,
        style: Theme.of(context).textTheme.labelMedium?.copyWith(
              color: scheme.onSurfaceVariant,
              fontWeight: FontWeight.w600,
            ),
      );
}
