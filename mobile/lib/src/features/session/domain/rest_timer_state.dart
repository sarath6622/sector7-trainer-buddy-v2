import 'dart:math' as math;

/// Server-driven rest-timer state for a session. All timestamps are in
/// **server-clock ms** — the live countdown is computed against a tracked
/// `skew = serverNow - clientNow` so trainer and client devices agree on the
/// remaining time regardless of phone wall-clock drift.
///
/// Mirrors the web `useRestTimer` hook's `RestTimerState` and the wire shape of
/// `GET/PUT /api/sessions/[id]/rest-timer` (see memory/api-contracts.md). This
/// class is pure (no IO) so the countdown / skew / monotonic-merge math is unit
/// testable without timers or a network.
class RestTimerState {
  const RestTimerState({
    required this.endTime,
    required this.pausedRemaining,
    required this.total,
    required this.updatedAt,
  });

  /// Server-clock ms when the countdown hits zero. Null while paused/cleared.
  final int? endTime;

  /// Frozen seconds remaining while paused. Null while running/cleared.
  /// Mutually exclusive with [endTime] (server-enforced).
  final int? pausedRemaining;

  /// Full duration in seconds the timer was started with — drives [progress].
  final int? total;

  /// Server-clock ms of the last mutation. Advances monotonically per session.
  final int updatedAt;

  static const empty = RestTimerState(
    endTime: null,
    pausedRemaining: null,
    total: null,
    updatedAt: 0,
  );

  bool get isCleared => endTime == null && pausedRemaining == null;
  bool get isPaused => pausedRemaining != null;

  factory RestTimerState.fromJson(Map<String, dynamic> json) {
    int? asInt(dynamic v) => v is num ? v.toInt() : null;
    return RestTimerState(
      endTime: asInt(json['endTime']),
      pausedRemaining: asInt(json['pausedRemaining']),
      total: asInt(json['total']),
      updatedAt: asInt(json['updatedAt']) ?? 0,
    );
  }

  RestTimerState copyWith({int? updatedAt}) => RestTimerState(
        endTime: endTime,
        pausedRemaining: pausedRemaining,
        total: total,
        updatedAt: updatedAt ?? this.updatedAt,
      );

  /// Returns whichever of `this` / [next] carries the newer `updatedAt`. The
  /// server's `updatedAt` advances monotonically per session, so a late Pusher
  /// event, a stale hydrate, or our own optimistic write loses cleanly to
  /// anything fresher — mirrors the web hook's monotonic guard.
  RestTimerState merge(RestTimerState next) =>
      next.updatedAt >= updatedAt ? next : this;

  /// Seconds remaining given the local clock [nowMs] and [skewMs]
  /// (serverNow - clientNow). Null when no timer is set; clamped at 0.
  int? remaining(int nowMs, int skewMs) {
    if (pausedRemaining != null) return pausedRemaining;
    if (endTime != null) {
      final r = ((endTime! - (nowMs + skewMs)) / 1000).round();
      return r > 0 ? r : 0;
    }
    return null;
  }

  bool isRunning(int nowMs, int skewMs) {
    final r = remaining(nowMs, skewMs);
    return endTime != null && r != null && r > 0;
  }

  /// True once a running countdown has reached zero (not when merely cleared).
  bool isDone(int nowMs, int skewMs) =>
      total != null && remaining(nowMs, skewMs) == 0;

  /// Fraction 0..1 of the timer still remaining — drives the depleting ring.
  /// 1.0 when idle so a fresh ring renders full.
  double progress(int nowMs, int skewMs) {
    final r = remaining(nowMs, skewMs);
    if (total == null || total == 0 || r == null) return 1;
    return (r / total!).clamp(0.0, 1.0);
  }

  // ── Mutation builders ─────────────────────────────────────────────────────
  // Each returns a [RestTimerMutation] bundling the optimistic local state with
  // the PUT/DELETE wire body, computed against the same clock so the two never
  // disagree. Mirror the web hook's start/pause/resume/stop exactly.

  RestTimerMutation startMutation(int seconds, int nowMs, int skewMs) {
    final at = nowMs + skewMs;
    final end = at + seconds * 1000;
    return RestTimerMutation(
      optimistic: RestTimerState(
        endTime: end,
        pausedRemaining: null,
        total: seconds,
        updatedAt: at,
      ),
      body: {'endTime': end, 'pausedRemaining': null, 'total': seconds},
    );
  }

  /// Null when there's nothing to pause (no running timer, or it already hit 0).
  RestTimerMutation? pauseMutation(int nowMs, int skewMs) {
    if (endTime == null) return null;
    final r = ((endTime! - (nowMs + skewMs)) / 1000).round();
    if (r <= 0) return null;
    final at = nowMs + skewMs;
    return RestTimerMutation(
      optimistic: RestTimerState(
        endTime: null,
        pausedRemaining: r,
        total: total,
        updatedAt: at,
      ),
      body: {'endTime': null, 'pausedRemaining': r, 'total': total},
    );
  }

  /// Null when there's nothing to resume (timer isn't paused).
  RestTimerMutation? resumeMutation(int nowMs, int skewMs) {
    if (pausedRemaining == null) return null;
    final at = nowMs + skewMs;
    final end = at + pausedRemaining! * 1000;
    return RestTimerMutation(
      optimistic: RestTimerState(
        endTime: end,
        pausedRemaining: null,
        total: total,
        updatedAt: at,
      ),
      body: {'endTime': end, 'pausedRemaining': null, 'total': total},
    );
  }

  RestTimerMutation stopMutation(int nowMs, int skewMs) {
    final at = nowMs + skewMs;
    return RestTimerMutation(
      optimistic: RestTimerState.empty.copyWith(updatedAt: at),
      body: null, // null body ⇒ DELETE
      isStop: true,
    );
  }

  @override
  bool operator ==(Object other) =>
      other is RestTimerState &&
      other.endTime == endTime &&
      other.pausedRemaining == pausedRemaining &&
      other.total == total &&
      other.updatedAt == updatedAt;

  @override
  int get hashCode => Object.hash(endTime, pausedRemaining, total, updatedAt);
}

/// The optimistic state + wire body for one rest-timer mutation. A null [body]
/// with [isStop] true means "DELETE the timer".
class RestTimerMutation {
  const RestTimerMutation({
    required this.optimistic,
    required this.body,
    this.isStop = false,
  });

  final RestTimerState optimistic;
  final Map<String, dynamic>? body;
  final bool isStop;
}

/// Formats whole seconds as `MM:SS` (the rest-timer display). Hours are never
/// needed — the server caps a timer at 3600s.
String formatMmSs(int seconds) {
  final s = math.max(0, seconds);
  String two(int n) => n.toString().padLeft(2, '0');
  return '${two(s ~/ 60)}:${two(s % 60)}';
}
