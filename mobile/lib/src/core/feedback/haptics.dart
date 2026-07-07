import 'package:flutter/services.dart';
import 'package:haptic_feedback/haptic_feedback.dart' as hf;

import 'feedback_prefs.dart';

/// Central, semantic haptic vocabulary for the app — call these instead of
/// `HapticFeedback.*` directly so every buzz is consistent and globally
/// silenceable via the Settings toggle ([FeedbackPrefs.hapticsEnabled]).
///
/// The four "impact" tiers map to Flutter's built-in [HapticFeedback] (snappy,
/// dependency-free). The three "notification" tiers ([success]/[warning]/
/// [error]) use the `haptic_feedback` package so iOS plays the authentic
/// `UINotificationFeedbackGenerator` patterns Flutter doesn't expose; they fall
/// back to a built-in impact where the device can't perform them.
class Haptics {
  Haptics._();

  /// Whether the device supports the richer notification patterns. Resolved once
  /// in [init]; null until then ⇒ treat as "unknown" and use the fallback.
  static bool? _canVibrate;

  /// Probe the device's haptic capability once at startup. Cheap and best-effort
  /// — a failure just routes the notification tiers through their fallback.
  static Future<void> init() async {
    try {
      _canVibrate = await hf.Haptics.canVibrate();
    } catch (_) {
      _canVibrate = false;
    }
  }

  static bool get _on => FeedbackPrefs.hapticsEnabled;

  /// Lightest tick — selection / navigation (tab change, expand a card, pick a
  /// calendar day, choose a preset/chip).
  static void select() {
    if (_on) HapticFeedback.selectionClick();
  }

  /// Light — secondary / icon buttons, opening a sheet or dialog, add / skip
  /// actions, pull-to-refresh.
  static void tap() {
    if (_on) HapticFeedback.lightImpact();
  }

  /// Medium — primary CTAs (login, save, start session, confirm a dialog,
  /// complete a single set).
  static void primary() {
    if (_on) HapticFeedback.mediumImpact();
  }

  /// Heavy — weighty / destructive actions (end session, mark no-show, delete).
  static void impact() {
    if (_on) HapticFeedback.heavyImpact();
  }

  /// Success notification — an exercise completed, a PR / badge unlocked, a save
  /// that reached the server.
  static void success() =>
      _notify(hf.HapticsType.success, HapticFeedback.mediumImpact);

  /// Warning notification — a blocked or reversible-but-notable action.
  static void warning() =>
      _notify(hf.HapticsType.warning, HapticFeedback.mediumImpact);

  /// Error notification — a failed action (e.g. a rejected sync).
  static void error() =>
      _notify(hf.HapticsType.error, HapticFeedback.heavyImpact);

  /// A light tick the moment a pull-to-refresh is released past its threshold,
  /// then runs [run] (whose future drives the spinner). Use as
  /// `onRefresh: () => Haptics.onRefresh(run)`.
  static Future<void> onRefresh(Future<void> Function() run) {
    tap();
    return run();
  }

  static void _notify(hf.HapticsType type, void Function() fallback) {
    if (!_on) return;
    if (_canVibrate == true) {
      hf.Haptics.vibrate(type); // fire-and-forget; the package no-ops if unsupported
    } else {
      fallback();
    }
  }
}
