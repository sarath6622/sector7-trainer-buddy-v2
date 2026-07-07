import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/connectivity/connectivity_service.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_exception.dart';
import '../../auth/application/auth_controller.dart';
import '../../client/data/progress_models.dart';
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
  ///
  /// [muscleGroups] takes curated group ids (e.g. `['chest', 'back']`) — the
  /// server expands them to catalog `targetMuscleGroup` values. [exerciseType]
  /// narrows to WEIGHTED / BODYWEIGHT / DURATION / CARDIO. The offline cache
  /// fallback only honors the text query (group/type browsing is online-only).
  Future<List<Exercise>> searchExercises({
    String? search,
    List<String>? muscleGroups,
    String? exerciseType,
    int pageSize = 30,
  }) async {
    if (await _connectivity.isOnline()) {
      try {
        final list = await _fetchPage(
          search: search,
          muscleGroups: muscleGroups,
          exerciseType: exerciseType,
          pageSize: pageSize,
        );
        unawaited(_cache.upsertExercises(list)); // never block the picker on a cache write
        return list;
      } on ApiException catch (e) {
        if (e.code != 'NETWORK_ERROR') rethrow;
        // transient network error — fall through to the cache
      }
    }
    return _cache.searchCached(search ?? '', limit: pageSize);
  }

  /// The client's most recent prior set for each requested exercise, keyed by
  /// exerciseId — powers the logger's "last time" placeholder hints.
  /// [excludeSessionId] keeps the in-progress session's own partial logs from
  /// shadowing the real progression reference. Best-effort: a network error
  /// yields an empty map so the logger simply renders without hints.
  Future<Map<String, List<LastSetSnapshot>>> lastSetsByExercise({
    required String clientProfileId,
    required List<String> exerciseIds,
    String? excludeSessionId,
  }) async {
    if (exerciseIds.isEmpty) return const {};
    try {
      final data = await _api.get(
        '/trainer/clients/$clientProfileId/last-sets',
        query: {
          'exerciseIds': exerciseIds.join(','),
          'excludeSessionId': ?excludeSessionId,
        },
      ) as List<dynamic>;
      final out = <String, List<LastSetSnapshot>>{};
      for (final row in data.whereType<Map>()) {
        final id = row['exerciseId'] as String?;
        if (id == null) continue;
        out[id] = (row['sets'] as List? ?? const [])
            .whereType<Map>()
            .map((s) => LastSetSnapshot.fromJson(Map<String, dynamic>.from(s)))
            .toList();
      }
      return out;
    } on ApiException {
      return const {}; // hints are opportunistic — never block logging
    }
  }

  /// Per-session progression for one exercise (most-relevant metric for its
  /// type: max weight / max reps / duration / steps), oldest→newest. Powers the
  /// per-exercise progress chart. Reuses [ChartPoint] (the body-metric series
  /// shares the `{date, value}` shape).
  Future<List<ChartPoint>> exerciseProgress({
    required String clientProfileId,
    required String exerciseId,
  }) async {
    final data = await _api.get(
      '/trainer/clients/$clientProfileId/exercise-progress',
      query: {'exerciseId': exerciseId},
    ) as List<dynamic>;
    return ChartPoint.listFromJson(data);
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

  Future<List<Exercise>> _fetchPage({
    String? search,
    List<String>? muscleGroups,
    String? exerciseType,
    int page = 1,
    int pageSize = 30,
  }) async {
    final data = await _api.get('/exercises', query: {
      if (search != null && search.trim().isNotEmpty) 'search': search.trim(),
      if (muscleGroups != null && muscleGroups.isNotEmpty)
        'muscleGroups': muscleGroups.join(','),
      'exerciseType': ?exerciseType,
      'page': page,
      'pageSize': pageSize,
    }) as List<dynamic>;
    return data
        .whereType<Map>()
        .map((m) => Exercise.fromJson(Map<String, dynamic>.from(m)))
        .toList();
  }
}

/// Immutable key for [exerciseSearchProvider] so Search / By-Muscle /
/// Suggestions share one provider. [groupIds] are curated ids; normalized
/// (sorted) so two equal queries hit the same cache entry.
class ExerciseQuery {
  ExerciseQuery({this.search = '', List<String> groupIds = const [], this.type})
      : groupIds = List.unmodifiable([...groupIds]..sort());

  final String search;
  final List<String> groupIds;
  final String? type;

  /// True when there's nothing to search on — used by the picker to show a
  /// prompt instead of dumping the whole catalog.
  bool get isEmpty => search.trim().isEmpty && groupIds.isEmpty && type == null;

  String get _key => '${search.trim()}|${groupIds.join(',')}|${type ?? ''}';

  @override
  bool operator ==(Object other) => other is ExerciseQuery && other._key == _key;

  @override
  int get hashCode => _key.hashCode;
}

final workoutRepositoryProvider = Provider<WorkoutRepository>(
  (ref) => WorkoutRepository(
    ref.watch(apiClientProvider),
    ref.watch(exerciseCacheStoreProvider),
    ref.watch(connectivityServiceProvider),
  ),
);

/// Exercise search results for the picker, keyed by an [ExerciseQuery]
/// (text + curated muscle groups + type). An empty query short-circuits to an
/// empty list so the search mode shows a prompt rather than the full catalog.
final exerciseSearchProvider =
    FutureProvider.autoDispose.family<List<Exercise>, ExerciseQuery>(
  (ref, query) {
    if (query.isEmpty) return Future.value(const <Exercise>[]);
    return ref.watch(workoutRepositoryProvider).searchExercises(
          search: query.search.trim().isEmpty ? null : query.search.trim(),
          muscleGroups: query.groupIds.isEmpty ? null : query.groupIds,
          exerciseType: query.type,
          pageSize: 50,
        );
  },
);

/// Per-exercise progression series, keyed by (clientProfileId, exerciseId).
final exerciseProgressProvider = FutureProvider.autoDispose
    .family<List<ChartPoint>, ({String clientProfileId, String exerciseId})>(
  (ref, key) => ref.watch(workoutRepositoryProvider).exerciseProgress(
        clientProfileId: key.clientProfileId,
        exerciseId: key.exerciseId,
      ),
);
