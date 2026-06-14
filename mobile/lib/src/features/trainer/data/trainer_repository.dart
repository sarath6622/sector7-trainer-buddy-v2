import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';
import '../../auth/application/auth_controller.dart';
import '../../client/data/client_models.dart';
import 'trainer_models.dart';

/// Access to the Trainer-role endpoints. Each call maps 1:1 to an existing
/// Next.js route and returns the unwrapped `data`. The session-lifecycle writes
/// (start / end / no-show) hit the trainer routes; the workout logger itself
/// uses the shared `POST /api/sessions/[id]/workouts` path (see WorkoutLogger).
class TrainerRepository {
  TrainerRepository(this._api);
  final ApiClient _api;

  /// `DateTime` → local `YYYY-MM-DD` (matches how the backend stores/queries
  /// session dates — local midnight, not UTC).
  static String ymd(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-'
      '${d.month.toString().padLeft(2, '0')}-'
      '${d.day.toString().padLeft(2, '0')}';

  /// GET /api/trainer/schedule — sessions for this trainer, optionally filtered.
  Future<List<TrainerSession>> schedule({
    String? date,
    String? dateFrom,
    String? dateTo,
    String? month,
    String? status,
  }) async {
    final query = <String, dynamic>{
      'date': ?date,
      'dateFrom': ?dateFrom,
      'dateTo': ?dateTo,
      'month': ?month,
      'status': ?status,
    };
    final data = await _api.get(
      '/trainer/schedule',
      query: query.isEmpty ? null : query,
    ) as List<dynamic>;
    return data
        .whereType<Map>()
        .map((m) => TrainerSession.fromJson(Map<String, dynamic>.from(m)))
        .toList();
  }

  /// GET /api/trainer/clients — active + temporarily-reassigned clients. The
  /// envelope's `pastClients` / `measurementReminderDays` siblings are dropped
  /// by the `{ data }` unwrap; the active list is what the card view needs.
  Future<List<TrainerClient>> clients() async {
    final data = await _api.get('/trainer/clients') as List<dynamic>;
    return data
        .whereType<Map>()
        .map((m) => TrainerClient.fromJson(Map<String, dynamic>.from(m)))
        .toList();
  }

  /// GET /api/trainer/sessions/[id] — full detail incl. workout logs. Reuses the
  /// shared [SessionDetail] model (same SessionInstance shape as the client).
  Future<SessionDetail> session(String id) async {
    final data = await _api.get('/trainer/sessions/$id') as Map<String, dynamic>;
    return SessionDetail.fromJson(data);
  }

  /// POST /api/trainer/sessions/[id]/start — SCHEDULED → IN_PROGRESS.
  Future<void> startSession(String id) =>
      _api.post('/trainer/sessions/$id/start');

  /// POST /api/trainer/sessions/[id]/end — IN_PROGRESS → COMPLETED.
  Future<void> endSession(String id, {String? notes}) => _api.post(
        '/trainer/sessions/$id/end',
        body: notes != null && notes.isNotEmpty ? {'notes': notes} : null,
      );

  /// POST /api/trainer/sessions/[id]/no-show — mark the client a no-show.
  Future<void> markNoShow(String id) =>
      _api.post('/trainer/sessions/$id/no-show');
}

final trainerRepositoryProvider = Provider<TrainerRepository>(
  (ref) => TrainerRepository(ref.watch(apiClientProvider)),
);

/// Today's sessions for the signed-in trainer (chronological).
final trainerTodayProvider =
    FutureProvider.autoDispose<List<TrainerSession>>((ref) {
  final today = TrainerRepository.ymd(DateTime.now());
  return ref.watch(trainerRepositoryProvider).schedule(date: today);
});

/// Upcoming sessions from today onward (for the Schedule agenda).
final trainerUpcomingProvider =
    FutureProvider.autoDispose<List<TrainerSession>>((ref) {
  final today = TrainerRepository.ymd(DateTime.now());
  return ref.watch(trainerRepositoryProvider).schedule(dateFrom: today);
});

/// The trainer's clients (active + reassigned).
final trainerClientsProvider =
    FutureProvider.autoDispose<List<TrainerClient>>(
  (ref) => ref.watch(trainerRepositoryProvider).clients(),
);

/// One session's full detail for the trainer, keyed by id.
final trainerSessionProvider =
    FutureProvider.autoDispose.family<SessionDetail, String>(
  (ref, id) => ref.watch(trainerRepositoryProvider).session(id),
);
