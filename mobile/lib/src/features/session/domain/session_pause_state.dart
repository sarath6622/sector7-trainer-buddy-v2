import 'dart:math' as math;

/// Server-driven session pause state. `pausedAt` is server-clock ms (null while
/// running); `accumulatedPausedSec` is the total paused time across all
/// pause/resume cycles. Mirrors the web `useSessionPause` hook and the wire
/// shape of `GET/POST /api/sessions/[id]/pause` (see memory/api-contracts.md).
///
/// Pure (no IO) so the accumulation / skew / toggle math is unit testable.
class SessionPauseState {
  const SessionPauseState({
    required this.pausedAt,
    required this.accumulatedPausedSec,
    required this.updatedAt,
  });

  /// Server-clock ms the current pause segment began. Null ⇒ running.
  final int? pausedAt;

  /// Total seconds paused across completed pause/resume cycles (excludes any
  /// in-flight segment — add that via [totalPausedSec]).
  final int accumulatedPausedSec;

  /// Server-clock ms of the last pause/resume (the `pauseUpdatedAt` column).
  final int updatedAt;

  static const empty = SessionPauseState(
    pausedAt: null,
    accumulatedPausedSec: 0,
    updatedAt: 0,
  );

  bool get isPaused => pausedAt != null;

  factory SessionPauseState.fromJson(Map<String, dynamic> json) {
    int? asInt(dynamic v) => v is num ? v.toInt() : null;
    return SessionPauseState(
      pausedAt: asInt(json['pausedAt']),
      accumulatedPausedSec: asInt(json['accumulatedPausedSec']) ?? 0,
      updatedAt: asInt(json['updatedAt']) ?? 0,
    );
  }

  /// Monotonic guard — same reasoning as [RestTimerState.merge].
  SessionPauseState merge(SessionPauseState next) =>
      next.updatedAt >= updatedAt ? next : this;

  /// Total paused seconds including any in-flight pause segment, given the
  /// local clock [nowMs] and [skewMs] (serverNow - clientNow).
  int totalPausedSec(int nowMs, int skewMs) {
    if (pausedAt == null) return accumulatedPausedSec;
    final live = math.max(0, ((nowMs + skewMs - pausedAt!) ~/ 1000));
    return accumulatedPausedSec + live;
  }

  /// Optimistic local result of toggling pause ↔ resume. The POST carries no
  /// body — the server decides direction from the persisted state — so this is
  /// just the local snap so the UI reacts instantly before the echo lands.
  SessionPauseState toggleOptimistic(int nowMs, int skewMs) {
    final at = nowMs + skewMs;
    if (pausedAt != null) {
      // resuming: fold the in-flight segment into the accumulator
      final live = math.max(0, ((at - pausedAt!) ~/ 1000));
      return SessionPauseState(
        pausedAt: null,
        accumulatedPausedSec: accumulatedPausedSec + live,
        updatedAt: at,
      );
    }
    return SessionPauseState(
      pausedAt: at,
      accumulatedPausedSec: accumulatedPausedSec,
      updatedAt: at,
    );
  }

  @override
  bool operator ==(Object other) =>
      other is SessionPauseState &&
      other.pausedAt == pausedAt &&
      other.accumulatedPausedSec == accumulatedPausedSec &&
      other.updatedAt == updatedAt;

  @override
  int get hashCode => Object.hash(pausedAt, accumulatedPausedSec, updatedAt);
}
