// Hide Material's Badge widget so our domain `Badge` model is unambiguous here.
import 'package:flutter/material.dart' hide Badge;
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/feedback/haptics.dart';
import '../../../core/util/formatters.dart';
import '../data/client_extras_models.dart';
import '../../../core/widgets/skeleton.dart';
import '../data/client_repository.dart';
import 'widgets/client_widgets.dart';

class BadgesScreen extends ConsumerWidget {
  const BadgesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final badges = ref.watch(badgesProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Badges')),
      body: RefreshIndicator(
        onRefresh: () => Haptics.onRefresh(() => ref.refresh(badgesProvider.future)),
        child: badges.when(
          loading: () => const SkeletonList(),
          error: (e, _) => ListView(children: [
            const SizedBox(height: 120),
            ErrorRetry(message: e.toString(), onRetry: () => ref.invalidate(badgesProvider)),
          ]),
          data: (d) {
            if (d.earned.isEmpty && d.locked.isEmpty) {
              return ListView(children: const [
                SizedBox(height: 120),
                EmptyState(icon: Icons.workspace_premium, message: 'No badges available yet.'),
              ]);
            }
            return ListView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
              children: [
                SectionHeader(title: 'Earned (${d.earned.length})'),
                if (d.earned.isEmpty)
                  const Padding(
                    padding: EdgeInsets.only(bottom: 8),
                    child: Text('None yet — keep training!'),
                  )
                else
                  ...d.earned.map((b) => _BadgeTile(badge: b)),
                if (d.locked.isNotEmpty) ...[
                  const SizedBox(height: 16),
                  SectionHeader(title: 'Locked (${d.locked.length})'),
                  ...d.locked.map((b) => _BadgeTile(badge: b)),
                ],
              ],
            );
          },
        ),
      ),
    );
  }
}

class _BadgeTile extends StatelessWidget {
  const _BadgeTile({required this.badge});
  final Badge badge;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final subtitle = badge.earned
        ? [
            if (badge.detail != null) badge.detail!,
            if (badge.awardedAt != null) 'Earned ${Fmt.dayMonth(badge.awardedAt)}',
          ].join(' · ')
        : (badge.howToEarn ?? badge.description);

    return Opacity(
      opacity: badge.earned ? 1 : 0.55,
      child: Card(
        margin: const EdgeInsets.only(bottom: 8),
        child: ListTile(
          leading: Container(
            width: 44,
            height: 44,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: badge.earned
                  ? scheme.primaryContainer
                  : scheme.surfaceContainerHighest,
            ),
            child: badge.imageUrl != null
                ? ClipOval(
                    child: Image.network(
                      badge.imageUrl!,
                      width: 44,
                      height: 44,
                      fit: BoxFit.cover,
                      errorBuilder: (_, _, _) =>
                          Text(badge.icon, style: const TextStyle(fontSize: 22)),
                    ),
                  )
                : Text(badge.icon, style: const TextStyle(fontSize: 22)),
          ),
          title: Text(badge.name),
          subtitle: subtitle.isEmpty ? null : Text(subtitle),
          trailing: badge.earned
              ? Icon(Icons.check_circle, color: Colors.green.shade300, size: 20)
              : const Icon(Icons.lock_outline, size: 18),
        ),
      ),
    );
  }
}
