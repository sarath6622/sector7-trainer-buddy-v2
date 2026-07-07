import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/feedback/haptics.dart';
import '../../../core/widgets/skeleton.dart';
import '../../client/presentation/widgets/client_widgets.dart';
import '../data/exercise.dart';
import '../data/muscle_groups.dart';
import '../data/workout_repository.dart';

/// How the picker opens:
///   • [search]      — search the whole catalog (field focused, no filters).
///   • [byMuscle]    — pick curated muscle groups first, then browse them.
///   • [suggestions] — jump straight to the session's focus groups for recall.
enum ExercisePickerMode { search, byMuscle, suggestions }

/// Multi-select exercise picker. Returns the chosen exercises (empty/null when
/// dismissed). The caller is responsible for de-duping against what's already
/// in the workout.
Future<List<Exercise>?> showExercisePicker(
  BuildContext context, {
  ExercisePickerMode mode = ExercisePickerMode.search,
  Set<String> focusGroupIds = const {},
}) {
  return showModalBottomSheet<List<Exercise>>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => FractionallySizedBox(
      heightFactor: 0.92,
      child: _ExercisePicker(mode: mode, focusGroupIds: focusGroupIds),
    ),
  );
}

class _ExercisePicker extends ConsumerStatefulWidget {
  const _ExercisePicker({required this.mode, required this.focusGroupIds});
  final ExercisePickerMode mode;
  final Set<String> focusGroupIds;

  @override
  ConsumerState<_ExercisePicker> createState() => _ExercisePickerState();
}

class _ExercisePickerState extends ConsumerState<_ExercisePicker> {
  final _controller = TextEditingController();
  Timer? _debounce;

  String _query = '';
  String? _typeFilter; // null = all types
  late Set<String> _groups; // curated ids backing the list query
  late bool _showGroupGrid; // muscle-group step (byMuscle only)

  /// Multi-select cart, keyed by exerciseId so re-tapping toggles.
  final Map<String, Exercise> _selected = {};

  @override
  void initState() {
    super.initState();
    switch (widget.mode) {
      case ExercisePickerMode.search:
        _groups = {};
        _showGroupGrid = false;
      case ExercisePickerMode.byMuscle:
        _groups = {};
        _showGroupGrid = true;
      case ExercisePickerMode.suggestions:
        // Recall: use the session's inferred focus, falling back to everything.
        _groups = widget.focusGroupIds.isEmpty
            ? allCuratedGroupIds.toSet()
            : {...widget.focusGroupIds};
        _showGroupGrid = false;
    }
  }

  void _onQueryChanged(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 300), () {
      if (mounted) setState(() => _query = value);
    });
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _controller.dispose();
    super.dispose();
  }

  void _toggle(Exercise ex) {
    Haptics.select();
    setState(() {
      if (_selected.containsKey(ex.id)) {
        _selected.remove(ex.id);
      } else {
        _selected[ex.id] = ex;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: _showGroupGrid ? _buildGroupStep() : _buildListStep(),
    );
  }

  // ── Step 1 (By Muscle): pick curated groups ────────────────────────────────
  Widget _buildGroupStep() {
    final theme = Theme.of(context);
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
          child: Align(
            alignment: Alignment.centerLeft,
            child: Text('Choose muscle groups',
                style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
          ),
        ),
        Expanded(
          child: GridView.count(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
            crossAxisCount: 2,
            mainAxisSpacing: 10,
            crossAxisSpacing: 10,
            childAspectRatio: 2.5,
            children: [
              for (final g in curatedMuscleGroups)
                _GroupCard(
                  group: g,
                  selected: _groups.contains(g.id),
                  onTap: () {
                    Haptics.select();
                    setState(() {
                      _groups.contains(g.id) ? _groups.remove(g.id) : _groups.add(g.id);
                    });
                  },
                ),
            ],
          ),
        ),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
            child: FilledButton(
              onPressed: _groups.isEmpty ? null : () => setState(() => _showGroupGrid = false),
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
              child: Text(_groups.isEmpty ? 'Pick a group' : 'Continue (${_groups.length})'),
            ),
          ),
        ),
      ],
    );
  }

  // ── Step 2: search / browse the filtered catalog, multi-select ──────────────
  Widget _buildListStep() {
    final query = ExerciseQuery(
      search: _query,
      groupIds: _groups.toList(),
      type: _typeFilter,
    );
    final results = ref.watch(exerciseSearchProvider(query));

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
          child: TextField(
            controller: _controller,
            autofocus: widget.mode == ExercisePickerMode.search,
            onChanged: _onQueryChanged,
            decoration: InputDecoration(
              hintText: 'Search exercises…',
              prefixIcon: const Icon(Icons.search),
              isDense: true,
              suffixIcon: _query.isEmpty
                  ? null
                  : IconButton(
                      icon: const Icon(Icons.clear),
                      onPressed: () {
                        _controller.clear();
                        setState(() => _query = '');
                      },
                    ),
            ),
          ),
        ),
        _typeFilters(),
        if (_groups.isNotEmpty) _groupChips(),
        Expanded(
          child: results.when(
            loading: () => const SkeletonList(),
            error: (e, _) => ErrorRetry(
              message: e.toString(),
              onRetry: () => ref.invalidate(exerciseSearchProvider(query)),
            ),
            data: (list) {
              if (query.isEmpty) {
                return const EmptyState(
                  icon: Icons.search,
                  message: 'Search the exercise library,\nor filter by type above.',
                );
              }
              if (list.isEmpty) {
                return const EmptyState(icon: Icons.search_off, message: 'No exercises found.');
              }
              return ListView.builder(
                padding: const EdgeInsets.only(bottom: 8),
                itemCount: list.length,
                itemBuilder: (_, i) => _ExerciseRow(
                  exercise: list[i],
                  selected: _selected.containsKey(list[i].id),
                  onTap: () => _toggle(list[i]),
                ),
              );
            },
          ),
        ),
        _footer(),
      ],
    );
  }

  Widget _typeFilters() {
    const types = <(String?, String)>[
      (null, 'All'),
      ('WEIGHTED', 'Weighted'),
      ('BODYWEIGHT', 'Bodyweight'),
      ('DURATION', 'Duration'),
      ('CARDIO', 'Cardio'),
    ];
    return SizedBox(
      height: 44,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        children: [
          for (final (value, label) in types)
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: ChoiceChip(
                label: Text(label),
                selected: _typeFilter == value,
                onSelected: (_) => setState(() => _typeFilter = value),
              ),
            ),
        ],
      ),
    );
  }

  /// When browsing by muscle, show the active groups + a way back to re-pick.
  Widget _groupChips() {
    final labels =
        _groups.map((id) => curatedGroupById[id]?.label).whereType<String>().toList()..sort();
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
      child: Row(
        children: [
          Expanded(
            child: Text(
              labels.join(' · '),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context)
                  .textTheme
                  .bodySmall
                  ?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant),
            ),
          ),
          if (widget.mode == ExercisePickerMode.byMuscle)
            TextButton(
              onPressed: () => setState(() => _showGroupGrid = true),
              child: const Text('Change'),
            ),
        ],
      ),
    );
  }

  Widget _footer() {
    final n = _selected.length;
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
        child: FilledButton.icon(
          onPressed: n == 0
              ? null
              : () {
                  Haptics.primary();
                  Navigator.pop(context, _selected.values.toList());
                },
          icon: const Icon(Icons.add),
          label: Text(n == 0 ? 'Select exercises' : 'Add $n to workout'),
          style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
        ),
      ),
    );
  }
}

class _GroupCard extends StatelessWidget {
  const _GroupCard({required this.group, required this.selected, required this.onTap});
  final CuratedMuscleGroup group;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Material(
      color: selected ? scheme.primary.withValues(alpha: 0.14) : scheme.surfaceContainerHigh,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(
          color: selected ? scheme.primary : scheme.outlineVariant,
          width: selected ? 1.5 : 1,
        ),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14),
          child: Row(
            children: [
              Icon(group.icon, size: 22, color: selected ? scheme.primary : scheme.onSurfaceVariant),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  group.label,
                  style: TextStyle(
                    fontWeight: FontWeight.w600,
                    color: selected ? scheme.primary : scheme.onSurface,
                  ),
                ),
              ),
              if (selected) Icon(Icons.check_circle, size: 18, color: scheme.primary),
            ],
          ),
        ),
      ),
    );
  }
}

class _ExerciseRow extends StatelessWidget {
  const _ExerciseRow({required this.exercise, required this.selected, required this.onTap});
  final Exercise exercise;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return ListTile(
      onTap: onTap,
      leading: Icon(
        selected ? Icons.check_circle : Icons.add_circle_outline,
        color: selected ? scheme.primary : scheme.onSurfaceVariant,
      ),
      title: Text(exercise.name),
      subtitle: Text(
        [exercise.targetMuscleGroup, if (exercise.equipment != null) exercise.equipment!]
            .where((s) => s.isNotEmpty)
            .join(' · '),
      ),
      trailing: _TypeChip(type: exercise.exerciseType),
      selected: selected,
      selectedTileColor: scheme.primary.withValues(alpha: 0.06),
    );
  }
}

class _TypeChip extends StatelessWidget {
  const _TypeChip({required this.type});
  final String type;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        type.toLowerCase(),
        style: TextStyle(fontSize: 11, color: scheme.onSurfaceVariant),
      ),
    );
  }
}
