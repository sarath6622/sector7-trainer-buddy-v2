import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_exception.dart';
import '../../client/data/client_repository.dart';
import '../../client/presentation/widgets/client_widgets.dart';
import '../data/workout_repository.dart';
import '../domain/workout_draft.dart';
import 'exercise_picker_sheet.dart';

/// Shared workout logger (ADR-036). Reachable by the session's **client** (their
/// own PT session) or, later, the trainer. v1 is online-only — the offline
/// Drift queue is the next increment. Seeds an editable draft from the session
/// detail, then full-snapshot saves to `POST /api/sessions/[id]/workouts`.
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

  @override
  void initState() {
    super.initState();
    _seed();
  }

  Future<void> _seed() async {
    setState(() => _seedError = null);
    try {
      final detail =
          await ref.read(clientSessionProvider(widget.sessionId).future);
      setState(() {
        _drafts = detail.workoutLogs.map(DraftExercise.fromLog).toList();
      });
    } catch (e) {
      setState(() => _seedError = e);
    }
  }

  Future<void> _addExercise() async {
    final ex = await showExercisePicker(context);
    if (ex == null) return;
    setState(() => _drafts!.add(DraftExercise.fromExercise(ex)));
  }

  Future<void> _save() async {
    final drafts = _drafts!;
    // Drop exercises with no logged sets so we don't persist empty structure.
    final payload = drafts
        .where((d) => d.sets.any((s) =>
            (s.reps ?? 0) > 0 ||
            (s.weightKg ?? 0) > 0 ||
            (s.durationSec ?? 0) > 0 ||
            (s.stepsCount ?? 0) > 0))
        .toList();

    setState(() => _saving = true);
    try {
      await ref.read(workoutRepositoryProvider).saveWorkout(widget.sessionId, payload);
      ref.invalidate(clientSessionProvider(widget.sessionId));
      ref.invalidate(workoutHistoryProvider);
      if (mounted) {
        Navigator.pop(context, true);
      }
    } on ApiException catch (e) {
      _fail(e.message);
    } catch (_) {
      _fail('Could not save workout.');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _fail(String msg) {
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
              : drafts.isEmpty
                  ? const EmptyState(
                      icon: Icons.fitness_center,
                      message: 'No exercises yet.\nTap "Add exercise" to start logging.',
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
