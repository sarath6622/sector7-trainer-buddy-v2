import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';
import '../../auth/application/auth_controller.dart';
import '../../client/data/client_extras_models.dart';
import '../../client/data/client_models.dart';
import '../../client/data/progress_models.dart';
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

  /// Client-detail snapshot: recent workout history + progress + badges, fetched
  /// in parallel. Hits the three `/api/trainer/clients/[id]/*` read routes.
  Future<TrainerClientDetail> clientDetail(String clientProfileId) async {
    final results = await Future.wait([
      _api.get('/trainer/clients/$clientProfileId/workout-history',
          query: {'limit': 10}),
      _api.get('/trainer/clients/$clientProfileId/progress'),
      _api.get('/trainer/clients/$clientProfileId/badges'),
    ]);
    final history = (results[0] as List? ?? const [])
        .whereType<Map>()
        .map((m) => TrainerWorkoutSession.fromJson(Map<String, dynamic>.from(m)))
        .toList();
    final progress = (results[1] as List? ?? const [])
        .whereType<Map>()
        .map((m) => ProgressEntry.fromJson(Map<String, dynamic>.from(m)))
        .toList();
    final badges = results[2] is Map
        ? BadgesData.fromJson(Map<String, dynamic>.from(results[2] as Map))
        : const BadgesData(earned: [], locked: []);
    return TrainerClientDetail(history: history, progress: progress, badges: badges);
  }

  // ── Leaves ──────────────────────────────────────────────────────────────

  /// GET /api/trainer/leaves — the trainer's own leave requests.
  Future<List<TrainerLeave>> leaves() async {
    final data = await _api.get('/trainer/leaves') as List<dynamic>;
    return data
        .whereType<Map>()
        .map((m) => TrainerLeave.fromJson(Map<String, dynamic>.from(m)))
        .toList();
  }

  /// GET /api/trainer/leaves/balance — quota usage for [month] (default: current).
  Future<LeaveBalance> leaveBalance({String? month}) async {
    final data = await _api.get(
      '/trainer/leaves/balance',
      query: month != null ? {'month': month} : null,
    ) as Map<String, dynamic>;
    return LeaveBalance.fromJson(data);
  }

  /// POST /api/trainer/leaves — apply for a full-day leave over [startDate]..[endDate]
  /// (inclusive, `YYYY-MM-DD`). Half-day/custom is deferred to the web console.
  Future<void> applyLeave({
    required String startDate,
    required String endDate,
    String? reason,
  }) =>
      _api.post('/trainer/leaves', body: {
        'startDate': startDate,
        'endDate': endDate,
        'leaveType': 'FULL_DAY',
        if (reason != null && reason.isNotEmpty) 'reason': reason,
      });

  // ── Reschedule requests ───────────────────────────────────────────────────

  /// GET /api/trainer/reschedule-requests — requests for this trainer's clients.
  /// The `{ data, pagination }` envelope unwraps to the `data` array.
  Future<List<TrainerRescheduleRequest>> rescheduleRequests({String? status}) async {
    final data = await _api.get(
      '/trainer/reschedule-requests',
      query: status != null ? {'status': status} : null,
    ) as List<dynamic>;
    return data
        .whereType<Map>()
        .map((m) => TrainerRescheduleRequest.fromJson(Map<String, dynamic>.from(m)))
        .toList();
  }

  /// PUT /api/trainer/reschedule-requests/[id]/approve.
  Future<void> approveReschedule(String id, {String? notes}) => _api.put(
        '/trainer/reschedule-requests/$id/approve',
        body: notes != null && notes.isNotEmpty ? {'reviewNotes': notes} : null,
      );

  /// PUT /api/trainer/reschedule-requests/[id]/reject.
  Future<void> rejectReschedule(String id, {String? notes}) => _api.put(
        '/trainer/reschedule-requests/$id/reject',
        body: notes != null && notes.isNotEmpty ? {'reviewNotes': notes} : null,
      );
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

/// Client-detail snapshot (history + progress + badges), keyed by clientProfileId.
final trainerClientDetailProvider =
    FutureProvider.autoDispose.family<TrainerClientDetail, String>(
  (ref, clientProfileId) =>
      ref.watch(trainerRepositoryProvider).clientDetail(clientProfileId),
);

/// The trainer's own leave requests.
final trainerLeavesProvider = FutureProvider.autoDispose<List<TrainerLeave>>(
  (ref) => ref.watch(trainerRepositoryProvider).leaves(),
);

/// The trainer's leave-quota usage for the current month.
final trainerLeaveBalanceProvider = FutureProvider.autoDispose<LeaveBalance>(
  (ref) => ref.watch(trainerRepositoryProvider).leaveBalance(),
);

/// Pending reschedule requests for this trainer's clients (the actionable set).
final trainerRescheduleProvider =
    FutureProvider.autoDispose<List<TrainerRescheduleRequest>>(
  (ref) => ref.watch(trainerRepositoryProvider).rescheduleRequests(status: 'PENDING'),
);
