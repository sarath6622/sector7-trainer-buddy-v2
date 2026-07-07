import 'package:flutter_test/flutter_test.dart';
import 'package:sector7_mobile/src/features/workout/data/exercise.dart';
import 'package:sector7_mobile/src/features/workout/data/local/workout_local_store.dart';

Exercise exercise(String id, String name) => Exercise(
      id: id,
      name: name,
      targetMuscleGroup: 'Chest',
      category: 'STRENGTH',
      exerciseType: 'WEIGHTED',
      secondaryMetric: 'KM',
    );

void main() {
  late InMemoryWorkoutStore cache;

  setUp(() => cache = InMemoryWorkoutStore());

  test('upsert is idempotent by id', () async {
    await cache.upsertExercises([exercise('e1', 'Bench Press')]);
    await cache.upsertExercises([exercise('e1', 'Bench Press (updated)')]);
    expect(await cache.cachedCount(), 1);
    final hit = await cache.searchCached('bench');
    expect(hit.single.name, 'Bench Press (updated)');
  });

  test('search is case-insensitive substring; empty query browses all', () async {
    await cache.upsertExercises([
      exercise('e1', 'Bench Press'),
      exercise('e2', 'Incline Bench'),
      exercise('e3', 'Squat'),
    ]);
    expect((await cache.searchCached('BENCH')).map((e) => e.id).toSet(),
        {'e1', 'e2'});
    expect((await cache.searchCached('')).length, 3);
    expect(await cache.searchCached('deadlift'), isEmpty);
  });

  test('search respects the limit', () async {
    await cache.upsertExercises([
      for (var i = 0; i < 50; i++) exercise('e$i', 'Curl variation $i'),
    ]);
    expect((await cache.searchCached('curl', limit: 10)), hasLength(10));
  });
}
