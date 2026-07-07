import 'package:firebase_remote_config/firebase_remote_config.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:package_info_plus/package_info_plus.dart';

import 'feature_flags.dart';

/// Initialises Remote Config and exposes the active [FeatureFlags].
class RemoteConfigService {
  const RemoteConfigService._();

  /// Fetches + activates Remote Config and returns the flags. Never throws — any
  /// failure (offline, Firebase not initialised) yields defaults-only flags so
  /// startup is never blocked.
  static Future<FeatureFlags> load() async {
    try {
      final rc = FirebaseRemoteConfig.instance;
      await rc.setConfigSettings(
        RemoteConfigSettings(
          fetchTimeout: const Duration(seconds: 10),
          // Beta cadence: at most one fetch per hour from cache; a relaunch or an
          // explicit refresh (invalidate the provider) forces a new fetch.
          minimumFetchInterval: const Duration(hours: 1),
        ),
      );
      await rc.setDefaults(FeatureFlags.defaults);
      await rc.fetchAndActivate();
      return FeatureFlags(rc);
    } catch (_) {
      return const FeatureFlags(null);
    }
  }
}

/// Active feature flags (Remote Config fetched once at startup). Invalidate to
/// re-fetch (the force-update gate does this on "retry").
final featureFlagsProvider = FutureProvider<FeatureFlags>((ref) {
  return RemoteConfigService.load();
});

/// This build's numeric version (Android `versionCode` / iOS `CFBundleVersion`),
/// used by the force-update gate. `0` when unparseable.
final appBuildNumberProvider = FutureProvider<int>((ref) async {
  final info = await PackageInfo.fromPlatform();
  return int.tryParse(info.buildNumber) ?? 0;
});
