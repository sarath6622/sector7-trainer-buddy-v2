/// Typed models for the Trainer-role screens (Phase 3).
///
/// Like the client models these mirror the JSON returned by the existing
/// Next.js endpoints — no new business logic, just presentation shapes, with
/// deliberately tolerant parsing. Session shapes ([SessionSummary],
/// [SessionStatus], [SessionDetail]) are reused from the client models since the
/// trainer endpoints return the same SessionInstance shape (with `client.user`
/// instead of, or alongside, `trainer.user`). Sources:
///   GET /api/trainer/schedule        → [TrainerSession] list
///   GET /api/trainer/sessions/[id]   → SessionDetail (reused)
///   GET /api/trainer/clients         → [TrainerClient] list
library;

import '../../client/data/client_extras_models.dart';
import '../../client/data/client_models.dart';
import '../../client/data/progress_models.dart';

// Local tolerant parsers (the client_models ones are private to that file).
int _int(Object? v, [int fallback = 0]) =>
    v is num ? v.toInt() : (v is String ? int.tryParse(v) ?? fallback : fallback);

int? _intOrNull(Object? v) =>
    v == null ? null : (v is num ? v.toInt() : (v is String ? int.tryParse(v) : null));

DateTime? _date(Object? v) =>
    v is String && v.isNotEmpty ? DateTime.tryParse(v)?.toLocal() : null;

String? _name(Map? user) {
  if (user == null) return null;
  final n = '${user['firstName'] ?? ''} ${user['lastName'] ?? ''}'.trim();
  return n.isEmpty ? null : n;
}

/// One row in the trainer's schedule / today list. Wraps the shared
/// [SessionSummary] (date/time/status/duration parsing) and adds the client
/// identity the trainer needs to act on the session.
class TrainerSession {
  const TrainerSession({
    required this.summary,
    required this.clientProfileId,
    this.clientName,
  });

  final SessionSummary summary;
  final String clientProfileId;
  final String? clientName;

  String get id => summary.id;
  SessionStatus get status => summary.status;
  DateTime? get scheduledDate => summary.scheduledDate;
  String get scheduledTime => summary.scheduledTime;

  factory TrainerSession.fromJson(Map<String, dynamic> json) {
    final clientUser = (json['client'] as Map?)?['user'] as Map?;
    return TrainerSession(
      summary: SessionSummary.fromJson(json),
      clientProfileId: (json['clientProfileId'] ?? '') as String,
      clientName: _name(clientUser),
    );
  }
}

/// Per-month session stats for a client card on the trainer's Clients tab.
class TrainerClientStats {
  const TrainerClientStats({
    required this.totalThisMonth,
    required this.completed,
    required this.noShow,
    required this.scheduled,
    required this.remaining,
  });

  final int totalThisMonth;
  final int completed;
  final int noShow;
  final int scheduled;
  final int remaining;

  factory TrainerClientStats.fromJson(Map<String, dynamic> json) =>
      TrainerClientStats(
        totalThisMonth: _int(json['totalThisMonth']),
        completed: _int(json['completed']),
        noShow: _int(json['noShow']),
        scheduled: _int(json['scheduled']),
        remaining: _int(json['remaining']),
      );

  static const empty = TrainerClientStats(
    totalThisMonth: 0,
    completed: 0,
    noShow: 0,
    scheduled: 0,
    remaining: 0,
  );
}

/// The trainer's next scheduled session with one client (minimal shape from the
/// clients endpoint's `nextSession`).
class TrainerNextSession {
  const TrainerNextSession({
    required this.id,
    required this.scheduledDate,
    required this.scheduledTime,
  });

  final String id;
  final DateTime? scheduledDate;
  final String scheduledTime;

  static TrainerNextSession? fromJson(Object? raw) {
    if (raw is! Map) return null;
    final id = raw['id'];
    if (id is! String) return null;
    return TrainerNextSession(
      id: id,
      scheduledDate: _date(raw['scheduledDate']),
      scheduledTime: (raw['scheduledTime'] ?? '') as String,
    );
  }
}

/// A client card on the trainer's Clients tab. Mirrors one element of
/// `GET /api/trainer/clients` `data[]` (primary or temporarily-reassigned).
class TrainerClient {
  const TrainerClient({
    required this.clientProfileId,
    required this.name,
    required this.isReassigned,
    required this.measurementStale,
    required this.stats,
    this.email,
    this.phone,
    this.photoUrl,
    this.nextSession,
    this.reassignedSessionCount,
  });

  final String clientProfileId;
  final String name;
  final bool isReassigned;
  final bool measurementStale;
  final TrainerClientStats stats;
  final String? email;
  final String? phone;
  final String? photoUrl;
  final TrainerNextSession? nextSession;
  final int? reassignedSessionCount;

  factory TrainerClient.fromJson(Map<String, dynamic> json) {
    final profile = (json['clientProfile'] as Map?) ?? const {};
    final user = profile['user'] as Map?;
    final stats = json['stats'];
    return TrainerClient(
      clientProfileId: (profile['id'] ?? '') as String,
      name: _name(user) ?? 'Client',
      isReassigned: json['isReassigned'] == true,
      measurementStale: json['measurementStale'] == true,
      stats: stats is Map
          ? TrainerClientStats.fromJson(Map<String, dynamic>.from(stats))
          : TrainerClientStats.empty,
      email: user?['email'] as String?,
      phone: user?['phone'] as String?,
      photoUrl: user?['profileImageUrl'] as String?,
      nextSession: TrainerNextSession.fromJson(json['nextSession']),
      reassignedSessionCount: _intOrNull(json['reassignedSessionCount']),
    );
  }
}

// ── Client detail (snapshot) ────────────────────────────────────────────────
//
// `GET /api/trainer/clients/[id]/workout-history` returns sessions, each with
// its own `exercises[]` (note: session-grouped, NOT the log-flattened shape the
// client's own /api/client/workouts uses — so it gets its own models here). The
// set shape matches the client [WorkoutSetEntry], which is reused.

class TrainerWorkoutExercise {
  const TrainerWorkoutExercise({
    required this.id,
    required this.name,
    required this.sets,
    this.muscleGroup,
    this.exerciseType,
  });

  final String id;
  final String name;
  final List<WorkoutSetEntry> sets;
  final String? muscleGroup;
  final String? exerciseType;

  factory TrainerWorkoutExercise.fromJson(Map<String, dynamic> json) =>
      TrainerWorkoutExercise(
        id: (json['id'] ?? '') as String,
        name: (json['name'] ?? 'Exercise') as String,
        muscleGroup: json['targetMuscleGroup'] as String?,
        exerciseType: json['exerciseType'] as String?,
        sets: (json['sets'] as List? ?? const [])
            .whereType<Map>()
            .map((m) => WorkoutSetEntry.fromJson(Map<String, dynamic>.from(m)))
            .toList(),
      );
}

class TrainerWorkoutSession {
  const TrainerWorkoutSession({
    required this.sessionId,
    required this.date,
    required this.time,
    required this.status,
    required this.durationMin,
    required this.exercises,
  });

  final String sessionId;
  final DateTime? date;
  final String time;
  final SessionStatus status;
  final int durationMin;
  final List<TrainerWorkoutExercise> exercises;

  factory TrainerWorkoutSession.fromJson(Map<String, dynamic> json) =>
      TrainerWorkoutSession(
        sessionId: (json['sessionId'] ?? '') as String,
        date: _date(json['date']),
        time: (json['time'] ?? '') as String,
        status: SessionStatus.fromApi(json['status']),
        durationMin: _int(json['durationMin']),
        exercises: (json['exercises'] as List? ?? const [])
            .whereType<Map>()
            .map((m) => TrainerWorkoutExercise.fromJson(Map<String, dynamic>.from(m)))
            .toList(),
      );
}

/// Aggregate for the trainer's client-detail screen (snapshot v1) — recent
/// workout history + progress measurements + badges, fetched in parallel.
class TrainerClientDetail {
  const TrainerClientDetail({
    required this.history,
    required this.progress,
    required this.badges,
  });

  final List<TrainerWorkoutSession> history;
  final List<ProgressEntry> progress;
  final BadgesData badges;

  /// Most-recent progress entry (entries arrive newest-first from the API; we
  /// still pick by `recordedAt` to be safe).
  ProgressEntry? get latestProgress {
    if (progress.isEmpty) return null;
    final sorted = [...progress]..sort(
        (a, b) => (b.recordedAt ?? DateTime(0)).compareTo(a.recordedAt ?? DateTime(0)),
      );
    return sorted.first;
  }
}

// ── Leaves ──────────────────────────────────────────────────────────────────

enum LeaveStatus {
  pending,
  approved,
  rejected,
  cancelled,
  unknown;

  static LeaveStatus fromApi(Object? raw) => switch (raw) {
        'PENDING' => LeaveStatus.pending,
        'APPROVED' => LeaveStatus.approved,
        'REJECTED' => LeaveStatus.rejected,
        'CANCELLED' => LeaveStatus.cancelled,
        _ => LeaveStatus.unknown,
      };

  String get label => switch (this) {
        LeaveStatus.pending => 'Pending',
        LeaveStatus.approved => 'Approved',
        LeaveStatus.rejected => 'Rejected',
        LeaveStatus.cancelled => 'Cancelled',
        LeaveStatus.unknown => 'Unknown',
      };
}

/// One of the trainer's own leave requests (`GET /api/trainer/leaves`).
class TrainerLeave {
  const TrainerLeave({
    required this.id,
    required this.startDate,
    required this.endDate,
    required this.leaveType,
    required this.status,
    required this.createdAt,
    this.reason,
    this.reviewNotes,
  });

  final String id;
  final DateTime? startDate;
  final DateTime? endDate;
  final String leaveType; // FULL_DAY | HALF_DAY_AM | HALF_DAY_PM | CUSTOM
  final LeaveStatus status;
  final DateTime? createdAt;
  final String? reason;
  final String? reviewNotes;

  factory TrainerLeave.fromJson(Map<String, dynamic> json) => TrainerLeave(
        id: (json['id'] ?? '') as String,
        startDate: _date(json['startDate']),
        endDate: _date(json['endDate']),
        leaveType: (json['leaveType'] ?? 'FULL_DAY') as String,
        status: LeaveStatus.fromApi(json['status']),
        createdAt: _date(json['createdAt']),
        reason: json['reason'] as String?,
        reviewNotes: json['reviewNotes'] as String?,
      );
}

/// A single quota line (regular or emergency) from the balance endpoint.
class LeaveQuota {
  const LeaveQuota({required this.quota, required this.used, required this.remaining});
  final int quota;
  final int used;
  final int remaining;

  factory LeaveQuota.fromJson(Map<String, dynamic> json) => LeaveQuota(
        quota: _int(json['quota']),
        used: _int(json['used']),
        remaining: _int(json['remaining']),
      );

  static const empty = LeaveQuota(quota: 0, used: 0, remaining: 0);
}

/// `GET /api/trainer/leaves/balance?month=YYYY-MM`.
class LeaveBalance {
  const LeaveBalance({required this.month, required this.regular, required this.emergency});
  final String month;
  final LeaveQuota regular;
  final LeaveQuota emergency;

  factory LeaveBalance.fromJson(Map<String, dynamic> json) => LeaveBalance(
        month: (json['month'] ?? '') as String,
        regular: json['regular'] is Map
            ? LeaveQuota.fromJson(Map<String, dynamic>.from(json['regular'] as Map))
            : LeaveQuota.empty,
        emergency: json['emergency'] is Map
            ? LeaveQuota.fromJson(Map<String, dynamic>.from(json['emergency'] as Map))
            : LeaveQuota.empty,
      );
}

// ── Reschedule requests (trainer view) ──────────────────────────────────────
//
// Same RescheduleRequest rows as the client sees, but the trainer cares about
// the *client's* identity (the client model surfaces the trainer instead), so
// this is a dedicated shape. Reuses the shared [RescheduleStatus] enum.

class TrainerRescheduleRequest {
  const TrainerRescheduleRequest({
    required this.id,
    required this.status,
    required this.requestedDate,
    required this.requestedTime,
    required this.createdAt,
    this.clientName,
    this.reason,
    this.reviewNotes,
    this.originalDate,
    this.originalTime,
  });

  final String id;
  final RescheduleStatus status;
  final DateTime? requestedDate;
  final String requestedTime;
  final DateTime? createdAt;
  final String? clientName;
  final String? reason;
  final String? reviewNotes;
  final DateTime? originalDate;
  final String? originalTime;

  factory TrainerRescheduleRequest.fromJson(Map<String, dynamic> json) {
    final si = json['sessionInstance'] as Map?;
    final clientUser = (json['client'] as Map?)?['user'] as Map?;
    return TrainerRescheduleRequest(
      id: (json['id'] ?? '') as String,
      status: RescheduleStatus.fromApi(json['status']),
      requestedDate: _date(json['requestedDate']),
      requestedTime: (json['requestedTime'] ?? '') as String,
      createdAt: _date(json['createdAt']),
      clientName: _name(clientUser),
      reason: json['reason'] as String?,
      reviewNotes: json['reviewNotes'] as String?,
      originalDate: _date(si?['scheduledDate']),
      originalTime: si?['scheduledTime'] as String?,
    );
  }
}
