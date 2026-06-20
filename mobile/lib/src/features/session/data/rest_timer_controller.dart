import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';
import '../../../core/realtime/pusher_service.dart';
import '../../auth/application/auth_controller.dart';
import '../domain/rest_timer_state.dart';

/// The live rest-timer plus the tracked clock skew for one session. The skew
/// (serverNow - clientNow) lets the UI compute the countdown in server time.
class RestTimerSnapshot {
  const RestTimerSnapshot(this.timer, this.skewMs);
  final RestTimerState timer;
  final int skewMs;

  @override
  bool operator ==(Object other) =>
      other is RestTimerSnapshot &&
      other.timer == timer &&
      other.skewMs == skewMs;

  @override
  int get hashCode => Object.hash(timer, skewMs);
}

/// Keeps a session's rest timer in sync across devices. On build it hydrates
/// from `GET /api/sessions/[id]/rest-timer`, subscribes to `REST_TIMER_UPDATED`
/// on the public `session-{id}` Pusher channel, and runs a 30s keepalive
/// (Pusher-down fallback — same cadence as the web hook). Mutations apply
/// optimistically then reconcile against the server echo via the monotonic
/// `updatedAt` guard.
///
/// The countdown is NOT ticked here — the provider only updates on real state
/// changes (hydrate / push / mutation). The pill + sheet widgets run their own
/// 1Hz [Timer] and recompute `remaining` locally, like [LiveSessionTimer].
class RestTimerController
    extends AutoDisposeFamilyNotifier<RestTimerSnapshot, String> {
  Timer? _keepalive;
  StreamSubscription<RealtimeEvent>? _sub;
  bool _disposed = false;

  ApiClient get _api => ref.read(apiClientProvider);
  PusherService get _pusher => ref.read(pusherServiceProvider);
  int get _now => DateTime.now().millisecondsSinceEpoch;
  String get _channel => 'session-$arg';

  @override
  RestTimerSnapshot build(String sessionId) {
    ref.onDispose(() {
      _disposed = true;
      _keepalive?.cancel();
      _sub?.cancel();
      _pusher.unsubscribe(_channel);
    });

    _subscribe();
    unawaited(_hydrate());
    _keepalive = Timer.periodic(const Duration(seconds: 30), (_) => _hydrate());

    return const RestTimerSnapshot(RestTimerState.empty, 0);
  }

  void _subscribe() {
    if (!_pusher.enabled) return;
    _pusher.subscribe(_channel);
    _sub = _pusher.events
        .where((e) =>
            e.channelName == _channel && e.eventName == 'REST_TIMER_UPDATED')
        .listen((e) => _applyServer(
              RestTimerState.fromJson(e.data),
              serverNow: _intOrNull(e.data['serverNow']),
            ));
  }

  Future<void> _hydrate() async {
    try {
      final body = await _api.getRaw('/sessions/$arg/rest-timer');
      if (body is! Map) return;
      final data = body['data'];
      final next = data is Map
          ? RestTimerState.fromJson(Map<String, dynamic>.from(data))
          : RestTimerState.empty;
      _applyServer(next, serverNow: _intOrNull(body['serverNow']));
    } catch (_) {
      // silent — the keepalive (or a push event) will reconcile
    }
  }

  // ── Mutations ──────────────────────────────────────────────────────────────

  Future<void> start(int seconds) =>
      _mutate(state.timer.startMutation(seconds, _now, state.skewMs));

  Future<void> pause() {
    final m = state.timer.pauseMutation(_now, state.skewMs);
    return m != null ? _mutate(m) : Future.value();
  }

  Future<void> resume() {
    final m = state.timer.resumeMutation(_now, state.skewMs);
    return m != null ? _mutate(m) : Future.value();
  }

  Future<void> stop() => _mutate(state.timer.stopMutation(_now, state.skewMs));

  Future<void> _mutate(RestTimerMutation m) async {
    _applyOptimistic(m.optimistic);
    try {
      if (m.isStop) {
        // DELETE returns { data: null } with no serverNow — the optimistic
        // clear stands; a stray peer echo with a newer updatedAt would win.
        await _api.deleteRaw('/sessions/$arg/rest-timer');
        return;
      }
      final body = await _api.putRaw('/sessions/$arg/rest-timer', body: m.body);
      if (body is Map && body['data'] is Map) {
        _applyServer(
          RestTimerState.fromJson(Map<String, dynamic>.from(body['data'])),
          serverNow: _intOrNull(body['serverNow']),
        );
      }
    } catch (_) {
      // silent — a push echo or the keepalive reconciles
    }
  }

  void _applyServer(RestTimerState next, {int? serverNow}) {
    if (_disposed) return;
    final skew = serverNow != null
        ? serverNow - DateTime.now().millisecondsSinceEpoch
        : state.skewMs;
    state = RestTimerSnapshot(state.timer.merge(next), skew);
  }

  void _applyOptimistic(RestTimerState next) {
    if (_disposed) return;
    state = RestTimerSnapshot(state.timer.merge(next), state.skewMs);
  }

  static int? _intOrNull(dynamic v) => v is num ? v.toInt() : null;
}

final restTimerControllerProvider = NotifierProvider.autoDispose
    .family<RestTimerController, RestTimerSnapshot, String>(
        RestTimerController.new);
