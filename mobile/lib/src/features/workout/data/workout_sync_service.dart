/// Offline sync engine for the workout logger.
///
/// Write path: the logger saves the draft to the local store first (instant,
/// works with no network) and this service flushes it to
/// `POST /api/sessions/[id]/workouts` when connectivity allows. The flush sends
/// a **scoped diff** (ADR-041), computed against the last-synced baseline held
/// in the draft record — not a full snapshot — so a stale save can't clobber a
/// peer's concurrent edit. A re-sent diff is net-zero (sets upsert by number,
/// deletes are explicit), so retries after a dropped response are idempotent;
/// no server-side `localId` dedup is needed.
///
/// Triggers: a successful save (foreground), a connectivity transition to
/// online, and app start / resume (callers invoke [flushPending]). True
/// OS-background sync (`workmanager`) is deferred — [flushPending] is the seam a
/// headless task would call.
library;

import 'dart:async';
import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/connectivity/connectivity_service.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_exception.dart';
import '../../auth/application/auth_controller.dart';
import '../domain/save_payload.dart';
import '../domain/workout_draft.dart';
import 'local/local_providers.dart';
import 'local/workout_local_store.dart';

/// Result of a save / flush attempt, for the UI to message.
enum SyncOutcome {
  /// Confirmed by the server.
  synced,

  /// Held locally — offline or the server was unreachable. Will retry.
  queuedOffline,

  /// The server rejected it (validation / permission / unsupported state).
  failed,

  /// Nothing to do (no draft, or already synced).
  noop,
}

class WorkoutSyncService {
  WorkoutSyncService({
    required WorkoutDraftStore store,
    required ApiClient api,
    required ConnectivityService connectivity,
  })  : _store = store,
        _api = api,
        _connectivity = connectivity;

  final WorkoutDraftStore _store;
  final ApiClient _api;
  final ConnectivityService _connectivity;

  StreamSubscription<bool>? _sub;
  bool _flushing = false;

  /// Begin flushing pending drafts whenever a connection returns. Idempotent.
  void start() {
    _sub ??= _connectivity.onlineChanges.listen((online) {
      if (online) unawaited(flushPending());
    });
  }

  void dispose() {
    _sub?.cancel();
    _sub = null;
  }

  /// Persist [drafts] for the session (write-local-first) then attempt a sync.
  ///
  /// [baseline] is the screen's seed snapshot, used only to initialize a
  /// brand-new record; an existing record keeps its own baseline (advanced only
  /// by a confirmed sync), so a background flush that already moved it forward
  /// isn't regressed by a later save.
  Future<SyncOutcome> saveLocalAndSync(
    String sessionId, {
    required List<DraftExercise> drafts,
    required List<Map<String, dynamic>> baseline,
  }) async {
    final existing = await _store.getDraft(sessionId);
    await _store.putDraft(
      WorkoutDraftRecord(
        sessionId: sessionId,
        draftJson: encodeDrafts(drafts),
        baselineJson: existing?.baselineJson ?? jsonEncode(baseline),
        syncStatus: WorkoutSyncStatus.pending,
        updatedAt: DateTime.now(),
        lastSyncedAt: existing?.lastSyncedAt,
      ),
    );

    if (!await _connectivity.isOnline()) return SyncOutcome.queuedOffline;
    return flushSession(sessionId);
  }

  /// Flush every draft awaiting sync. Re-entrancy guarded so a connectivity
  /// bounce mid-flush doesn't double-POST.
  Future<void> flushPending() async {
    if (_flushing) return;
    _flushing = true;
    try {
      if (!await _connectivity.isOnline()) return;
      final pending = await _store.unsyncedDrafts();
      for (final rec in pending) {
        await flushSession(rec.sessionId);
      }
    } finally {
      _flushing = false;
    }
  }

  /// Sync one session's draft. Reconstructs the diff from the stored record so
  /// the foreground and background paths share one implementation.
  Future<SyncOutcome> flushSession(String sessionId) async {
    final rec = await _store.getDraft(sessionId);
    if (rec == null) return SyncOutcome.noop;
    if (rec.syncStatus == WorkoutSyncStatus.synced) return SyncOutcome.synced;

    final baseline = decodeSavePayload(rec.baselineJson);
    final current = buildSavePayload(decodeDrafts(rec.draftJson));
    final diff = diffExercises(baseline, current);

    // Net-zero: the server already has this exact state. Settle without a POST.
    if (diff.isEmpty) return _markSynced(rec, current);

    // The route requires `exercises.min(1)`, so "delete every exercise" can't
    // be expressed as a scoped write. Rare; surfaced rather than retried.
    if (current.isEmpty) {
      await _store.putDraft(rec.copyWith(
        syncStatus: WorkoutSyncStatus.failed,
        lastError: "Removing every exercise can't be synced yet.",
      ));
      return SyncOutcome.failed;
    }

    try {
      await _api.post('/sessions/$sessionId/workouts', body: {
        'exercises': current,
        'dirtyExerciseIds': diff.dirtyExerciseIds,
        'removedExerciseIds': diff.removedExerciseIds,
        'removedSetsByExerciseId': diff.removedSetsByExerciseId,
      });
    } on ApiException catch (e) {
      if (e.code == 'NETWORK_ERROR') {
        // Server unreachable — keep it queued for the next attempt.
        await _store.putDraft(rec.copyWith(
          syncStatus: WorkoutSyncStatus.pending,
          lastError: e.message,
        ));
        return SyncOutcome.queuedOffline;
      }
      // A real rejection. Don't spin on a payload the server won't accept.
      await _store.putDraft(rec.copyWith(
        syncStatus: WorkoutSyncStatus.failed,
        lastError: e.message,
      ));
      return SyncOutcome.failed;
    }

    return _markSynced(rec, current);
  }

  Future<SyncOutcome> _markSynced(
    WorkoutDraftRecord rec,
    List<Map<String, dynamic>> current,
  ) async {
    await _store.putDraft(rec.copyWith(
      baselineJson: jsonEncode(current),
      syncStatus: WorkoutSyncStatus.synced,
      lastSyncedAt: DateTime.now(),
      clearError: true,
    ));
    return SyncOutcome.synced;
  }
}

final workoutSyncServiceProvider = Provider<WorkoutSyncService>((ref) {
  final svc = WorkoutSyncService(
    store: ref.watch(workoutDraftStoreProvider),
    api: ref.watch(apiClientProvider),
    connectivity: ref.watch(connectivityServiceProvider),
  );
  ref.onDispose(svc.dispose);
  return svc;
});
