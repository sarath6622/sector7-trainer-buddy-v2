import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../features/auth/application/auth_controller.dart';
import 'pusher_service.dart';

/// Mixed into a session-detail [ConsumerState] to keep the screen in sync with
/// the live `session-{id}` Pusher channel (Phase 4). Call [startSessionRealtime]
/// from `initState` and [stopSessionRealtime] from `dispose`.
///
/// On `SESSION_STARTED` / `SESSION_ENDED` / `WORKOUT_UPDATED` it triggers
/// [onSessionChanged] so the screen refetches its detail provider — the server
/// stays the single source of truth, exactly like the web's WORKOUT_UPDATED →
/// refetch behavior. The writer's own `WORKOUT_UPDATED` echo is skipped
/// (`actorUserId == me`) since the saving screen already refreshed.
mixin SessionRealtimeMixin<T extends ConsumerStatefulWidget> on ConsumerState<T> {
  StreamSubscription<RealtimeEvent>? _rtSub;

  /// The session whose `session-{id}` channel to watch.
  String get realtimeSessionId;

  /// Invoked when a server-side change makes the cached detail stale.
  void onSessionChanged();

  void startSessionRealtime() {
    final svc = ref.read(pusherServiceProvider);
    if (!svc.enabled) return;
    final channel = 'session-$realtimeSessionId';
    svc.subscribe(channel);
    _rtSub = svc.events.where((e) => e.channelName == channel).listen(_handle);
  }

  void _handle(RealtimeEvent e) {
    if (!mounted) return;
    switch (e.eventName) {
      case 'WORKOUT_UPDATED':
        final actor = e.data['actorUserId'];
        final me = ref.read(authControllerProvider).user?.id;
        if (actor != null && actor == me) return; // our own save — already applied
        onSessionChanged();
      case 'SESSION_STARTED':
      case 'SESSION_ENDED':
        onSessionChanged();
    }
  }

  void stopSessionRealtime() {
    _rtSub?.cancel();
    _rtSub = null;
    ref.read(pusherServiceProvider).unsubscribe('session-$realtimeSessionId');
  }
}

/// A self-ticking "● LIVE  HH:MM:SS" pill showing elapsed time since the
/// session started. Ticks locally once a second — independent of Pusher, so an
/// already-in-progress session shows a running clock even offline.
class LiveSessionTimer extends StatefulWidget {
  const LiveSessionTimer({super.key, required this.startedAt});

  final DateTime startedAt;

  @override
  State<LiveSessionTimer> createState() => _LiveSessionTimerState();
}

class _LiveSessionTimerState extends State<LiveSessionTimer> {
  Timer? _ticker;

  @override
  void initState() {
    super.initState();
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  String _fmt(Duration d) {
    final neg = d.isNegative;
    final s = d.abs();
    String two(int n) => n.toString().padLeft(2, '0');
    final h = s.inHours;
    final text = h > 0
        ? '$h:${two(s.inMinutes % 60)}:${two(s.inSeconds % 60)}'
        : '${two(s.inMinutes % 60)}:${two(s.inSeconds % 60)}';
    return neg ? '0:00' : text;
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final elapsed = DateTime.now().difference(widget.startedAt);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: scheme.primary.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: scheme.primary.withValues(alpha: 0.4)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 8,
            height: 8,
            decoration: BoxDecoration(color: scheme.primary, shape: BoxShape.circle),
          ),
          const SizedBox(width: 8),
          Text(
            'LIVE',
            style: Theme.of(context).textTheme.labelSmall?.copyWith(
                  color: scheme.primary,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.5,
                ),
          ),
          const SizedBox(width: 8),
          Text(
            _fmt(elapsed),
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  color: scheme.primary,
                  fontWeight: FontWeight.w700,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
          ),
        ],
      ),
    );
  }
}
