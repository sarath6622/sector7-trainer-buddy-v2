import 'package:firebase_remote_config/firebase_remote_config.dart';

/// Typed accessor over Firebase Remote Config, with safe in-code defaults.
///
/// Holds a *nullable* [FirebaseRemoteConfig]: when Firebase failed to
/// initialise (offline first run, init error) the flags simply return their
/// defaults, so a Remote Config outage can never block or crash the app — the
/// same graceful-disable posture as the Pusher client (ADR-045/047).
class FeatureFlags {
  const FeatureFlags(this._rc);

  final FirebaseRemoteConfig? _rc;

  // ── Keys (mirror these exactly as parameters in the Firebase console) ──

  /// Minimum Android `versionCode` / iOS `CFBundleVersion` allowed to run.
  /// Builds below this hit the force-update gate. `0` disables the gate.
  static const String kMinSupportedBuild = 'min_supported_build';

  /// Optional operator copy shown on the force-update screen.
  static const String kUpdateMessage = 'update_message';

  /// Defaults registered with Remote Config (via `setDefaults`) and used as the
  /// in-code fallback. New boolean feature flags should default to OFF here.
  static const Map<String, dynamic> defaults = <String, dynamic>{
    kMinSupportedBuild: 0,
    kUpdateMessage: '',
  };

  int get minSupportedBuild =>
      _rc?.getInt(kMinSupportedBuild) ?? defaults[kMinSupportedBuild] as int;

  String get updateMessage {
    final v = _rc?.getString(kUpdateMessage) ?? '';
    return v.isNotEmpty
        ? v
        : 'A newer version is required to keep using Sector 7.';
  }

  /// Generic boolean feature flag — defaults to false when unset remotely.
  bool isEnabled(String key) => _rc?.getBool(key) ?? false;
}
