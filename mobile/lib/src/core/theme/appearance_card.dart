import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'theme_mode_controller.dart';

/// A settings card that lets the user choose Light / System / Dark.
///
/// Drops straight into the Profile/Settings [ListView]s for both roles. Reads
/// and writes the persisted [themeModeProvider]; the change applies app-wide
/// immediately.
class AppearanceCard extends ConsumerWidget {
  const AppearanceCard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final mode = ref.watch(themeModeProvider);
    final scheme = Theme.of(context).colorScheme;

    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  Icons.brightness_6_outlined,
                  color: scheme.onSurfaceVariant,
                ),
                const SizedBox(width: 12),
                Text(
                  'Appearance',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ],
            ),
            const SizedBox(height: 14),
            SizedBox(
              width: double.infinity,
              child: SegmentedButton<ThemeMode>(
                showSelectedIcon: false,
                segments: const [
                  ButtonSegment(
                    value: ThemeMode.light,
                    icon: Icon(Icons.light_mode_outlined, size: 18),
                    label: Text('Light'),
                  ),
                  ButtonSegment(
                    value: ThemeMode.system,
                    icon: Icon(Icons.brightness_auto_outlined, size: 18),
                    label: Text('System'),
                  ),
                  ButtonSegment(
                    value: ThemeMode.dark,
                    icon: Icon(Icons.dark_mode_outlined, size: 18),
                    label: Text('Dark'),
                  ),
                ],
                selected: {mode},
                onSelectionChanged: (selection) => ref
                    .read(themeModeProvider.notifier)
                    .setMode(selection.first),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
