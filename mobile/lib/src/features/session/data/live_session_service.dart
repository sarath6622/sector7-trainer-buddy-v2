import 'dart:io' show Platform;

import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:live_activities/live_activities.dart';
import 'package:timezone/data/latest.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;

import '../domain/live_session_content.dart';

/// Drives the lock-screen surface for the live session: an **iOS Live Activity**
/// (via the `live_activities` ActivityKit bridge) and an **Android ongoing
/// notification** (via `flutter_local_notifications`), plus a cross-platform
/// **scheduled "Rest complete" alert** that buzzes even if the app is killed.
///
/// Role-agnostic — the same [LiveSessionContent] is projected for the client and
/// the trainer; the binder ([SessionLiveActivityBinder]) feeds it from the
/// existing rest-timer / pause providers.
///
/// No paid Apple account is assumed: the Live Activity is created with remote
/// updates **off** (so no Push Notifications capability is required). The rest
/// countdown self-ticks on the lock screen via SwiftUI `Text(timerInterval:)`
/// (iOS) / chronometer (Android) without code running, and the rest-done buzz is
/// a scheduled local notification — so the experience holds while locked.
class LiveSessionService {
  LiveSessionService(this._notifications, this._live);

  final FlutterLocalNotificationsPlugin _notifications;
  final LiveActivities _live;

  // Shared with the Swift widget entitlement + Runner App Group.
  static const _appGroupId = 'group.com.sector7.sector7_mobile.liveactivities';

  // Channels.
  static const _ongoingChannelId = 'sector7_active_session';
  static const _restDoneChannelId = 'sector7_rest_done';

  // Stable notification ids (one live session at a time on this device).
  static const _ongoingNotifId = 7001;
  static const _restDoneNotifId = 7002;

  bool _ready = false;

  /// Native ActivityKit id returned by `createActivity` — used to update / end.
  String? _iosActivityId;

  /// The session currently projected, and its last-pushed structural signature
  /// (skips redundant surface pushes — the timer self-ticks between them).
  String? _sessionId;
  String? _lastSignature;

  /// The rest end (device-clock ms) the "Rest complete" buzz is currently armed
  /// for, or null when none is pending. Lets us cancel a buzz only when the rest
  /// is cut short (stopped/paused early) — never when it elapses naturally.
  int? _scheduledRestEndMs;

  /// One-time setup: timezone DB (for scheduling), notification channels, and
  /// the ActivityKit App Group. Safe to call once at startup. Permission is
  /// requested separately via [requestPermissions].
  Future<void> init() async {
    if (_ready) return;
    try {
      tzdata.initializeTimeZones();

      const android = AndroidInitializationSettings('@mipmap/ic_launcher');
      const darwin = DarwinInitializationSettings(
        // We request explicitly (and lazily) via [requestPermissions] instead.
        requestAlertPermission: false,
        requestBadgePermission: false,
        requestSoundPermission: false,
      );
      await _notifications.initialize(
        settings: const InitializationSettings(android: android, iOS: darwin),
      );

      final androidImpl = _notifications.resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin>();
      await androidImpl?.createNotificationChannel(
        const AndroidNotificationChannel(
          _ongoingChannelId,
          'Active session',
          description: 'Shows your live session on the lock screen.',
          importance: Importance.low,
          playSound: false,
          enableVibration: false,
        ),
      );
      await androidImpl?.createNotificationChannel(
        const AndroidNotificationChannel(
          _restDoneChannelId,
          'Rest timer',
          description: 'Alerts you when a rest period is complete.',
          importance: Importance.high,
        ),
      );

      if (Platform.isIOS) {
        await _live.init(appGroupId: _appGroupId);
      }
      _ready = true;
    } catch (e, st) {
      debugPrint('LiveSessionService.init failed: $e\n$st');
    }
  }

  /// Requests notification permission (and exact-alarm on Android 12+). Call
  /// when a session first goes live so the prompt has context.
  Future<void> requestPermissions() async {
    try {
      if (Platform.isIOS) {
        await _notifications
            .resolvePlatformSpecificImplementation<
                IOSFlutterLocalNotificationsPlugin>()
            ?.requestPermissions(alert: true, badge: true, sound: true);
      } else if (Platform.isAndroid) {
        final android = _notifications.resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>();
        await android?.requestNotificationsPermission();
        await android?.requestExactAlarmsPermission();
      }
    } catch (e) {
      debugPrint('LiveSessionService.requestPermissions failed: $e');
    }
  }

  /// Projects [content] for [sessionId]. Starts the surface on first sight of a
  /// session, tears down a previous one if the session changed, and otherwise
  /// updates only when the structural [LiveSessionContent.signature] moved.
  /// Always (re)arms the scheduled rest-done alert.
  Future<void> sync(String sessionId, LiveSessionContent content) async {
    if (!_ready) return;
    try {
      if (_sessionId != sessionId) {
        await _teardown();
        _sessionId = sessionId;
        await _render(content, create: true);
      } else if (content.signature != _lastSignature) {
        await _render(content, create: false);
      } else {
        return; // nothing structural changed — the surface self-ticks
      }
      _lastSignature = content.signature;
      await _scheduleRestDone(content);
    } catch (e) {
      debugPrint('LiveSessionService.sync failed: $e');
    }
  }

  /// Tears the surface down — call when the session ends or the screen leaves.
  Future<void> end() async {
    try {
      await _teardown();
    } catch (e) {
      debugPrint('LiveSessionService.end failed: $e');
    }
  }

  // ── internals ──────────────────────────────────────────────────────────────

  Future<void> _render(LiveSessionContent content, {required bool create}) async {
    if (Platform.isIOS) {
      if (create || _iosActivityId == null) {
        _iosActivityId = await _live.createActivity(
          _sessionId!,
          content.toActivityData(),
          // No Push Notifications capability (no paid account) → keep it local.
          iOSEnableRemoteUpdates: false,
          removeWhenAppIsKilled: true,
        );
      } else {
        await _live.updateActivity(_iosActivityId!, content.toActivityData());
      }
    } else if (Platform.isAndroid) {
      await _showAndroidOngoing(content);
    }
  }

  Future<void> _teardown() async {
    if (Platform.isIOS && _iosActivityId != null) {
      await _live.endActivity(_iosActivityId!);
    } else if (Platform.isAndroid) {
      await _notifications.cancel(id: _ongoingNotifId);
    }
    await _notifications.cancel(id: _restDoneNotifId);
    _iosActivityId = null;
    _sessionId = null;
    _lastSignature = null;
    _scheduledRestEndMs = null;
  }

  /// The Android lock-screen "live" surface: an ongoing notification whose
  /// chronometer the system ticks itself — counting **down** to the rest end
  /// while resting, otherwise counting **up** the elapsed session time.
  Future<void> _showAndroidOngoing(LiveSessionContent content) async {
    final resting = content.isResting && content.restEndMs != null;
    final details = AndroidNotificationDetails(
      _ongoingChannelId,
      'Active session',
      channelDescription: 'Shows your live session on the lock screen.',
      importance: Importance.low,
      priority: Priority.low,
      ongoing: true,
      autoCancel: false,
      onlyAlertOnce: true,
      playSound: false,
      enableVibration: false,
      category: AndroidNotificationCategory.workout,
      visibility: NotificationVisibility.public,
      usesChronometer: !content.isPaused,
      chronometerCountDown: resting,
      when: content.isPaused
          ? null
          : (resting ? content.restEndMs : content.startedAtMs),
      showWhen: !content.isPaused,
    );
    final body = content.statusDetail.isEmpty
        ? content.statusWord
        : content.statusDetail;
    await _notifications.show(
      id: _ongoingNotifId,
      title: content.workoutTitle,
      body: body,
      notificationDetails: NotificationDetails(android: details),
    );
  }

  /// Arms (or cancels) the "Rest complete" buzz for the current rest end.
  ///
  /// Keyed by the rest end so a quiet re-sync doesn't churn the alarm. Crucially,
  /// when no rest is running we only cancel a *still-pending* buzz (rest stopped
  /// or paused before its end) — once the end has passed we leave the buzz to
  /// fire/stand, so a naturally-completed rest still alerts even though the app
  /// has already flipped to "rest done".
  Future<void> _scheduleRestDone(LiveSessionContent content) async {
    final now = DateTime.now().millisecondsSinceEpoch;
    final end = content.restEndMs;

    if (content.isResting && end != null && end > now + 500) {
      if (_scheduledRestEndMs == end) return; // already armed for this end
      await _notifications.cancel(id: _restDoneNotifId);
      final when = tz.TZDateTime.fromMillisecondsSinceEpoch(tz.local, end);
      await _notifications.zonedSchedule(
        id: _restDoneNotifId,
        title: 'Rest complete',
        body: 'Back to ${content.workoutTitle}',
        scheduledDate: when,
        notificationDetails: const NotificationDetails(
          android: AndroidNotificationDetails(
            _restDoneChannelId,
            'Rest timer',
            channelDescription: 'Alerts you when a rest period is complete.',
            importance: Importance.high,
            priority: Priority.high,
            category: AndroidNotificationCategory.alarm,
          ),
          iOS: DarwinNotificationDetails(
            interruptionLevel: InterruptionLevel.timeSensitive,
          ),
        ),
        androidScheduleMode: AndroidScheduleMode.exactAllowWhileIdle,
      );
      _scheduledRestEndMs = end;
      return;
    }

    // No rest running. Cancel a pending buzz only if it was cut short (>~1s
    // before its end); if the end has effectively arrived, let it fire.
    final scheduled = _scheduledRestEndMs;
    if (scheduled != null && now < scheduled - 1000) {
      await _notifications.cancel(id: _restDoneNotifId);
    }
    _scheduledRestEndMs = null;
  }
}

/// App-wide singleton — created once, initialised from `main`.
final liveSessionServiceProvider = Provider<LiveSessionService>((ref) {
  return LiveSessionService(FlutterLocalNotificationsPlugin(), LiveActivities());
});
