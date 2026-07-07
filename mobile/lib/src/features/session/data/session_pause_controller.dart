import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';
import '../../../core/realtime/pusher_service.dart';
import '../../auth/application/auth_controller.dart';
import '../domain/session_pause_state.dart';

/// The live pause state plus the tracked clock skew (serverNow - clientNow) for
/// one session.
class SessionPauseSnapshot {
  const SessionPauseSnapshot(this.pause, this.skewMs);
  final SessionPauseState pause;
  final int skewMs;

  @override
  bool operator ==(Object other) =>
      other is SessionPauseSnapshot &&
      other.pause == pause &&
      other.skewMs == skewMs;

  @override
  int get hashCode => Object.hash(pause, skewMs);
}

/// Keeps a session's pause state in lockstep across the trainer and client
/// devices — either side can pause/resume (e.g. the trainer steps away for a
/// call). Hydrates from `GET /api/sessions/[id]/pause`, subscribes to
/// `SESSION_PAUSE_UPDATED` on `session-{id}`, and runs a 30s keepalive.
/// [toggle] flips pause↔resume via a single bodyless POST; the server is the
/// source of truth for direction. Mirrors the web `useSessionPause` hook.
class SessionPauseController
    extends AutoDisposeFamilyNotifier<SessionPauseSnapshot, String> {
  Timer? _keepalive;
  StreamSubscription<RealtimeEvent>? _sub;
  bool _disposed = false;

  ApiClient get _api => ref.read(apiClientProvider);
  PusherService get _pusher => ref.read(pusherServiceProvider);
  int get _now => DateTime.now().millisecondsSinceEpoch;
  String get _channel => 'session-$arg';

  @override
  SessionPauseSnapshot build(String sessionId) {
    ref.onDispose(() {
      _disposed = true;
      _keepalive?.cancel();
      _sub?.cancel();
      _pusher.unsubscribe(_channel);
    });

    _subscribe();
    unawaited(_hydrate());
    _keepalive = Timer.periodic(const Duration(seconds: 30), (_) => _hydrate());

    return const SessionPauseSnapshot(SessionPauseState.empty, 0);
  }

  void _subscribe() {
    if (!_pusher.enabled) return;
    _pusher.subscribe(_channel);
    _sub = _pusher.events
        .where((e) =>
            e.channelName == _channel && e.eventName == 'SESSION_PAUSE_UPDATED')
        .listen((e) => _applyServer(
              SessionPauseState.fromJson(e.data),
              serverNow: _intOrNull(e.data['serverNow']),
            ));
  }

  Future<void> _hydrate() async {
    try {
      final body = await _api.getRaw('/sessions/$arg/pause');
      if (body is! Map) return;
      final data = body['data'];
      final next = data is Map
          ? SessionPauseState.fromJson(Map<String, dynamic>.from(data))
          : SessionPauseState.empty;
      _applyServer(next, serverNow: _intOrNull(body['serverNow']));
    } catch (_) {
      // silent — keepalive / push reconciles
    }
  }

  Future<void> toggle() async {
    if (_disposed) return;
    final optimistic = state.pause.toggleOptimistic(_now, state.skewMs);
    state = SessionPauseSnapshot(state.pause.merge(optimistic), state.skewMs);
    try {
      final body = await _api.postRaw('/sessions/$arg/pause');
      if (body is Map && body['data'] is Map) {
        _applyServer(
          SessionPauseState.fromJson(Map<String, dynamic>.from(body['data'])),
          serverNow: _intOrNull(body['serverNow']),
        );
      }
    } catch (_) {
      // silent — a push echo or the keepalive reconciles
    }
  }

  void _applyServer(SessionPauseState next, {int? serverNow}) {
    if (_disposed) return;
    final skew = serverNow != null
        ? serverNow - DateTime.now().millisecondsSinceEpoch
        : state.skewMs;
    state = SessionPauseSnapshot(state.pause.merge(next), skew);
  }

  static int? _intOrNull(dynamic v) => v is num ? v.toInt() : null;
}

final sessionPauseControllerProvider = NotifierProvider.autoDispose
    .family<SessionPauseController, SessionPauseSnapshot, String>(
        SessionPauseController.new);
