import 'package:flutter_test/flutter_test.dart';
import 'package:sector7_mobile/src/core/flags/feature_flags.dart';

void main() {
  group('FeatureFlags graceful-disable (Firebase unavailable / not fetched)', () {
    const flags = FeatureFlags(null);

    test('minSupportedBuild defaults to 0 → force-update gate stays disabled', () {
      // The critical safety property: a Remote Config outage must never lock
      // users out behind the update gate.
      expect(flags.minSupportedBuild, 0);
    });

    test('updateMessage falls back to a non-empty default', () {
      expect(flags.updateMessage, isNotEmpty);
    });

    test('unknown boolean feature flag defaults to false (ship dark)', () {
      expect(flags.isEnabled('some_unshipped_feature'), isFalse);
    });

    test('declared default map keeps the gate disabled by default', () {
      expect(FeatureFlags.defaults[FeatureFlags.kMinSupportedBuild], 0);
    });
  });
}
