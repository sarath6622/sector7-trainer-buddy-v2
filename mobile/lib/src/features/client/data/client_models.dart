/// Typed models for the Client-role read screens (Phase 2).
///
/// These mirror the JSON returned by the existing Next.js endpoints — no new
/// business logic, just presentation shapes. Parsing is deliberately tolerant
/// (nullable fields, `num`→`int/double`) so a sparse payload never crashes a
/// screen. Sources:
///   GET /api/client/dashboard
///   GET /api/client/sessions
///   GET /api/client/sessions/[id]
library;

/// `num`/`String` → int, tolerating either JSON number kind or null.
int _asInt(Object? v, [int fallback = 0]) =>
    v is num ? v.toInt() : (v is String ? int.tryParse(v) ?? fallback : fallback);

int? _asIntOrNull(Object? v) =>
    v == null ? null : (v is num ? v.toInt() : (v is String ? int.tryParse(v) : null));

double? _asDoubleOrNull(Object? v) =>
    v == null ? null : (v is num ? v.toDouble() : (v is String ? double.tryParse(v) : null));

DateTime? _asDate(Object? v) =>
    v is String && v.isNotEmpty ? DateTime.tryParse(v)?.toLocal() : null;

/// SessionInstance status — mirrors the Prisma `SessionStatus` enum.
enum SessionStatus {
  scheduled,
  inProgress,
  completed,
  noShow,
  cancelled,
  unknown;

  static SessionStatus fromApi(Object? raw) {
    switch (raw) {
      case 'SCHEDULED':
        return SessionStatus.scheduled;
      case 'IN_PROGRESS':
        return SessionStatus.inProgress;
      case 'COMPLETED':
        return SessionStatus.completed;
      case 'NO_SHOW':
        return SessionStatus.noShow;
      case 'CANCELLED':
        return SessionStatus.cancelled;
      default:
        return SessionStatus.unknown;
    }
  }

  String get label => switch (this) {
        SessionStatus.scheduled => 'Scheduled',
        SessionStatus.inProgress => 'In progress',
        SessionStatus.completed => 'Completed',
        SessionStatus.noShow => 'No show',
        SessionStatus.cancelled => 'Cancelled',
        SessionStatus.unknown => 'Unknown',
      };

  bool get isLive => this == SessionStatus.inProgress;
}

/// Trainer name pulled from `trainer.user.{firstName,lastName}`.
String? _trainerName(Map<String, dynamic> json) {
  final user = (json['trainer'] as Map?)?['user'] as Map?;
  if (user == null) return null;
  final name = '${user['firstName'] ?? ''} ${user['lastName'] ?? ''}'.trim();
  return name.isEmpty ? null : name;
}

/// One row in the sessions list, and the shape embedded in the dashboard's
/// `nextSession` / `activeSession`.
class SessionSummary {
  const SessionSummary({
    required this.id,
    required this.scheduledDate,
    required this.scheduledTime,
    required this.durationMin,
    required this.status,
    required this.isCarryForward,
    this.trainerName,
    this.notes,
    this.startedAt,
    this.endedAt,
    this.actualDurationMin,
  });

  final String id;
  final DateTime? scheduledDate;
  final String scheduledTime; // "HH:MM"
  final int durationMin;
  final SessionStatus status;
  final bool isCarryForward;
  final String? trainerName;
  final String? notes;
  final DateTime? startedAt;
  final DateTime? endedAt;
  final int? actualDurationMin;

  factory SessionSummary.fromJson(Map<String, dynamic> json) => SessionSummary(
        id: json['id'] as String,
        scheduledDate: _asDate(json['scheduledDate']),
        scheduledTime: (json['scheduledTime'] ?? '') as String,
        durationMin: _asInt(json['durationMin']),
        status: SessionStatus.fromApi(json['status']),
        isCarryForward: json['isCarryForward'] == true,
        trainerName: _trainerName(json),
        notes: json['notes'] as String?,
        startedAt: _asDate(json['startedAt']),
        endedAt: _asDate(json['endedAt']),
        actualDurationMin: _asIntOrNull(json['actualDurationMin']),
      );
}

/// Full session detail incl. logged exercises + sets.
class SessionDetail {
  const SessionDetail({
    required this.summary,
    required this.workoutLogs,
    this.clientName,
    this.clientProfileId,
  });

  final SessionSummary summary;
  final List<WorkoutLogEntry> workoutLogs;
  final String? clientName;

  /// The session's ClientProfile id, when the endpoint exposes it (the trainer
  /// session detail returns `client.id`). Drives the logger's "last time" hint
  /// fetch; when null (e.g. a client endpoint that omits it) hints are skipped.
  final String? clientProfileId;

  factory SessionDetail.fromJson(Map<String, dynamic> json) {
    final logs = (json['workoutLogs'] as List? ?? const [])
        .whereType<Map>()
        .map((m) => WorkoutLogEntry.fromJson(Map<String, dynamic>.from(m)))
        .toList();
    final client = json['client'] as Map?;
    final clientUser = client?['user'] as Map?;
    final clientName = clientUser == null
        ? null
        : '${clientUser['firstName'] ?? ''} ${clientUser['lastName'] ?? ''}'.trim();
    return SessionDetail(
      summary: SessionSummary.fromJson(json),
      workoutLogs: logs,
      clientName: (clientName?.isEmpty ?? true) ? null : clientName,
      clientProfileId: client?['id'] as String?,
    );
  }
}

class WorkoutLogEntry {
  const WorkoutLogEntry({
    required this.id,
    required this.exerciseId,
    required this.exerciseName,
    required this.muscleGroup,
    required this.exerciseType,
    required this.isCompleted,
    required this.sets,
  });

  final String id;
  final String exerciseId;
  final String exerciseName;
  final String? muscleGroup;
  final String? exerciseType; // WEIGHTED | BODYWEIGHT | CARDIO | ...
  final bool isCompleted;
  final List<WorkoutSetEntry> sets;

  factory WorkoutLogEntry.fromJson(Map<String, dynamic> json) {
    final exercise = json['exercise'] as Map?;
    final sets = (json['sets'] as List? ?? const [])
        .whereType<Map>()
        .map((m) => WorkoutSetEntry.fromJson(Map<String, dynamic>.from(m)))
        .toList();
    return WorkoutLogEntry(
      id: json['id'] as String,
      exerciseId: (exercise?['id'] ?? json['exerciseId'] ?? '') as String,
      exerciseName: (exercise?['name'] ?? 'Exercise') as String,
      muscleGroup: exercise?['targetMuscleGroup'] as String?,
      exerciseType: exercise?['exerciseType'] as String?,
      isCompleted: json['isCompleted'] == true,
      sets: sets,
    );
  }
}

class WorkoutSetEntry {
  const WorkoutSetEntry({
    required this.setNumber,
    this.reps,
    this.weightKg,
    this.durationSec,
    this.rpe,
    this.restSec,
    this.stepsCount,
    this.notes,
  });

  final int setNumber;
  final int? reps;
  final double? weightKg;
  final int? durationSec;
  final int? rpe;
  final int? restSec;
  final int? stepsCount;
  final String? notes;

  factory WorkoutSetEntry.fromJson(Map<String, dynamic> json) => WorkoutSetEntry(
        setNumber: _asInt(json['setNumber']),
        reps: _asIntOrNull(json['reps']),
        weightKg: _asDoubleOrNull(json['weightKg']),
        durationSec: _asIntOrNull(json['durationSec']),
        rpe: _asIntOrNull(json['rpe']),
        restSec: _asIntOrNull(json['restSec']),
        stepsCount: _asIntOrNull(json['stepsCount']),
        notes: json['notes'] as String?,
      );

  /// Compact human summary, e.g. "12 × 40kg" or "45s" — skips empty fields.
  String get summary {
    final parts = <String>[];
    if (reps != null) parts.add('$reps reps');
    if (weightKg != null) parts.add('${_trimDouble(weightKg!)}kg');
    if (durationSec != null) parts.add('${durationSec}s');
    if (stepsCount != null) parts.add('$stepsCount steps');
    return parts.isEmpty ? '—' : parts.join(' · ');
  }
}

String _trimDouble(double v) =>
    v == v.roundToDouble() ? v.toInt().toString() : v.toString();

// ── Dashboard ───────────────────────────────────────────────────────────────

class SessionCount {
  const SessionCount({
    required this.used,
    required this.remaining,
    required this.completed,
    required this.scheduled,
    required this.noShow,
    required this.total,
    this.carryForward = 0,
  });

  final int used;
  final int remaining;
  final int completed;
  final int scheduled;
  final int noShow;
  final int total;
  final int carryForward;

  factory SessionCount.fromJson(Map<String, dynamic> json) => SessionCount(
        used: _asInt(json['used']),
        remaining: _asInt(json['remaining']),
        completed: _asInt(json['completed']),
        scheduled: _asInt(json['scheduled']),
        noShow: _asInt(json['noShow']),
        total: _asInt(json['total']),
        carryForward: _asInt(json['carryForward']),
      );

  static const empty = SessionCount(
    used: 0,
    remaining: 0,
    completed: 0,
    scheduled: 0,
    noShow: 0,
    total: 0,
  );
}

class EngagementStats {
  const EngagementStats({
    required this.streak,
    required this.allTimeCompleted,
    this.daysSinceLastSession,
    this.monthAttendanceRate,
  });

  final int streak;
  final int allTimeCompleted;
  final int? daysSinceLastSession;
  final int? monthAttendanceRate;

  factory EngagementStats.fromJson(Map<String, dynamic> json) => EngagementStats(
        streak: _asInt(json['streak']),
        allTimeCompleted: _asInt(json['allTimeCompleted']),
        daysSinceLastSession: _asIntOrNull(json['daysSinceLastSession']),
        monthAttendanceRate: _asIntOrNull(json['monthAttendanceRate']),
      );

  static const empty = EngagementStats(streak: 0, allTimeCompleted: 0);
}

class PackageExpiry {
  const PackageExpiry({
    required this.isExpired,
    this.daysUntilExpiry,
    this.endDate,
    this.startDate,
  });

  final bool isExpired;
  final int? daysUntilExpiry;
  final DateTime? endDate;
  final DateTime? startDate;

  factory PackageExpiry.fromJson(Map<String, dynamic> json) => PackageExpiry(
        isExpired: json['isExpired'] == true,
        daysUntilExpiry: _asIntOrNull(json['daysUntilExpiry']),
        endDate: _asDate(json['endDate']),
        startDate: _asDate(json['startDate']),
      );

  /// Fraction 0..1 of the package lifetime elapsed — drives the countdown bar.
  /// Falls back to 0 when the span can't be computed.
  double get progress {
    final s = startDate, e = endDate, d = daysUntilExpiry;
    if (s == null || e == null || d == null) return 0;
    final total = e.difference(s).inDays;
    if (total <= 0) return 0;
    return ((total - d) / total).clamp(0.0, 1.0);
  }
}

/// A point-in-time body-measurement snapshot — drives the Fitness Journey cards
/// and their deltas. Any field may be null when the client hasn't logged it.
class ProgressSnapshot {
  const ProgressSnapshot({this.weightKg, this.bodyFatPercent, this.muscleMass});

  final double? weightKg;
  final double? bodyFatPercent;
  final double? muscleMass;

  bool get hasAny =>
      weightKg != null || bodyFatPercent != null || muscleMass != null;

  factory ProgressSnapshot.fromJson(Map<String, dynamic> json) =>
      ProgressSnapshot(
        weightKg: _asDoubleOrNull(json['weightKg']),
        bodyFatPercent: _asDoubleOrNull(json['bodyFatPercent']),
        muscleMass: _asDoubleOrNull(json['muscleMass']),
      );
}

class PersonalRecord {
  const PersonalRecord({
    required this.exerciseName,
    required this.muscle,
    required this.maxWeightKg,
  });

  final String exerciseName;
  final String muscle;
  final double maxWeightKg;

  factory PersonalRecord.fromJson(Map<String, dynamic> json) => PersonalRecord(
        exerciseName: (json['exerciseName'] ?? '') as String,
        muscle: (json['muscle'] ?? '') as String,
        maxWeightKg: _asDoubleOrNull(json['maxWeightKg']) ?? 0,
      );
}

class ClientDashboard {
  const ClientDashboard({
    required this.sessionCount,
    required this.engagementStats,
    this.trainerName,
    this.trainerSessionsPerMonth,
    this.nextSession,
    this.activeSession,
    this.packageExpiry,
    this.latestProgress,
    this.prevProgress,
    this.prs = const [],
  });

  final SessionCount sessionCount;
  final EngagementStats engagementStats;
  final String? trainerName;
  final int? trainerSessionsPerMonth;
  final SessionSummary? nextSession;
  final SessionSummary? activeSession;
  final PackageExpiry? packageExpiry;
  final ProgressSnapshot? latestProgress;
  final ProgressSnapshot? prevProgress;
  final List<PersonalRecord> prs;

  /// True when there's any body-metric or PR data to show the Fitness Journey.
  bool get hasFitnessJourney => (latestProgress?.hasAny ?? false) || prs.isNotEmpty;

  factory ClientDashboard.fromJson(Map<String, dynamic> json) {
    SessionSummary? session(String key) {
      final raw = json[key];
      return raw is Map
          ? SessionSummary.fromJson(Map<String, dynamic>.from(raw))
          : null;
    }

    ProgressSnapshot? snapshot(String key) {
      final raw = json[key];
      return raw is Map
          ? ProgressSnapshot.fromJson(Map<String, dynamic>.from(raw))
          : null;
    }

    final trainer = json['trainer'] as Map?;
    final pkg = json['packageExpiry'] as Map?;
    return ClientDashboard(
      sessionCount: json['sessionCount'] is Map
          ? SessionCount.fromJson(Map<String, dynamic>.from(json['sessionCount'] as Map))
          : SessionCount.empty,
      engagementStats: json['engagementStats'] is Map
          ? EngagementStats.fromJson(
              Map<String, dynamic>.from(json['engagementStats'] as Map))
          : EngagementStats.empty,
      trainerName: trainer?['name'] as String?,
      trainerSessionsPerMonth: _asIntOrNull(trainer?['sessionsPerMonth']),
      nextSession: session('nextSession'),
      activeSession: session('activeSession'),
      packageExpiry: pkg != null
          ? PackageExpiry.fromJson(Map<String, dynamic>.from(pkg))
          : null,
      latestProgress: snapshot('latestProgress'),
      prevProgress: snapshot('prevProgress'),
      prs: (json['prs'] as List? ?? const [])
          .whereType<Map>()
          .map((m) => PersonalRecord.fromJson(Map<String, dynamic>.from(m)))
          .toList(),
    );
  }
}
