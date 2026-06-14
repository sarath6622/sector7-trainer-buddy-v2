import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/connectivity/connectivity_service.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_exception.dart';
import '../../auth/application/auth_controller.dart';
import 'exercise.dart';
import 'local/local_providers.dart';
import 'local/workout_local_store.dart';

/// Reads the exercise library with an offline fallback. The workout *write* path
/// no longer lives here — the logger saves through [WorkoutSyncService] (local
/// store first, scoped-diff POST when online).
class WorkoutRepository {
  WorkoutRepository(this._api, this._cache, this._connectivity);
  final ApiClient _api;
  final ExerciseCacheStore _cache;
  final ConnectivityService _connectivity;

  /// Search the exercise library for the picker. Online → hit the server and
  /// refresh the cache as a side effect; offline or on a network error → search
  /// the local cache so the picker still works on a flaky gym floor.
  Future<List<Exercise>> searchExercises({String? search, int pageSize = 30}) async {
    if (await _connectivity.isOnline()) {
      try {
        final list = await _fetchPage(search: search, pageSize: pageSize);
        unawaited(_cache.upsertExercises(list)); // never block the picker on a cache write
        return list;
      } on ApiException catch (e) {
        if (e.code != 'NETWORK_ERROR') rethrow;
        // transient network error — fall through to the cache
      }
    }
    return _cache.searchCached(search ?? '', limit: pageSize);
  }

  /// Pull the library into the cache so offline search has data. Paginates until
  /// a short page (the `{ data }` envelope drops the total). Best-effort — a
  /// failure just leaves the cache as-is.
  Future<void> prefetchExerciseLibrary({int pageSize = 100, int maxPages = 10}) async {
    if (!await _connectivity.isOnline()) return;
    try {
      final all = <Exercise>[];
      for (var page = 1; page <= maxPages; page++) {
        final batch = await _fetchPage(page: page, pageSize: pageSize);
        all.addAll(batch);
        if (batch.length < pageSize) break; // last page reached
      }
      await _cache.upsertExercises(all);
    } catch (_) {
      // ignore — prefetch is opportunistic
    }
  }

  Future<List<Exercise>> _fetchPage({String? search, int page = 1, int pageSize = 30}) async {
    final data = await _api.get('/exercises', query: {
      if (search != null && search.trim().isNotEmpty) 'search': search.trim(),
      'page': page,
      'pageSize': pageSize,
    }) as List<dynamic>;
    return data
        .whereType<Map>()
        .map((m) => Exercise.fromJson(Map<String, dynamic>.from(m)))
        .toList();
  }
}

final workoutRepositoryProvider = Provider<WorkoutRepository>(
  (ref) => WorkoutRepository(
    ref.watch(apiClientProvider),
    ref.watch(exerciseCacheStoreProvider),
    ref.watch(connectivityServiceProvider),
  ),
);

/// Exercise search results for the picker, keyed by query (empty = browse all).
final exerciseSearchProvider =
    FutureProvider.autoDispose.family<List<Exercise>, String>(
  (ref, query) => ref.watch(workoutRepositoryProvider).searchExercises(search: query),
);
