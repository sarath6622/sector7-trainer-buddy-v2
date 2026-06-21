import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/live_session_service.dart';
import '../data/rest_timer_controller.dart';
import '../data/session_pause_controller.dart';
import '../domain/live_session_content.dart';

/// Bridges the live session into the lock-screen surface ([LiveSessionService]).
/// Drop it into the `inProgress` branch of a session-detail screen around the
/// [SessionHeroCard]: it starts the iOS Live Activity / Android ongoing
/// notification on mount, keeps it in sync with the rest-timer and pause state,
/// and tears it down on dispose (session ended or screen left).
///
/// Role-agnostic — the client and trainer screens both use it, passing the
/// person name and the focus-derived workout title they already hold.
class SessionLiveActivityBinder extends ConsumerStatefulWidget {
  const SessionLiveActivityBinder({
    super.key,
    required this.sessionId,
    required this.name,
    required this.startedAt,
    required this.workoutTitle,
    this.lastActivityMs,
    required this.child,
  });

  final String sessionId;

  /// Trainer name on the client screen, client name on the trainer screen.
  final String name;
  final DateTime startedAt;

  /// Focus-derived workout name ("Chest Day") from the logger's title callback.
  final String workoutTitle;

  /// Most-recent set timestamp (ms) for the idle escalation; null suppresses it.
  final int? lastActivityMs;

  final Widget child;

  @override
  ConsumerState<SessionLiveActivityBinder> createState() =>
      _SessionLiveActivityBinderState();
}

class _SessionLiveActivityBinderState
    extends ConsumerState<SessionLiveActivityBinder> {
  // Cached so dispose() never touches `ref` after teardown (Riverpod throws on
  // ref-after-dispose — same trap fixed in SessionRealtimeMixin).
  late final LiveSessionService _service;
  Timer? _ticker;

  @override
  void initState() {
    super.initState();
    _service = ref.read(liveSessionServiceProvider);
    // A live session is the natural moment to ask for notification permission.
    _service.requestPermissions();
    // Push once on mount, then a slow tick catches the time-based transitions
    // (rest hitting zero, idle escalation) that fire no provider event. The
    // countdown itself self-ticks on the surface, so this needn't be 1Hz; sync
    // dedupes by signature so quiet ticks are free.
    WidgetsBinding.instance.addPostFrameCallback((_) => _pump());
    _ticker = Timer.periodic(const Duration(seconds: 5), (_) => _pump());
  }

  @override
  void didUpdateWidget(SessionLiveActivityBinder old) {
    super.didUpdateWidget(old);
    if (old.workoutTitle != widget.workoutTitle ||
        old.name != widget.name ||
        old.sessionId != widget.sessionId ||
        old.lastActivityMs != widget.lastActivityMs) {
      _pump();
    }
  }

  @override
  void dispose() {
    _ticker?.cancel();
    _service.end();
    super.dispose();
  }

  void _pump() {
    if (!mounted) return;
    final restSnap = ref.read(restTimerControllerProvider(widget.sessionId));
    final pauseSnap = ref.read(sessionPauseControllerProvider(widget.sessionId));
    final content = LiveSessionContent.from(
      personName: widget.name,
      workoutTitle: widget.workoutTitle,
      startedAt: widget.startedAt,
      timer: restSnap.timer,
      isPaused: pauseSnap.pause.isPaused,
      nowMs: DateTime.now().millisecondsSinceEpoch,
      skewMs: restSnap.skewMs,
      lastActivityMs: widget.lastActivityMs,
    );
    _service.sync(widget.sessionId, content);
  }

  @override
  Widget build(BuildContext context) {
    // Push immediately when the rest timer or pause state changes.
    ref.listen(restTimerControllerProvider(widget.sessionId), (_, _) => _pump());
    ref.listen(
        sessionPauseControllerProvider(widget.sessionId), (_, _) => _pump());
    return widget.child;
  }
}
