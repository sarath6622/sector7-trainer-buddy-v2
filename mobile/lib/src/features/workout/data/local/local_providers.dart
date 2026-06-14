/// Riverpod wiring for the local store. The single [AppDatabase] instance is
/// exposed behind the two narrow store interfaces so consumers depend on the
/// contracts, not Drift.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app_database.dart';
import 'workout_local_store.dart';

final appDatabaseProvider = Provider<AppDatabase>((ref) {
  final db = AppDatabase();
  ref.onDispose(db.close);
  return db;
});

final workoutDraftStoreProvider = Provider<WorkoutDraftStore>(
  (ref) => ref.watch(appDatabaseProvider),
);

final exerciseCacheStoreProvider = Provider<ExerciseCacheStore>(
  (ref) => ref.watch(appDatabaseProvider),
);
