import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'remote_config_service.dart';

/// Wraps the app and replaces it with a blocking "update required" screen when
/// the running build is below Remote Config's `min_supported_build`.
///
/// Fails OPEN: while the flags / build number are still loading, or if either is
/// unavailable, the app renders normally. The gate only ever engages on a
/// definite `minSupportedBuild > currentBuild`.
class ForceUpdateGate extends ConsumerWidget {
  const ForceUpdateGate({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final flags = ref.watch(featureFlagsProvider).valueOrNull;
    final build = ref.watch(appBuildNumberProvider).valueOrNull;

    final mustUpdate =
        flags != null && build != null && flags.minSupportedBuild > build;

    if (!mustUpdate) return child;

    return _UpdateRequiredScreen(
      message: flags.updateMessage,
      onRetry: () => ref.invalidate(featureFlagsProvider),
    );
  }
}

class _UpdateRequiredScreen extends StatelessWidget {
  const _UpdateRequiredScreen({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  Icons.system_update_rounded,
                  size: 64,
                  color: theme.colorScheme.primary,
                ),
                const SizedBox(height: 24),
                Text(
                  'Update required',
                  style: theme.textTheme.headlineSmall,
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 12),
                Text(
                  message,
                  style: theme.textTheme.bodyMedium,
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 32),
                FilledButton(
                  onPressed: onRetry,
                  child: const Text("I've updated — retry"),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
