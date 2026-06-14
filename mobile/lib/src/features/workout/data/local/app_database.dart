/// Drift-backed local store for the offline workout logger.
///
/// One SQLite file holds the per-session workout drafts (write-local-first) and
/// the cached exercise library (so the picker works offline). [AppDatabase]
/// implements the [WorkoutDraftStore] + [ExerciseCacheStore] contracts directly,
/// so the sync engine and logger never touch Drift types.
///
/// Codegen: `dart run build_runner build --force-jit` regenerates
/// `app_database.g.dart`. The `--force-jit` is required — `sqlite3` (a drift
/// dependency) ships a native-asset `hook/build.dart`, and build_runner's
/// default AOT entrypoint compile fails with "dart compile does not support
/// build hooks". JIT mode skips that step.
library;

import 'dart:io';

import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import '../exercise.dart';
import 'workout_local_store.dart';

part 'app_database.g.dart';

/// One workout draft per session. PK = sessionId (a session is edited in one
/// place at a time on this device). See [WorkoutDraftRecord] for field meaning.
class WorkoutDraftRows extends Table {
  TextColumn get sessionId => text()();
  TextColumn get draftJson => text()();
  TextColumn get baselineJson => text()();
  TextColumn get syncStatus => text()();
  DateTimeColumn get updatedAt => dateTime()();
  DateTimeColumn get lastSyncedAt => dateTime().nullable()();
  TextColumn get lastError => text().nullable()();

  @override
  Set<Column> get primaryKey => {sessionId};
}

/// Cached exercise-library rows for offline search.
class CachedExerciseRows extends Table {
  TextColumn get id => text()();
  TextColumn get name => text()();
  TextColumn get targetMuscleGroup => text().withDefault(const Constant(''))();
  TextColumn get category => text().withDefault(const Constant(''))();
  TextColumn get exerciseType =>
      text().withDefault(const Constant('WEIGHTED'))();
  TextColumn get secondaryMetric => text().withDefault(const Constant('KM'))();
  TextColumn get equipment => text().nullable()();
  DateTimeColumn get updatedAt => dateTime()();

  @override
  Set<Column> get primaryKey => {id};
}

@DriftDatabase(tables: [WorkoutDraftRows, CachedExerciseRows])
class AppDatabase extends _$AppDatabase
    implements WorkoutDraftStore, ExerciseCacheStore {
  AppDatabase([QueryExecutor? executor]) : super(executor ?? _openConnection());

  @override
  int get schemaVersion => 1;

  // ── WorkoutDraftStore ──────────────────────────────────────────────────

  @override
  Future<WorkoutDraftRecord?> getDraft(String sessionId) async {
    final row = await (select(workoutDraftRows)
          ..where((t) => t.sessionId.equals(sessionId)))
        .getSingleOrNull();
    return row == null ? null : _toRecord(row);
  }

  @override
  Future<void> putDraft(WorkoutDraftRecord rec) {
    return into(workoutDraftRows).insertOnConflictUpdate(
      WorkoutDraftRowsCompanion.insert(
        sessionId: rec.sessionId,
        draftJson: rec.draftJson,
        baselineJson: rec.baselineJson,
        syncStatus: rec.syncStatus.name,
        updatedAt: rec.updatedAt,
        lastSyncedAt: Value(rec.lastSyncedAt),
        lastError: Value(rec.lastError),
      ),
    );
  }

  @override
  Future<List<WorkoutDraftRecord>> unsyncedDrafts() async {
    final rows = await (select(workoutDraftRows)
          ..where((t) => t.syncStatus.equals(WorkoutSyncStatus.synced.name).not()))
        .get();
    return rows.map(_toRecord).toList();
  }

  @override
  Future<void> deleteDraft(String sessionId) {
    return (delete(workoutDraftRows)
          ..where((t) => t.sessionId.equals(sessionId)))
        .go();
  }

  // ── ExerciseCacheStore ─────────────────────────────────────────────────

  @override
  Future<void> upsertExercises(List<Exercise> exercises) async {
    if (exercises.isEmpty) return;
    final now = DateTime.now();
    await batch((b) {
      b.insertAllOnConflictUpdate(cachedExerciseRows, [
        for (final e in exercises)
          CachedExerciseRowsCompanion.insert(
            id: e.id,
            name: e.name,
            targetMuscleGroup: Value(e.targetMuscleGroup),
            category: Value(e.category),
            exerciseType: Value(e.exerciseType),
            secondaryMetric: Value(e.secondaryMetric),
            equipment: Value(e.equipment),
            updatedAt: now,
          ),
      ]);
    });
  }

  @override
  Future<List<Exercise>> searchCached(String query, {int limit = 30}) async {
    final q = query.trim().toLowerCase();
    final stmt = select(cachedExerciseRows);
    if (q.isNotEmpty) {
      stmt.where((t) => t.name.lower().like('%$q%'));
    }
    stmt
      ..orderBy([(t) => OrderingTerm(expression: t.name.lower())])
      ..limit(limit);
    final rows = await stmt.get();
    return rows.map(_toExercise).toList();
  }

  @override
  Future<int> cachedCount() async {
    final c = cachedExerciseRows.id.count();
    final row = await (selectOnly(cachedExerciseRows)..addColumns([c]))
        .getSingle();
    return row.read(c) ?? 0;
  }

  // ── mappers ────────────────────────────────────────────────────────────

  WorkoutDraftRecord _toRecord(WorkoutDraftRow r) => WorkoutDraftRecord(
        sessionId: r.sessionId,
        draftJson: r.draftJson,
        baselineJson: r.baselineJson,
        syncStatus: WorkoutSyncStatus.values.byName(r.syncStatus),
        updatedAt: r.updatedAt,
        lastSyncedAt: r.lastSyncedAt,
        lastError: r.lastError,
      );

  Exercise _toExercise(CachedExerciseRow r) => Exercise(
        id: r.id,
        name: r.name,
        targetMuscleGroup: r.targetMuscleGroup,
        category: r.category,
        exerciseType: r.exerciseType,
        secondaryMetric: r.secondaryMetric,
        equipment: r.equipment,
      );
}

LazyDatabase _openConnection() {
  return LazyDatabase(() async {
    final dir = await getApplicationDocumentsDirectory();
    final file = File(p.join(dir.path, 'sector7_offline.sqlite'));
    return NativeDatabase.createInBackground(file);
  });
}
