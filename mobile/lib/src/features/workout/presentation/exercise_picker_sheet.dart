import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../client/presentation/widgets/client_widgets.dart';
import '../data/exercise.dart';
import '../data/workout_repository.dart';

/// Search the exercise library and return the chosen [Exercise] (or null).
Future<Exercise?> showExercisePicker(BuildContext context) {
  return showModalBottomSheet<Exercise>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => const FractionallySizedBox(
      heightFactor: 0.85,
      child: _ExercisePicker(),
    ),
  );
}

class _ExercisePicker extends ConsumerStatefulWidget {
  const _ExercisePicker();

  @override
  ConsumerState<_ExercisePicker> createState() => _ExercisePickerState();
}

class _ExercisePickerState extends ConsumerState<_ExercisePicker> {
  final _controller = TextEditingController();
  String _query = '';
  Timer? _debounce;

  void _onChanged(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () {
      if (mounted) setState(() => _query = value);
    });
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final results = ref.watch(exerciseSearchProvider(_query));

    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
            child: TextField(
              controller: _controller,
              autofocus: true,
              onChanged: _onChanged,
              decoration: InputDecoration(
                hintText: 'Search exercises…',
                prefixIcon: const Icon(Icons.search),
                border: const OutlineInputBorder(),
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
          Expanded(
            child: results.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => ErrorRetry(
                message: e.toString(),
                onRetry: () => ref.invalidate(exerciseSearchProvider(_query)),
              ),
              data: (list) => list.isEmpty
                  ? const EmptyState(
                      icon: Icons.search_off,
                      message: 'No exercises found.',
                    )
                  : ListView.builder(
                      itemCount: list.length,
                      itemBuilder: (_, i) {
                        final ex = list[i];
                        return ListTile(
                          title: Text(ex.name),
                          subtitle: Text(
                            [ex.targetMuscleGroup, if (ex.equipment != null) ex.equipment!]
                                .where((s) => s.isNotEmpty)
                                .join(' · '),
                          ),
                          trailing: _TypeChip(type: ex.exerciseType),
                          onTap: () => Navigator.pop(context, ex),
                        );
                      },
                    ),
            ),
          ),
        ],
      ),
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
