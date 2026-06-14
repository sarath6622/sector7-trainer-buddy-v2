import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../auth/application/auth_controller.dart';

/// Trainer "Profile" tab — identity + sign out. Kept minimal; trainers manage
/// their own account details (name/phone, leaves) on the web console for now.
class TrainerProfileScreen extends ConsumerWidget {
  const TrainerProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authControllerProvider).user;
    final scheme = Theme.of(context).colorScheme;
    final initials = (user == null)
        ? '?'
        : '${user.firstName.isNotEmpty ? user.firstName[0] : ''}'
                '${user.lastName.isNotEmpty ? user.lastName[0] : ''}'
            .toUpperCase();

    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 24, 16, 32),
        children: [
          Center(
            child: CircleAvatar(
              radius: 40,
              backgroundColor: scheme.surfaceContainerHighest,
              child: Text(
                initials.isEmpty ? '?' : initials,
                style: Theme.of(context)
                    .textTheme
                    .headlineSmall
                    ?.copyWith(fontWeight: FontWeight.w700),
              ),
            ),
          ),
          const SizedBox(height: 16),
          Center(
            child: Text(
              user?.fullName.trim().isEmpty ?? true ? 'Coach' : user!.fullName,
              style: Theme.of(context)
                  .textTheme
                  .titleLarge
                  ?.copyWith(fontWeight: FontWeight.w700),
            ),
          ),
          if (user?.email != null)
            Center(
              child: Text(
                user!.email,
                style: Theme.of(context)
                    .textTheme
                    .bodyMedium
                    ?.copyWith(color: scheme.onSurfaceVariant),
              ),
            ),
          const SizedBox(height: 8),
          Center(
            child: Chip(
              label: const Text('Trainer'),
              visualDensity: VisualDensity.compact,
            ),
          ),
          const SizedBox(height: 32),
          OutlinedButton.icon(
            onPressed: () =>
                ref.read(authControllerProvider.notifier).logout(),
            icon: const Icon(Icons.logout),
            label: const Text('Sign out'),
            style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
          ),
        ],
      ),
    );
  }
}
