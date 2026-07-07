import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sector7_mobile/src/features/workout/data/exercise.dart';
import 'package:sector7_mobile/src/features/workout/data/workout_repository.dart';
import 'package:sector7_mobile/src/features/workout/presentation/exercise_picker_sheet.dart';

Exercise _ex(String id, String name) => Exercise(
      id: id,
      name: name,
      targetMuscleGroup: 'Chest',
      category: 'STRENGTH',
      exerciseType: 'WEIGHTED',
      secondaryMetric: 'KM',
    );

void main() {
  testWidgets('multi-select picker returns the chosen exercises', (tester) async {
    List<Exercise>? result;

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          // Suggestions mode opens straight to the list with all groups as the
          // focus, so the query is non-empty and hits this override.
          exerciseSearchProvider.overrideWith(
            (ref, query) async => [_ex('a', 'Bench Press'), _ex('b', 'Incline Press')],
          ),
        ],
        child: MaterialApp(
          home: Scaffold(
            body: Builder(
              builder: (context) => Center(
                child: ElevatedButton(
                  onPressed: () async {
                    result = await showExercisePicker(
                      context,
                      mode: ExercisePickerMode.suggestions,
                    );
                  },
                  child: const Text('open'),
                ),
              ),
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();

    expect(find.text('Bench Press'), findsOneWidget);
    expect(find.text('Incline Press'), findsOneWidget);

    await tester.tap(find.text('Bench Press'));
    await tester.pump();
    await tester.tap(find.text('Incline Press'));
    await tester.pump();

    expect(find.text('Add 2 to workout'), findsOneWidget);
    await tester.tap(find.text('Add 2 to workout'));
    await tester.pumpAndSettle();

    expect(result, isNotNull);
    expect(result!.map((e) => e.id).toList(), ['a', 'b']);
  });
}
