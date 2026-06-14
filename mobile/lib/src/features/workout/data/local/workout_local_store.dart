/// Local persistence contracts for the offline workout logger.
///
/// The sync engine and the logger depend only on these interfaces, so the
/// diff/flush logic is unit-testable with [InMemoryWorkoutStore] (no native
/// sqlite). The real app binds them to the Drift-backed implementation in
/// `app_database.dart`.
library;

import '../exercise.dart';

/// Lifecycle of a session's locally-held draft.
enum WorkoutSyncStatus {
  /// Local draft matches what the server last accepted — nothing to flush.
  synced,

  /// Saved locally, not yet confirmed by the server (offline, or in flight).
  pending,

  /// The server rejected the write (validation / permission / unsupported
  /// state). Won't auto-retry on its own; needs a fresh edit or manual retry.
  failed,
}

/// One session's offline state.
///
/// [draftJson] is the loss-less editable snapshot (full draft, with names) the
/// UI re-opens into. [baselineJson] is the normalized save payload last
/// confirmed by the server — the diff baseline. They diverge while the user
/// edits offline and reconverge on a successful sync.
class WorkoutDraftRecord {
  const WorkoutDraftRecord({
    required this.sessionId,
    required this.draftJson,
    required this.baselineJson,
    required this.syncStatus,
    required this.updatedAt,
    this.lastSyncedAt,
    this.lastError,
  });

  final String sessionId;
  final String draftJson;
  final String baselineJson;
  final WorkoutSyncStatus syncStatus;
  final DateTime updatedAt;
  final DateTime? lastSyncedAt;
  final String? lastError;

  WorkoutDraftRecord copyWith({
    String? draftJson,
    String? baselineJson,
    WorkoutSyncStatus? syncStatus,
    DateTime? updatedAt,
    DateTime? lastSyncedAt,
    String? lastError,
    bool clearError = false,
  }) {
    return WorkoutDraftRecord(
      sessionId: sessionId,
      draftJson: draftJson ?? this.draftJson,
      baselineJson: baselineJson ?? this.baselineJson,
      syncStatus: syncStatus ?? this.syncStatus,
      updatedAt: updatedAt ?? this.updatedAt,
      lastSyncedAt: lastSyncedAt ?? this.lastSyncedAt,
      lastError: clearError ? null : (lastError ?? this.lastError),
    );
  }
}

/// Stores one draft per session and surfaces the ones awaiting sync.
abstract class WorkoutDraftStore {
  Future<WorkoutDraftRecord?> getDraft(String sessionId);
  Future<void> putDraft(WorkoutDraftRecord record);

  /// Drafts the sync engine should attempt: `pending` (and `failed`, so a
  /// connectivity bounce gives a rejected write one more shot).
  Future<List<WorkoutDraftRecord>> unsyncedDrafts();

  Future<void> deleteDraft(String sessionId);
}

/// Caches the exercise library so the picker works offline.
abstract class ExerciseCacheStore {
  Future<void> upsertExercises(List<Exercise> exercises);

  /// Substring match on name (case-insensitive). Empty query = browse all.
  Future<List<Exercise>> searchCached(String query, {int limit = 30});

  Future<int> cachedCount();
}

/// In-memory store for tests and as a no-persistence fallback. Behaviour
/// mirrors the Drift implementation; it just doesn't survive a process restart.
class InMemoryWorkoutStore implements WorkoutDraftStore, ExerciseCacheStore {
  final Map<String, WorkoutDraftRecord> _drafts = {};
  final Map<String, Exercise> _exercises = {};

  @override
  Future<WorkoutDraftRecord?> getDraft(String sessionId) async =>
      _drafts[sessionId];

  @override
  Future<void> putDraft(WorkoutDraftRecord record) async {
    _drafts[record.sessionId] = record;
  }

  @override
  Future<List<WorkoutDraftRecord>> unsyncedDrafts() async => _drafts.values
      .where((r) => r.syncStatus != WorkoutSyncStatus.synced)
      .toList();

  @override
  Future<void> deleteDraft(String sessionId) async {
    _drafts.remove(sessionId);
  }

  @override
  Future<void> upsertExercises(List<Exercise> exercises) async {
    for (final e in exercises) {
      _exercises[e.id] = e;
    }
  }

  @override
  Future<List<Exercise>> searchCached(String query, {int limit = 30}) async {
    final q = query.trim().toLowerCase();
    final matches = _exercises.values
        .where((e) => q.isEmpty || e.name.toLowerCase().contains(q))
        .toList()
      ..sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));
    return matches.take(limit).toList();
  }

  @override
  Future<int> cachedCount() async => _exercises.length;
}
