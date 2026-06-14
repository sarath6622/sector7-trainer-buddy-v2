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

import '../../client/data/client_models.dart';

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
