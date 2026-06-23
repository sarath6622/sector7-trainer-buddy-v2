import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/widgets/glass_dock_nav_bar.dart';
import '../../auth/application/auth_controller.dart';
import '../data/client_repository.dart';

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authControllerProvider).user;
    final scheme = Theme.of(context).colorScheme;
    final initials = _initials(user?.firstName, user?.lastName);

    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: ListView(
        padding: EdgeInsets.fromLTRB(16, 24, 16, glassDockScrollInset(context)),
        children: [
          Center(
            child: Column(
              children: [
                _ProfileAvatar(initials: initials),
                const SizedBox(height: 12),
                Text(
                  user?.fullName.trim().isNotEmpty == true
                      ? user!.fullName
                      : 'Member',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                if (user?.email != null)
                  Text(
                    user!.email,
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          color: scheme.onSurfaceVariant,
                        ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 28),
          Card(
            child: Column(
              children: [
                ListTile(
                  leading: const Icon(Icons.badge_outlined),
                  title: const Text('Role'),
                  trailing: Text(_roleLabel(user?.role)),
                ),
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(Icons.store_mall_directory_outlined),
                  title: const Text('Branch'),
                  trailing: Text(user?.branchId ?? '—'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          Card(
            child: Column(
              children: [
                ListTile(
                  leading: const Icon(Icons.manage_accounts_outlined),
                  title: const Text('Edit profile'),
                  subtitle: const Text('Name & phone'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => context.push('/client/settings'),
                ),
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(Icons.workspace_premium_outlined),
                  title: const Text('Badges'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => context.push('/client/badges'),
                ),
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(Icons.event_busy_outlined),
                  title: const Text('Availability'),
                  subtitle: const Text('Mark days you can\'t train'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => context.push('/client/unavailability'),
                ),
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(Icons.swap_horiz_outlined),
                  title: const Text('Reschedule requests'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => context.push('/client/reschedule-requests'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          FilledButton.tonalIcon(
            onPressed: () => _confirmLogout(context, ref),
            icon: const Icon(Icons.logout),
            label: const Text('Sign out'),
            style: FilledButton.styleFrom(
              minimumSize: const Size.fromHeight(48),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _confirmLogout(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Sign out?'),
        content: const Text('You will need to sign in again to continue.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Sign out'),
          ),
        ],
      ),
    );
    if (confirmed == true) {
      await ref.read(authControllerProvider.notifier).logout();
    }
  }

  static String _initials(String? first, String? last) {
    final a = (first ?? '').trim();
    final b = (last ?? '').trim();
    final i = '${a.isNotEmpty ? a[0] : ''}${b.isNotEmpty ? b[0] : ''}';
    return i.isEmpty ? '?' : i.toUpperCase();
  }

  static String _roleLabel(String? role) => switch (role) {
        'CLIENT' => 'Client',
        'TRAINER' => 'Trainer',
        _ => role ?? '—',
      };
}

/// Avatar that shows the current profile image (or initials) and lets the user
/// pick/take a photo or remove it. Upload goes to the server-proxy route
/// `POST /api/client/profile/image` (Cloudinary upload + face-crop + audit).
class _ProfileAvatar extends ConsumerStatefulWidget {
  const _ProfileAvatar({required this.initials});
  final String initials;

  @override
  ConsumerState<_ProfileAvatar> createState() => _ProfileAvatarState();
}

class _ProfileAvatarState extends ConsumerState<_ProfileAvatar> {
  bool _busy = false;

  void _snack(String m) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));
  }

  Future<void> _pick(ImageSource source) async {
    final XFile? picked;
    try {
      picked = await ImagePicker().pickImage(
        source: source,
        maxWidth: 1024,
        maxHeight: 1024,
        imageQuality: 85,
      );
    } catch (_) {
      _snack('Could not open ${source == ImageSource.camera ? 'camera' : 'library'}.');
      return;
    }
    if (picked == null) return;

    setState(() => _busy = true);
    try {
      await ref.read(clientRepositoryProvider).uploadProfileImage(picked.path);
      ref.invalidate(profileImageProvider);
      await ref.read(profileImageProvider.future);
      _snack('Profile photo updated');
    } on ApiException catch (e) {
      _snack(e.message);
    } catch (_) {
      _snack('Could not update photo.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _remove() async {
    setState(() => _busy = true);
    try {
      await ref.read(clientRepositoryProvider).removeProfileImage();
      ref.invalidate(profileImageProvider);
      await ref.read(profileImageProvider.future);
      _snack('Profile photo removed');
    } catch (_) {
      _snack('Could not remove photo.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _showOptions(bool hasImage) async {
    final action = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (_) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: const Text('Choose from library'),
              onTap: () => Navigator.pop(context, 'library'),
            ),
            ListTile(
              leading: const Icon(Icons.photo_camera_outlined),
              title: const Text('Take a photo'),
              onTap: () => Navigator.pop(context, 'camera'),
            ),
            if (hasImage)
              ListTile(
                leading: const Icon(Icons.delete_outline),
                title: const Text('Remove photo'),
                onTap: () => Navigator.pop(context, 'remove'),
              ),
          ],
        ),
      ),
    );
    switch (action) {
      case 'library':
        await _pick(ImageSource.gallery);
      case 'camera':
        await _pick(ImageSource.camera);
      case 'remove':
        await _remove();
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final url = ref.watch(profileImageProvider).valueOrNull;

    return SizedBox(
      width: 96,
      height: 96,
      child: Stack(
        children: [
          CircleAvatar(
            radius: 48,
            backgroundColor: scheme.primaryContainer,
            foregroundImage: url != null ? NetworkImage(url) : null,
            child: url == null
                ? Text(
                    widget.initials,
                    style: TextStyle(
                      fontSize: 30,
                      fontWeight: FontWeight.w700,
                      color: scheme.onPrimaryContainer,
                    ),
                  )
                : null,
          ),
          if (_busy)
            Positioned.fill(
              child: DecoratedBox(
                decoration: const BoxDecoration(
                  shape: BoxShape.circle,
                  color: Colors.black45,
                ),
                child: const Center(child: CircularProgressIndicator()),
              ),
            ),
          Positioned(
            right: 0,
            bottom: 0,
            child: Material(
              color: scheme.primary,
              shape: const CircleBorder(),
              child: InkWell(
                customBorder: const CircleBorder(),
                onTap: _busy ? null : () => _showOptions(url != null),
                child: Padding(
                  padding: const EdgeInsets.all(7),
                  child: Icon(Icons.camera_alt, size: 16, color: scheme.onPrimary),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
