/// Models for the secondary Client features (Phase 2): badges, unavailability,
/// and reschedule requests. Mirror the existing endpoints:
///   GET    /api/client/badges                  → { earned[], locked[] }
///   GET    /api/client/unavailability          → ClientUnavailability[]
///   POST   /api/client/unavailability          → { dates: string[] }
///   DELETE /api/client/unavailability/[id]
///   GET    /api/client/reschedule-requests     → { data[], pagination }
///   POST   /api/client/reschedule-requests
library;

double? _asDouble(Object? v) =>
    v == null ? null : (v is num ? v.toDouble() : (v is String ? double.tryParse(v) : null));

DateTime? _asDate(Object? v) =>
    v is String && v.isNotEmpty ? DateTime.tryParse(v)?.toLocal() : null;

String _trimDouble(double v) =>
    v == v.roundToDouble() ? v.toInt().toString() : v.toStringAsFixed(1);

// ── Badges ────────────────────────────────────────────────────────────────────

class Badge {
  const Badge({
    required this.name,
    required this.description,
    required this.icon,
    required this.earned,
    this.imageUrl,
    this.howToEarn,
    this.awardedAt,
    this.detail,
  });

  final String name;
  final String description;
  final String icon; // emoji fallback
  final bool earned;
  final String? imageUrl;
  final String? howToEarn;
  final DateTime? awardedAt;

  /// Context line for earned PR-style badges, e.g. "Bench Press · 75kg".
  final String? detail;

  factory Badge.fromEarned(Map<String, dynamic> json) {
    final def = (json['badgeDefinition'] as Map?) ?? const {};
    final meta = json['metadata'] as Map?;
    String? detail;
    if (meta != null) {
      final ex = meta['exerciseName'];
      final w = _asDouble(meta['weightKg']);
      final parts = <String>[
        if (ex is String && ex.isNotEmpty) ex,
        if (w != null) '${_trimDouble(w)}kg',
      ];
      if (parts.isNotEmpty) detail = parts.join(' · ');
    }
    return Badge(
      name: (def['name'] ?? 'Badge') as String,
      description: (def['description'] ?? '') as String,
      icon: (def['icon'] ?? '🏅') as String,
      imageUrl: def['imageUrl'] as String?,
      howToEarn: def['howToEarn'] as String?,
      earned: true,
      awardedAt: _asDate(json['awardedAt']),
      detail: detail,
    );
  }

  factory Badge.fromLocked(Map<String, dynamic> json) => Badge(
        name: (json['name'] ?? 'Badge') as String,
        description: (json['description'] ?? '') as String,
        icon: (json['icon'] ?? '🔒') as String,
        imageUrl: json['imageUrl'] as String?,
        howToEarn: json['howToEarn'] as String?,
        earned: false,
      );
}

class BadgesData {
  const BadgesData({required this.earned, required this.locked});
  final List<Badge> earned;
  final List<Badge> locked;

  factory BadgesData.fromJson(Map<String, dynamic> json) => BadgesData(
        earned: (json['earned'] as List? ?? const [])
            .whereType<Map>()
            .map((m) => Badge.fromEarned(Map<String, dynamic>.from(m)))
            .toList(),
        locked: (json['locked'] as List? ?? const [])
            .whereType<Map>()
            .map((m) => Badge.fromLocked(Map<String, dynamic>.from(m)))
            .toList(),
      );
}

// ── Unavailability ──────────────────────────────────────────────────────────

class UnavailabilityDate {
  const UnavailabilityDate({required this.id, required this.date, this.reason});
  final String id;
  final DateTime date;
  final String? reason;

  factory UnavailabilityDate.fromJson(Map<String, dynamic> json) => UnavailabilityDate(
        id: json['id'] as String,
        date: _asDate(json['date']) ?? DateTime.fromMillisecondsSinceEpoch(0),
        reason: json['reason'] as String?,
      );
}

// ── Reschedule requests ─────────────────────────────────────────────────────

enum RescheduleStatus {
  pending,
  approved,
  rejected,
  unknown;

  static RescheduleStatus fromApi(Object? raw) => switch (raw) {
        'PENDING' => RescheduleStatus.pending,
        'APPROVED' => RescheduleStatus.approved,
        'REJECTED' => RescheduleStatus.rejected,
        _ => RescheduleStatus.unknown,
      };

  String get label => switch (this) {
        RescheduleStatus.pending => 'Pending',
        RescheduleStatus.approved => 'Approved',
        RescheduleStatus.rejected => 'Rejected',
        RescheduleStatus.unknown => 'Unknown',
      };
}

class RescheduleRequestItem {
  const RescheduleRequestItem({
    required this.id,
    required this.status,
    required this.requestedDate,
    required this.requestedTime,
    required this.createdAt,
    this.reason,
    this.reviewNotes,
    this.originalDate,
    this.originalTime,
    this.trainerName,
  });

  final String id;
  final RescheduleStatus status;
  final DateTime? requestedDate;
  final String requestedTime;
  final DateTime? createdAt;
  final String? reason;
  final String? reviewNotes;
  final DateTime? originalDate;
  final String? originalTime;
  final String? trainerName;

  factory RescheduleRequestItem.fromJson(Map<String, dynamic> json) {
    final si = json['sessionInstance'] as Map?;
    final trainerUser = (si?['trainer'] as Map?)?['user'] as Map?;
    final name = trainerUser == null
        ? null
        : '${trainerUser['firstName'] ?? ''} ${trainerUser['lastName'] ?? ''}'.trim();
    return RescheduleRequestItem(
      id: json['id'] as String,
      status: RescheduleStatus.fromApi(json['status']),
      requestedDate: _asDate(json['requestedDate']),
      requestedTime: (json['requestedTime'] ?? '') as String,
      createdAt: _asDate(json['createdAt']),
      reason: json['reason'] as String?,
      reviewNotes: json['reviewNotes'] as String?,
      originalDate: _asDate(si?['scheduledDate']),
      originalTime: si?['scheduledTime'] as String?,
      trainerName: (name?.isEmpty ?? true) ? null : name,
    );
  }
}
