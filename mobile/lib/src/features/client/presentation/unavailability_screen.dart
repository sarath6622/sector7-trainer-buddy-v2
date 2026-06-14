import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/util/formatters.dart';
import '../data/client_extras_models.dart';
import '../data/client_repository.dart';
import 'widgets/client_widgets.dart';

class UnavailabilityScreen extends ConsumerStatefulWidget {
  const UnavailabilityScreen({super.key});

  @override
  ConsumerState<UnavailabilityScreen> createState() => _UnavailabilityScreenState();
}

class _UnavailabilityScreenState extends ConsumerState<UnavailabilityScreen> {
  bool _busy = false;

  void _snack(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  Future<void> _addDate() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      firstDate: DateTime(now.year, now.month, now.day),
      lastDate: now.add(const Duration(days: 365)),
      helpText: 'Mark a day you are unavailable',
    );
    if (picked == null) return;
    final ymd = DateFormat('yyyy-MM-dd').format(picked);

    setState(() => _busy = true);
    try {
      await ref.read(clientRepositoryProvider).addUnavailability([ymd]);
      ref.invalidate(unavailabilityProvider);
      await ref.read(unavailabilityProvider.future);
      _snack('Marked ${Fmt.dayMonth(picked)} unavailable');
    } on ApiException catch (e) {
      _snack(e.code == 'CONFLICT' || e.statusCode == 409
          ? 'That date is already marked.'
          : 'Could not mark date: ${e.message}');
    } catch (e) {
      _snack('Could not mark date.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _remove(UnavailabilityDate d) async {
    setState(() => _busy = true);
    try {
      await ref.read(clientRepositoryProvider).removeUnavailability(d.id);
      ref.invalidate(unavailabilityProvider);
      await ref.read(unavailabilityProvider.future);
      _snack('Removed ${Fmt.dayMonth(d.date)}');
    } catch (e) {
      _snack('Could not remove date.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final dates = ref.watch(unavailabilityProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Availability'),
        bottom: _busy
            ? const PreferredSize(
                preferredSize: Size.fromHeight(2),
                child: LinearProgressIndicator(minHeight: 2),
              )
            : null,
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _busy ? null : _addDate,
        icon: const Icon(Icons.add),
        label: const Text('Mark a date'),
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(unavailabilityProvider.future),
        child: dates.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ListView(children: [
            const SizedBox(height: 120),
            ErrorRetry(message: e.toString(), onRetry: () => ref.invalidate(unavailabilityProvider)),
          ]),
          data: (list) => list.isEmpty
              ? ListView(children: const [
                  SizedBox(height: 100),
                  EmptyState(
                    icon: Icons.event_available,
                    message: 'No unavailable dates.\nTap "Mark a date" to let your trainer know.',
                  ),
                ])
              : ListView(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
                  children: [
                    const Padding(
                      padding: EdgeInsets.only(bottom: 8),
                      child: Text(
                        'Your trainer sees these and avoids booking you on them.',
                      ),
                    ),
                    for (final d in list)
                      Card(
                        margin: const EdgeInsets.only(bottom: 8),
                        child: ListTile(
                          leading: const Icon(Icons.event_busy),
                          title: Text(Fmt.dayMonthYear(d.date)),
                          subtitle: d.reason != null ? Text(d.reason!) : null,
                          trailing: IconButton(
                            icon: const Icon(Icons.delete_outline),
                            onPressed: _busy ? null : () => _remove(d),
                          ),
                        ),
                      ),
                  ],
                ),
        ),
      ),
    );
  }
}
