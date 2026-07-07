import 'dart:async';
import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:pusher_channels_flutter/pusher_channels_flutter.dart';

import '../config/app_config.dart';

/// Normalize a raw Pusher payload to a map. Pusher delivers event data as a
/// JSON **string**; tolerate a pre-decoded map and anything malformed (→ `{}`)
/// so a surprise payload never throws on the event thread.
Map<String, dynamic> decodePusherData(dynamic raw) {
  if (raw is Map) return Map<String, dynamic>.from(raw);
  if (raw is String && raw.isNotEmpty) {
    try {
      final decoded = jsonDecode(raw);
      return decoded is Map ? Map<String, dynamic>.from(decoded) : <String, dynamic>{};
    } catch (_) {
      return <String, dynamic>{};
    }
  }
  return <String, dynamic>{};
}

/// A decoded Pusher event, narrowed to what the app cares about.
class RealtimeEvent {
  const RealtimeEvent({
    required this.channelName,
    required this.eventName,
    required this.data,
  });

  final String channelName;
  final String eventName;
  final Map<String, dynamic> data;
}

/// Thin wrapper over [PusherChannelsFlutter] for the app's **public** real-time
/// channels (`session-{id}`, `user-{id}`). Reuses the same Pusher app the web
/// console uses; the channels carry no `private-`/`presence-` prefix, so no
/// auth endpoint is required (Phase 4 — see docs/flutter-migration-plan.md §6).
///
/// Lifecycle: the native client is `init()`-ed + `connect()`-ed lazily on the
/// first [subscribe]. Channels are reference-counted so two overlapping
/// subscribers (e.g. a list + a detail screen) share one subscription and the
/// last [unsubscribe] tears it down. Every event is fanned out on a single
/// broadcast [events] stream; callers filter by channel + event name.
///
/// When [AppConfig.pusherEnabled] is false (no build-time PUSHER_KEY/CLUSTER)
/// every method is a no-op and [events] never emits — the UI degrades to
/// manual pull-to-refresh, mirroring the web's null Pusher client.
class PusherService {
  PusherService();

  final _events = StreamController<RealtimeEvent>.broadcast();
  final _refCounts = <String, int>{};

  /// Guards the one-shot native `init()` (calling it twice throws). Resolves
  /// `true` once connected, `false` if init/connect failed (we then stay quiet
  /// rather than crash the screen).
  Completer<bool>? _ready;

  Stream<RealtimeEvent> get events => _events.stream;

  bool get enabled => AppConfig.pusherEnabled;

  Future<bool> _ensureConnected() {
    final existing = _ready;
    if (existing != null) return existing.future;

    final completer = Completer<bool>();
    _ready = completer;
    () async {
      try {
        final pusher = PusherChannelsFlutter.getInstance();
        await pusher.init(
          apiKey: AppConfig.pusherKey,
          cluster: AppConfig.pusherCluster,
          useTLS: true,
          onEvent: _onEvent,
        );
        await pusher.connect();
        completer.complete(true);
      } catch (_) {
        completer.complete(false);
      }
    }();
    return completer.future;
  }

  void _onEvent(PusherEvent event) {
    _events.add(RealtimeEvent(
      channelName: event.channelName,
      eventName: event.eventName,
      data: decodePusherData(event.data),
    ));
  }

  /// Subscribe to [channelName] (reference-counted). Safe to call repeatedly.
  Future<void> subscribe(String channelName) async {
    if (!enabled) return;
    if (!await _ensureConnected()) return;

    final next = (_refCounts[channelName] ?? 0) + 1;
    _refCounts[channelName] = next;
    if (next == 1) {
      try {
        await PusherChannelsFlutter.getInstance()
            .subscribe(channelName: channelName);
      } catch (_) {
        // Leave the refcount as-is; the matching unsubscribe stays balanced.
      }
    }
  }

  /// Release one reference to [channelName]; tears the subscription down once
  /// no subscribers remain.
  Future<void> unsubscribe(String channelName) async {
    if (!enabled) return;
    final current = _refCounts[channelName] ?? 0;
    if (current <= 1) {
      _refCounts.remove(channelName);
      try {
        await PusherChannelsFlutter.getInstance()
            .unsubscribe(channelName: channelName);
      } catch (_) {}
    } else {
      _refCounts[channelName] = current - 1;
    }
  }
}

/// App-wide singleton. The native Pusher client is a process-global, so this
/// must not be auto-disposed.
final pusherServiceProvider = Provider<PusherService>((ref) => PusherService());
