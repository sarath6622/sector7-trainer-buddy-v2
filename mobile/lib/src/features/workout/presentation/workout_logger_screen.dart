import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_exception.dart';
import '../../client/data/client_repository.dart';
import '../../client/presentation/widgets/client_widgets.dart';
import '../data/local/local_providers.dart';
import '../data/local/workout_local_store.dart';
import '../data/workout_sync_service.dart';
import '../domain/save_payload.dart';
import '../domain/workout_draft.dart';
import 'exercise_picker_sheet.dart';

/// Shared workout logger (ADR-036). Reachable by the session's **client** (their
/// own PT session) or, later, the trainer. Offline-first: edits save to the
/// local store immediately and a scoped diff (ADR-041) flushes to
/// `POST /api/sessions/[id]/workouts` when connectivity allows
/// ([WorkoutSyncService]). On open it restores an unsynced local draft if one
/// exists, otherwise seeds from the server session detail.
class WorkoutLoggerScreen extends ConsumerStatefulWidget {
  const WorkoutLoggerScreen({super.key, required this.sessionId});
  final String sessionId;

  @override
  ConsumerState<WorkoutLoggerScreen> createState() => _WorkoutLoggerScreenState();
}

class _WorkoutLoggerScreenState extends ConsumerState<WorkoutLoggerScreen> {
  List<DraftExercise>? _drafts;
  Object? _seedError;
  bool _saving = false;

  /// Last-synced snapshot the scoped diff is computed against. Seeded from the
  /// server (or a restored local draft) and advanced on a confirmed sync.
  List<Map<String, dynamic>> _baseline = const [];

  /// Outcome of the most recent save — drives the offline / queued banner.
  SyncOutcome? _lastOutcome;

  /// True when we re-opened into edits that hadn't reached the server yet.
  bool _restoredUnsynced = false;

  @override
  void initState() {
    super.initState();
    _seed();
  }

  Future<void> _seed() async {
    setState(() => _seedError = null);

    // An unsynced local draft is the freshest truth — restore it verbatim so a
    // server poll can't clobber edits made offline.
    final local =
        await ref.read(workoutDraftStoreProvider).getDraft(widget.sessionId);
    if (local != null && local.syncStatus != WorkoutSyncStatus.synced) {
      setState(() {
        _drafts = decodeDrafts(local.draftJson);
        _baseline = decodeSavePayload(local.baselineJson);
        _restoredUnsynced = true;
        _lastOutcome = local.syncStatus == WorkoutSyncStatus.failed
            ? SyncOutcome.failed
            : SyncOutcome.queuedOffline;
      });
      return;
    }

    try {
      final detail =
          await ref.read(clientSessionProvider(widget.sessionId).future);
      final drafts = detail.workoutLogs.map(DraftExercise.fromLog).toList();
      final baseline = buildSavePayload(drafts);

      // Anchor the local record to the server truth at open time. This keeps a
      // later save diffing against the *current* server state (not a stale
      // baseline from a prior session) and caches the session so it stays
      // editable if connectivity drops mid-edit. Only reached when there's no
      // unsynced local draft (those are restored above and never overwritten).
      final now = DateTime.now();
      await ref.read(workoutDraftStoreProvider).putDraft(WorkoutDraftRecord(
            sessionId: widget.sessionId,
            draftJson: encodeDrafts(drafts),
            baselineJson: jsonEncode(baseline),
            syncStatus: WorkoutSyncStatus.synced,
            updatedAt: now,
            lastSyncedAt: now,
          ));

      setState(() {
        _drafts = drafts;
        _baseline = baseline; // server state = our baseline
        _restoredUnsynced = false;
        _lastOutcome = null;
      });
    } catch (e) {
      // Offline with a previously-synced local copy → open it read-for-edit.
      if (local != null) {
        setState(() {
          _drafts = decodeDrafts(local.draftJson);
          _baseline = decodeSavePayload(local.baselineJson);
        });
      } else {
        setState(() => _seedError = e);
      }
    }
  }

  Future<void> _addExercise() async {
    final ex = await showExercisePicker(context);
    if (ex == null) return;
    setState(() => _drafts!.add(DraftExercise.fromExercise(ex)));
  }

  Future<void> _save() async {
    final drafts = _drafts!;
    setState(() => _saving = true);

    SyncOutcome outcome;
    try {
      // Write-local-first, then flush a scoped diff if online. Empty exercises
      // are dropped at the wire by buildSavePayload, so we hand over the full
      // working copy (structural rows survive a re-open).
      outcome = await ref.read(workoutSyncServiceProvider).saveLocalAndSync(
            widget.sessionId,
            drafts: drafts,
            baseline: _baseline,
          );
    } catch (e) {
      outcome = SyncOutcome.failed;
      _toast(e is ApiException ? e.message : 'Could not save workout.');
    } finally {
      if (mounted) setState(() => _saving = false);
    }

    if (!mounted) return;
    switch (outcome) {
      case SyncOutcome.synced:
        ref.invalidate(clientSessionProvider(widget.sessionId));
        ref.invalidate(workoutHistoryProvider);
        Navigator.pop(context, true);
      case SyncOutcome.queuedOffline:
        // Stay put — the session detail can't refetch offline. The banner +
        // toast tell the user it's safe on the device and will sync later.
        // NB: _baseline is NOT advanced — the stored record keeps the real
        // last-synced baseline so the eventual flush still sends the full diff.
        setState(() {
          _lastOutcome = outcome;
          _restoredUnsynced = true;
        });
        _toast('Saved on this device — will sync when back online.');
      case SyncOutcome.failed:
        setState(() => _lastOutcome = outcome);
        _toast('Saved on device, but the server rejected the sync.');
      case SyncOutcome.noop:
        break;
    }
  }

  void _toast(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  @override
  Widget build(BuildContext context) {
    final drafts = _drafts;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Log workout'),
        actions: [
          if (drafts != null)
            TextButton(
              onPressed: _saving ? null : _save,
              child: _saving
                  ? const SizedBox(
                      width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Text('Save'),
            ),
        ],
      ),
      floatingActionButton: drafts == null
          ? null
          : FloatingActionButton.extended(
              onPressed: _saving ? null : _addExercise,
              icon: const Icon(Icons.add),
              label: const Text('Add exercise'),
            ),
      body: _seedError != null
          ? ErrorRetry(message: _seedError.toString(), onRetry: _seed)
          : drafts == null
              ? const Center(child: CircularProgressIndicator())
              : Column(
                  children: [
                    ?_syncBanner,
                    Expanded(
                      child: drafts.isEmpty
                          ? const EmptyState(
                              icon: Icons.fitness_center,
                              message:
                                  'No exercises yet.\nTap "Add exercise" to start logging.',
                            )
                          : ListView.builder(
                              padding: const EdgeInsets.fromLTRB(12, 12, 12, 96),
                              itemCount: drafts.length,
                              itemBuilder: (_, i) => _ExerciseCard(
                                key: ValueKey('${drafts[i].exerciseId}-$i'),
                                draft: drafts[i],
                                onChanged: () => setState(() {}),
                                onRemove: () => setState(() => drafts.removeAt(i)),
                              ),
                            ),
                    ),
                  ],
                ),
    );
  }

  /// A thin status strip shown while the workout is held on-device — either
  /// restored from an earlier offline save, queued for sync, or rejected.
  Widget? get _syncBanner {
    if (!_restoredUnsynced && _lastOutcome != SyncOutcome.failed) return null;
    final failed = _lastOutcome == SyncOutcome.failed;
    final scheme = Theme.of(context).colorScheme;
    final color = failed ? scheme.errorContainer : scheme.secondaryContainer;
    final onColor = failed ? scheme.onErrorContainer : scheme.onSecondaryContainer;
    return Container(
      width: double.infinity,
      color: color,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
      child: Row(
        children: [
          Icon(failed ? Icons.sync_problem : Icons.cloud_off, size: 18, color: onColor),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              failed
                  ? 'Saved on device — last sync was rejected. It will retry.'
                  : 'Saved on device — waiting to sync.',
              style: TextStyle(color: onColor, fontSize: 13),
            ),
          ),
        ],
      ),
    );
  }
}

class _ExerciseCard extends StatelessWidget {
  const _ExerciseCard({
    super.key,
    required this.draft,
    required this.onChanged,
    required this.onRemove,
  });

  final DraftExercise draft;
  final VoidCallback onChanged;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 10, 8, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(draft.name,
                          style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                      if (draft.muscleGroup != null)
                        Text(draft.muscleGroup!,
                            style: Theme.of(context)
                                .textTheme
                                .bodySmall
                                ?.copyWith(color: scheme.onSurfaceVariant)),
                    ],
                  ),
                ),
                IconButton(
                  tooltip: draft.isCompleted ? 'Completed' : 'Mark complete',
                  icon: Icon(
                    draft.isCompleted ? Icons.check_circle : Icons.check_circle_outline,
                    color: draft.isCompleted ? Colors.green.shade400 : scheme.onSurfaceVariant,
                  ),
                  onPressed: () {
                    draft.isCompleted = !draft.isCompleted;
                    onChanged();
                  },
                ),
                IconButton(
                  tooltip: 'Remove exercise',
                  icon: const Icon(Icons.close),
                  onPressed: onRemove,
                ),
              ],
            ),
            const SizedBox(height: 4),
            for (var i = 0; i < draft.sets.length; i++)
              _SetRow(
                key: ValueKey('set-${draft.exerciseId}-$i-${draft.sets[i].setNumber}'),
                index: i,
                set: draft.sets[i],
                isCardio: draft.isCardio,
                tracksSteps: draft.tracksSteps,
                onRemove: () {
                  draft.removeSet(i);
                  onChanged();
                },
              ),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                onPressed: () {
                  draft.addSet();
                  onChanged();
                },
                icon: const Icon(Icons.add, size: 18),
                label: const Text('Add set'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SetRow extends StatelessWidget {
  const _SetRow({
    super.key,
    required this.index,
    required this.set,
    required this.isCardio,
    required this.tracksSteps,
    required this.onRemove,
  });

  final int index;
  final DraftSet set;
  final bool isCardio;
  final bool tracksSteps;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          SizedBox(
            width: 26,
            child: Text('${index + 1}',
                style: TextStyle(color: scheme.onSurfaceVariant, fontWeight: FontWeight.w600)),
          ),
          if (isCardio) ...[
            Expanded(
              child: _NumField(
                label: 'Duration (s)',
                initial: set.durationSec?.toString(),
                onChanged: (v) => set.durationSec = int.tryParse(v),
              ),
            ),
            if (tracksSteps) ...[
              const SizedBox(width: 8),
              Expanded(
                child: _NumField(
                  label: 'Steps',
                  initial: set.stepsCount?.toString(),
                  onChanged: (v) => set.stepsCount = int.tryParse(v),
                ),
              ),
            ],
          ] else ...[
            Expanded(
              child: _NumField(
                label: 'Reps',
                initial: set.reps?.toString(),
                onChanged: (v) => set.reps = int.tryParse(v),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _NumField(
                label: 'Weight (kg)',
                allowDecimal: true,
                initial: set.weightKg == null
                    ? null
                    : (set.weightKg! % 1 == 0
                        ? set.weightKg!.toInt().toString()
                        : set.weightKg!.toString()),
                onChanged: (v) => set.weightKg = double.tryParse(v),
              ),
            ),
          ],
          IconButton(
            visualDensity: VisualDensity.compact,
            icon: const Icon(Icons.remove_circle_outline, size: 20),
            onPressed: onRemove,
          ),
        ],
      ),
    );
  }
}

/// Uncontrolled numeric field — owns its own text (no rebuild on keystroke) and
/// writes parsed values straight to the draft model.
class _NumField extends StatelessWidget {
  const _NumField({
    required this.label,
    required this.initial,
    required this.onChanged,
    this.allowDecimal = false,
  });

  final String label;
  final String? initial;
  final ValueChanged<String> onChanged;
  final bool allowDecimal;

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      initialValue: initial,
      keyboardType: TextInputType.numberWithOptions(decimal: allowDecimal),
      inputFormatters: [
        FilteringTextInputFormatter.allow(
          allowDecimal ? RegExp(r'[0-9.]') : RegExp(r'[0-9]'),
        ),
      ],
      decoration: InputDecoration(
        labelText: label,
        isDense: true,
        border: const OutlineInputBorder(),
      ),
      onChanged: onChanged,
    );
  }
}
