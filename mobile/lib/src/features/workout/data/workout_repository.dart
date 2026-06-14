import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';
import '../../auth/application/auth_controller.dart';
import '../domain/workout_draft.dart';
import 'exercise.dart';

/// Reads the exercise library and writes workout logs. The write hits the
/// **shared** `POST /api/sessions/[id]/workouts` (ADR-036) — the session's
/// client or trainer may both save.
class WorkoutRepository {
  WorkoutRepository(this._api);
  final ApiClient _api;

  /// GET /api/exercises?search=&pageSize= (paginated; first page is plenty for a picker).
  Future<List<Exercise>> searchExercises({String? search, int pageSize = 30}) async {
    final data = await _api.get('/exercises', query: {
      if (search != null && search.trim().isNotEmpty) 'search': search.trim(),
      'pageSize': pageSize,
    }) as List<dynamic>;
    return data
        .whereType<Map>()
        .map((m) => Exercise.fromJson(Map<String, dynamic>.from(m)))
        .toList();
  }

  /// POST /api/sessions/[id]/workouts — full-snapshot save (v1, online).
  /// Omits the dirty-scoping fields, so the service does a full replace; the
  /// scoped/diff write + offline queue come in the offline increment.
  Future<void> saveWorkout(String sessionId, List<DraftExercise> exercises) async {
    await _api.post('/sessions/$sessionId/workouts', body: {
      'exercises': [
        for (var i = 0; i < exercises.length; i++) exercises[i].toJson(i),
      ],
    });
  }
}

final workoutRepositoryProvider = Provider<WorkoutRepository>(
  (ref) => WorkoutRepository(ref.watch(apiClientProvider)),
);

/// Exercise search results for the picker, keyed by query (empty = browse all).
final exerciseSearchProvider =
    FutureProvider.autoDispose.family<List<Exercise>, String>(
  (ref, query) => ref.watch(workoutRepositoryProvider).searchExercises(search: query),
);
