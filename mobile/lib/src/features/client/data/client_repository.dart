import 'package:dio/dio.dart' show DioMediaType;
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';
import '../../auth/application/auth_controller.dart';
import 'client_extras_models.dart';
import 'client_models.dart';
import 'progress_models.dart';

/// Read access to the Client-role endpoints. The Next.js backend is unchanged;
/// each call maps 1:1 to an existing route and returns the unwrapped `data`.
class ClientRepository {
  ClientRepository(this._api);
  final ApiClient _api;

  /// GET /api/client/dashboard
  Future<ClientDashboard> dashboard() async {
    final data = await _api.get('/client/dashboard') as Map<String, dynamic>;
    return ClientDashboard.fromJson(data);
  }

  /// GET /api/client/sessions (optionally scoped to a `YYYY-MM` month).
  Future<List<SessionSummary>> sessions({String? month}) async {
    final data = await _api.get(
      '/client/sessions',
      query: month != null ? {'month': month} : null,
    ) as List<dynamic>;
    return data
        .whereType<Map>()
        .map((m) => SessionSummary.fromJson(Map<String, dynamic>.from(m)))
        .toList();
  }

  /// GET /api/client/sessions/[id]
  Future<SessionDetail> session(String id) async {
    final data = await _api.get('/client/sessions/$id') as Map<String, dynamic>;
    return SessionDetail.fromJson(data);
  }

  /// GET /api/client/progress/charts?metric=...
  Future<List<ChartPoint>> progressChart(ChartMetric metric) async {
    final data = await _api.get(
      '/client/progress/charts',
      query: {'metric': metric.apiValue},
    ) as List<dynamic>;
    return ChartPoint.listFromJson(data);
  }

  /// GET /api/client/progress (body-measurement entries, newest first)
  Future<List<ProgressEntry>> progressEntries() async {
    final data = await _api.get('/client/progress') as List<dynamic>;
    return data
        .whereType<Map>()
        .map((m) => ProgressEntry.fromJson(Map<String, dynamic>.from(m)))
        .toList();
  }

  /// POST /api/client/progress — log a new body-measurement entry. Only the
  /// provided numeric fields are sent (e.g. `{weightKg: 74.5}`).
  Future<void> logProgress(Map<String, double> values) =>
      _api.post('/client/progress', body: values);

  /// GET /api/client/workouts (logged exercises across sessions, newest first)
  Future<List<WorkoutHistoryEntry>> workouts() async {
    final data = await _api.get('/client/workouts') as List<dynamic>;
    return data
        .whereType<Map>()
        .map((m) => WorkoutHistoryEntry.fromJson(Map<String, dynamic>.from(m)))
        .toList();
  }

  /// GET /api/client/badges → earned + locked badges.
  Future<BadgesData> badges() async {
    final data = await _api.get('/client/badges') as Map<String, dynamic>;
    return BadgesData.fromJson(data);
  }

  /// GET /api/client/unavailability (dates marked unavailable, ascending).
  Future<List<UnavailabilityDate>> unavailability() async {
    final data = await _api.get('/client/unavailability') as List<dynamic>;
    return data
        .whereType<Map>()
        .map((m) => UnavailabilityDate.fromJson(Map<String, dynamic>.from(m)))
        .toList();
  }

  /// POST /api/client/unavailability — mark one or more `YYYY-MM-DD` dates.
  Future<void> addUnavailability(List<String> dates) =>
      _api.post('/client/unavailability', body: {'dates': dates});

  /// DELETE /api/client/unavailability/[id]
  Future<void> removeUnavailability(String id) =>
      _api.delete('/client/unavailability/$id');

  /// GET /api/client/reschedule-requests (own history, newest first).
  Future<List<RescheduleRequestItem>> rescheduleRequests() async {
    final data = await _api.get('/client/reschedule-requests') as List<dynamic>;
    return data
        .whereType<Map>()
        .map((m) => RescheduleRequestItem.fromJson(Map<String, dynamic>.from(m)))
        .toList();
  }

  /// POST /api/client/reschedule-requests — request to move a session.
  Future<void> submitReschedule({
    required String sessionInstanceId,
    required String requestedDate, // YYYY-MM-DD
    required String requestedTime, // HH:MM
    String? reason,
  }) =>
      _api.post('/client/reschedule-requests', body: {
        'sessionInstanceId': sessionInstanceId,
        'requestedDate': requestedDate,
        'requestedTime': requestedTime,
        if (reason != null && reason.isNotEmpty) 'reason': reason,
      });

  /// GET /api/client/profile/image → the current avatar URL (or null).
  Future<String?> profileImageUrl() async {
    final data = await _api.get('/client/profile/image') as Map<String, dynamic>;
    return data['profileImageUrl'] as String?;
  }

  /// POST /api/client/profile/image (multipart) — server uploads to Cloudinary
  /// (face-crop transform + audit) and returns the new avatar URL.
  Future<String?> uploadProfileImage(String filePath) async {
    final ext = filePath.split('.').last.toLowerCase();
    final subtype = switch (ext) {
      'png' => 'png',
      'webp' => 'webp',
      _ => 'jpeg',
    };
    final data = await _api.uploadFile(
      '/client/profile/image',
      filePath: filePath,
      filename: 'avatar.$ext',
      contentType: DioMediaType('image', subtype),
    ) as Map<String, dynamic>;
    return data['profileImageUrl'] as String?;
  }

  /// DELETE /api/client/profile/image — clear the avatar.
  Future<void> removeProfileImage() => _api.delete('/client/profile/image');

  /// GET /api/client/profile → the caller's own editable name + phone, for the
  /// Settings form (the access token's name claim can be stale, so we read it).
  Future<({String firstName, String lastName, String? phone})> profileEdit() async {
    final data = await _api.get('/client/profile') as Map<String, dynamic>;
    return (
      firstName: (data['firstName'] ?? '') as String,
      lastName: (data['lastName'] ?? '') as String,
      phone: data['phone'] as String?,
    );
  }

  /// PATCH /api/client/profile — update the caller's own name / phone. Only the
  /// provided (non-null) fields are sent.
  Future<void> updateProfile({String? firstName, String? lastName, String? phone}) =>
      _api.patch('/client/profile', body: {
        'firstName': ?firstName,
        'lastName': ?lastName,
        'phone': ?phone,
      });
}

final clientRepositoryProvider = Provider<ClientRepository>(
  (ref) => ClientRepository(ref.watch(apiClientProvider)),
);

final clientDashboardProvider = FutureProvider.autoDispose<ClientDashboard>(
  (ref) => ref.watch(clientRepositoryProvider).dashboard(),
);

/// All of the client's sessions (newest scheduling order from the API).
final clientSessionsProvider =
    FutureProvider.autoDispose<List<SessionSummary>>(
  (ref) => ref.watch(clientRepositoryProvider).sessions(),
);

/// One session's full detail, keyed by id.
final clientSessionProvider =
    FutureProvider.autoDispose.family<SessionDetail, String>(
  (ref, id) => ref.watch(clientRepositoryProvider).session(id),
);

/// Progress line-chart points for a body metric (weight / body-fat / muscle).
final progressChartProvider =
    FutureProvider.autoDispose.family<List<ChartPoint>, ChartMetric>(
  (ref, metric) => ref.watch(clientRepositoryProvider).progressChart(metric),
);

/// Body-measurement entries (newest first).
final progressEntriesProvider =
    FutureProvider.autoDispose<List<ProgressEntry>>(
  (ref) => ref.watch(clientRepositoryProvider).progressEntries(),
);

/// Workout history — logged exercises across all sessions (newest first).
final workoutHistoryProvider =
    FutureProvider.autoDispose<List<WorkoutHistoryEntry>>(
  (ref) => ref.watch(clientRepositoryProvider).workouts(),
);

/// Earned + locked badges.
final badgesProvider = FutureProvider.autoDispose<BadgesData>(
  (ref) => ref.watch(clientRepositoryProvider).badges(),
);

/// Dates the client has marked themselves unavailable.
final unavailabilityProvider =
    FutureProvider.autoDispose<List<UnavailabilityDate>>(
  (ref) => ref.watch(clientRepositoryProvider).unavailability(),
);

/// The client's reschedule-request history.
final rescheduleRequestsProvider =
    FutureProvider.autoDispose<List<RescheduleRequestItem>>(
  (ref) => ref.watch(clientRepositoryProvider).rescheduleRequests(),
);

/// The current profile-image URL (null when unset).
final profileImageProvider = FutureProvider.autoDispose<String?>(
  (ref) => ref.watch(clientRepositoryProvider).profileImageUrl(),
);

/// The caller's editable name + phone (for the Settings form).
final clientProfileEditProvider = FutureProvider.autoDispose<
    ({String firstName, String lastName, String? phone})>(
  (ref) => ref.watch(clientRepositoryProvider).profileEdit(),
);
