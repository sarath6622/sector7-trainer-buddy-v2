import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/feedback/haptics.dart';
import '../../../../core/theme/app_theme.dart';
import '../../data/client_repository.dart';
import '../../data/progress_models.dart';
import '../../domain/progress_metrics.dart';
import '../../domain/progress_series.dart';

/// Open the unified "log measurement" sheet. Returns true when an entry was
/// saved (the caller should invalidate `progressEntriesProvider`).
Future<bool> showLogMeasurementSheet(
  BuildContext context, {
  required List<ProgressEntry> entries,
  MetricDef? focus,
}) async {
  final saved = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    builder: (_) => _LogMeasurementSheet(entries: entries, focus: focus),
  );
  return saved ?? false;
}

class _LogMeasurementSheet extends ConsumerStatefulWidget {
  const _LogMeasurementSheet({required this.entries, this.focus});
  final List<ProgressEntry> entries;

  /// When set, only this metric's fields are shown (single-metric log from a
  /// detail screen). Otherwise every tracked metric is offered.
  final MetricDef? focus;

  @override
  ConsumerState<_LogMeasurementSheet> createState() =>
      _LogMeasurementSheetState();
}

class _LogMeasurementSheetState extends ConsumerState<_LogMeasurementSheet> {
  final _controllers = <String, TextEditingController>{};
  late final List<MetricDef> _metrics = widget.focus != null
      ? [widget.focus!]
      : [for (final m in kProgressMetrics) if (m.loggable) m];
  bool _saving = false;
  bool _saved = false;

  @override
  void initState() {
    super.initState();
    for (final m in _metrics) {
      for (final f in m.fields) {
        _controllers[f.key] = TextEditingController();
      }
    }
  }

  @override
  void dispose() {
    for (final c in _controllers.values) {
      c.dispose();
    }
    super.dispose();
  }

  bool get _hasInput =>
      _controllers.values.any((c) => double.tryParse(c.text.trim()) != null);

  /// Last logged value for a field key (shown as a ghost hint).
  double? _lastFor(MetricDef m, String fieldKey) {
    final read = fieldKey == m.fields.first.key ? m.read : m.readPaired;
    if (read == null) return null;
    final s = seriesFor(widget.entries, read);
    return s.isEmpty ? null : s.last.value;
  }

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
      Haptics.success();
      if (mounted) setState(() => _saved = true);
      await Future<void>.delayed(const Duration(milliseconds: 800));
      if (mounted) Navigator.of(context).pop(true);
    } catch (_) {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final colors = AppColors.of(context);
    final single = widget.focus != null;

    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SafeArea(
        top: false,
        child: ConstrainedBox(
          constraints: BoxConstraints(
            maxHeight: MediaQuery.sizeOf(context).height * 0.82,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 12),
              Center(
                child: Container(
                  width: 36,
                  height: 4,
                  decoration: BoxDecoration(
                    color: scheme.outlineVariant,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 4),
                child: Row(children: [
                  Icon(single ? widget.focus!.icon : Icons.add_chart,
                      size: 20, color: scheme.primary),
                  const SizedBox(width: 8),
                  Text(single ? 'Log ${widget.focus!.label}' : 'Log measurement',
                      style: const TextStyle(
                          fontSize: 17, fontWeight: FontWeight.w800)),
                  const Spacer(),
                  Text(_today(),
                      style: TextStyle(
                          fontSize: 12, color: scheme.onSurfaceVariant)),
                ]),
              ),
              if (!single)
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 0, 20, 0),
                  child: Text(
                    'Enter whatever you measured today — leave the rest blank.',
                    style:
                        TextStyle(fontSize: 12, color: scheme.onSurfaceVariant),
                  ),
                ),
              const SizedBox(height: 8),
              if (_saved)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 36),
                  child: Column(children: [
                    Icon(Icons.check_circle, size: 44, color: colors.success),
                    const SizedBox(height: 10),
                    Text('Saved!',
                        style: TextStyle(
                            color: colors.success,
                            fontWeight: FontWeight.w700,
                            fontSize: 16)),
                  ]),
                )
              else ...[
                Flexible(
                  child: ListView(
                    shrinkWrap: true,
                    padding: const EdgeInsets.fromLTRB(20, 8, 20, 8),
                    children: [
                      for (final m in _metrics) _metricRow(context, m),
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
                  child: FilledButton(
                    onPressed: (_saving || !_hasInput) ? null : _save,
                    child: Text(_saving ? 'Saving…' : 'Save entry'),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _metricRow(BuildContext context, MetricDef m) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(
                color: m.color.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(10)),
            child: Icon(m.icon, size: 16, color: m.color),
          ),
          const SizedBox(width: 12),
          SizedBox(
            width: 64,
            child: Text(m.label,
                style: const TextStyle(
                    fontSize: 13, fontWeight: FontWeight.w600)),
          ),
          for (final f in m.fields) ...[
            const SizedBox(width: 8),
            Expanded(child: _field(scheme, m, f)),
          ],
        ],
      ),
    );
  }

  Widget _field(
    ColorScheme scheme,
    MetricDef m,
    ({String key, String hint}) f,
  ) {
    final last = _lastFor(m, f.key);
    final hint = last != null
        ? 'last ${_trim(last)}'
        : (m.paired ? f.hint : m.unit);
    return TextField(
      controller: _controllers[f.key],
      keyboardType: const TextInputType.numberWithOptions(decimal: true),
      inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
      decoration: InputDecoration(
        hintText: hint,
        suffixText: m.unit,
        isDense: true,
      ),
      onChanged: (_) => setState(() {}),
    );
  }

  String _today() {
    final n = DateTime.now();
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', //
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];
    return '${n.day} ${months[n.month - 1]}';
  }

  String _trim(double v) =>
      v == v.roundToDouble() ? v.toInt().toString() : v.toStringAsFixed(1);
}
