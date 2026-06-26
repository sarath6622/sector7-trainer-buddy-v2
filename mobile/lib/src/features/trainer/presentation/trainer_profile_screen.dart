import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/appearance_card.dart';
import '../../../core/widgets/glass_dock_nav_bar.dart';
import '../../auth/application/auth_controller.dart';

/// Trainer "Profile" tab — identity, links to Leaves + Reschedule requests, and
/// sign out. Name/phone editing still lives on the web console for trainers.
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
        padding: EdgeInsets.fromLTRB(16, 24, 16, glassDockScrollInset(context)),
        children: [
          Center(
            child: CircleAvatar(
              radius: 40,
              backgroundColor: scheme.surfaceContainerHighest,
              child: Text(
                initials.isEmpty ? '?' : initials,
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ),
          const SizedBox(height: 16),
          Center(
            child: Text(
              user?.fullName.trim().isEmpty ?? true ? 'Coach' : user!.fullName,
              style: Theme.of(
                context,
              ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
            ),
          ),
          if (user?.email != null)
            Center(
              child: Text(
                user!.email,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: scheme.onSurfaceVariant,
                ),
              ),
            ),
          const SizedBox(height: 8),
          Center(
            child: Chip(
              label: const Text('Trainer'),
              visualDensity: VisualDensity.compact,
            ),
          ),
          const SizedBox(height: 24),
          Card(
            clipBehavior: Clip.antiAlias,
            child: Column(
              children: [
                ListTile(
                  leading: const Icon(Icons.beach_access_outlined),
                  title: const Text('My Leaves'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => context.push('/trainer/leaves'),
                ),
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(Icons.event_repeat_outlined),
                  title: const Text('Reschedule Requests'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => context.push('/trainer/reschedule-requests'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          const AppearanceCard(),
          const SizedBox(height: 24),
          OutlinedButton.icon(
            onPressed: () => ref.read(authControllerProvider.notifier).logout(),
            icon: const Icon(Icons.logout),
            label: const Text('Sign out'),
            style: OutlinedButton.styleFrom(
              minimumSize: const Size.fromHeight(48),
            ),
          ),
        ],
      ),
    );
  }
}
