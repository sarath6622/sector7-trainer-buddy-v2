import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_exception.dart';
import '../../auth/application/auth_controller.dart';
import '../../client/presentation/widgets/client_widgets.dart';
import '../data/community_models.dart';
import '../data/community_repository.dart';

const _orange500 = Color(0xFFF97316);
const _orange700 = Color(0xFFC2410C);
const _red = Color(0xFFEF4444);
const _amber = Color(0xFFF59E0B);

/// PR achievement banner theme — keyed off the exercise name so each lift gets a
/// consistent look. Mirrors the PWA's five themes.
class _PrTheme {
  const _PrTheme(this.gradient, this.icon, this.iconColor, this.label);
  final List<Color> gradient;
  final IconData icon;
  final Color iconColor;
  final String label;
}

const _prThemes = <_PrTheme>[
  _PrTheme([Color(0xFFEA580C), Color(0xFFF97316), Color(0xFFFACC15)],
      Icons.emoji_events, Colors.white, 'PERSONAL RECORD'),
  _PrTheme([Color(0xFFB91C1C), Color(0xFFEF4444), Color(0xFFFB923C)],
      Icons.local_fire_department, Colors.white, 'NEW BEST'),
  _PrTheme([Color(0xFF27272A), Color(0xFF3F3F46), Color(0xFF52525B)],
      Icons.fitness_center, Color(0xFFFB923C), 'CRUSHED IT'),
  _PrTheme([Color(0xFFB45309), Color(0xFFCA8A04), Color(0xFFFACC15)],
      Icons.bolt, Colors.white, 'POWER MOVE'),
  _PrTheme([Color(0xFF292524), Color(0xFF7C2D12), Color(0xFFC2410C)],
      Icons.star, Color(0xFFFDE047), 'MILESTONE'),
];

_PrTheme _themeFor(String? key) {
  if (key == null || key.isEmpty) return _prThemes.first;
  final sum = key.codeUnits.fold<int>(0, (a, c) => a + c);
  return _prThemes[sum % _prThemes.length];
}

/// Client "Community" — an Instagram-style feed of PR achievements (mirrors the
/// PWA `/community`): a header with a Leaderboard entry point, then a scrollable
/// feed of themed PR cards with praise + comments.
class CommunityScreen extends ConsumerStatefulWidget {
  const CommunityScreen({super.key});

  @override
  ConsumerState<CommunityScreen> createState() => _CommunityScreenState();
}

class _CommunityScreenState extends ConsumerState<CommunityScreen> {
  final _scroll = ScrollController();

  @override
  void initState() {
    super.initState();
    _scroll.addListener(() {
      if (_scroll.position.pixels >= _scroll.position.maxScrollExtent - 400) {
        ref.read(communityFeedControllerProvider.notifier).loadMore();
      }
    });
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final feed = ref.watch(communityFeedControllerProvider);
    final controller = ref.read(communityFeedControllerProvider.notifier);

    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            _Header(
              onLeaderboard: () => Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const _LeaderboardScreen())),
            ),
            Divider(height: 1, color: scheme.outlineVariant),
            Expanded(
              child: feed.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (e, _) => ErrorRetry(
                  message: e.toString(),
                  onRetry: () => ref.invalidate(communityFeedControllerProvider),
                ),
                data: (posts) => RefreshIndicator(
                  onRefresh: controller.refresh,
                  child: posts.isEmpty
                      ? ListView(children: const [
                          SizedBox(height: 80),
                          _EmptyFeed(),
                        ])
                      : ListView.builder(
                          controller: _scroll,
                          itemCount: posts.length + (controller.hasMore ? 1 : 0),
                          itemBuilder: (context, i) {
                            if (i >= posts.length) {
                              return const Padding(
                                padding: EdgeInsets.all(20),
                                child: Center(child: CircularProgressIndicator()),
                              );
                            }
                            return _PostCard(post: posts[i]);
                          },
                        ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.onLeaderboard});
  final VoidCallback onLeaderboard;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Community',
                    style: Theme.of(context)
                        .textTheme
                        .titleLarge
                        ?.copyWith(fontWeight: FontWeight.w800)),
                Text('PRs, achievements & gym energy',
                    style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant)),
              ],
            ),
          ),
          OutlinedButton.icon(
            onPressed: onLeaderboard,
            icon: const Icon(Icons.emoji_events, size: 16, color: _amber),
            label: const Text('Leaderboard'),
            style: OutlinedButton.styleFrom(
              foregroundColor: scheme.onSurface,
              side: BorderSide(color: scheme.outlineVariant),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              textStyle: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    );
  }
}

class _EmptyFeed extends StatelessWidget {
  const _EmptyFeed();
  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Container(
          width: 80,
          height: 80,
          decoration: BoxDecoration(
              color: _orange500.withValues(alpha: 0.1), shape: BoxShape.circle),
          child: Icon(Icons.emoji_events, size: 40, color: _orange500.withValues(alpha: 0.4)),
        ),
        const SizedBox(height: 14),
        const Text('No posts yet', style: TextStyle(fontWeight: FontWeight.w600)),
        const SizedBox(height: 4),
        Text('Hit a PR to get the community going!',
            style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant)),
      ],
    );
  }
}

// ── Post card ─────────────────────────────────────────────────────────────────
class _PostCard extends ConsumerStatefulWidget {
  const _PostCard({required this.post});
  final CommunityPost post;

  @override
  ConsumerState<_PostCard> createState() => _PostCardState();
}

class _PostCardState extends ConsumerState<_PostCard> {
  bool _burst = false;

  CommunityPost get post => widget.post;

  Future<void> _react() async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      await ref.read(communityFeedControllerProvider.notifier).toggleReaction(post.id);
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    } catch (_) {
      messenger.showSnackBar(const SnackBar(content: Text('Could not react')));
    }
  }

  void _onDoubleTap(bool reacted) {
    if (!reacted) _react();
    setState(() => _burst = true);
    Future.delayed(const Duration(milliseconds: 800), () {
      if (mounted) setState(() => _burst = false);
    });
  }

  void _openComments() {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _CommentsSheet(postId: post.id),
    );
  }

  Future<void> _confirmDelete() async {
    final ok = await showModalBottomSheet<bool>(
      context: context,
      builder: (_) => const _DeleteConfirmSheet(),
    );
    if (ok != true || !mounted) return;
    final messenger = ScaffoldMessenger.of(context);
    try {
      await ref.read(communityFeedControllerProvider.notifier).deletePost(post.id);
      messenger.showSnackBar(const SnackBar(content: Text('Post removed')));
    } catch (_) {
      messenger.showSnackBar(const SnackBar(content: Text('Could not delete post')));
    }
  }

  Future<void> _options() async {
    final reported = await showModalBottomSheet<bool>(
      context: context,
      builder: (_) => const _OptionsSheet(),
    );
    if (reported != true || !mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Report submitted. We will review it shortly.')),
    );
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final myId = ref.watch(authControllerProvider).user?.clientProfileId;
    final reacted = post.reactedBy(myId);
    final isOwner = myId != null && post.author.clientProfileId == myId;
    final isPr = post.isAutoGenerated && post.exerciseName != null && post.weightKg != null;
    final hasContent = post.content != null && post.content!.trim().isNotEmpty;

    return DecoratedBox(
      decoration: BoxDecoration(
        border: Border(bottom: BorderSide(color: scheme.outlineVariant)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Author header.
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 8, 10),
            child: Row(
              children: [
                _Avatar(name: post.author.name, url: post.author.photoUrl, size: 42),
                const SizedBox(width: 11),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(post.author.name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                      Text(_timeAgo(post.createdAt),
                          style: TextStyle(fontSize: 11, color: scheme.onSurfaceVariant)),
                    ],
                  ),
                ),
                IconButton(
                  visualDensity: VisualDensity.compact,
                  onPressed: isOwner ? _confirmDelete : _options,
                  icon: Icon(
                    isOwner ? Icons.delete_outline : Icons.more_horiz,
                    size: 20,
                    color: scheme.onSurfaceVariant,
                  ),
                ),
              ],
            ),
          ),

          // PR banner or text content.
          if (isPr)
            _PrBanner(post: post, burst: _burst, onDoubleTap: () => _onDoubleTap(reacted))
          else if (hasContent)
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 0, 14, 4),
              child: Text(post.content!.trim(),
                  style: const TextStyle(fontSize: 14, height: 1.4)),
            ),

          // Action row.
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
            child: Row(children: [
              _ActionButton(
                icon: reacted ? Icons.favorite : Icons.favorite_border,
                color: reacted ? _red : scheme.onSurface,
                count: post.reactionCount,
                onTap: _react,
              ),
              const SizedBox(width: 8),
              _ActionButton(
                icon: Icons.mode_comment_outlined,
                color: scheme.onSurface,
                count: post.commentCount,
                onTap: _openComments,
              ),
            ]),
          ),

          // Caption (PR posts whose author added text).
          if (isPr && hasContent)
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 2, 14, 0),
              child: Text.rich(TextSpan(children: [
                TextSpan(
                    text: '${post.author.name}  ',
                    style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
                TextSpan(text: post.content!.trim(), style: const TextStyle(fontSize: 13)),
              ])),
            ),

          // Comments preview.
          if (post.commentCount > 1)
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 4, 14, 0),
              child: InkWell(
                onTap: _openComments,
                child: Text('View all ${post.commentCount} comments',
                    style: TextStyle(fontSize: 13, color: scheme.onSurfaceVariant)),
              ),
            ),
          if (post.comments.isNotEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 4, 14, 0),
              child: Text.rich(
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                TextSpan(children: [
                  TextSpan(
                      text: '${post.comments.first.author.name}  ',
                      style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
                  TextSpan(text: post.comments.first.content, style: const TextStyle(fontSize: 13)),
                ]),
              ),
            ),
          const SizedBox(height: 12),
        ],
      ),
    );
  }
}

class _PrBanner extends StatelessWidget {
  const _PrBanner({required this.post, required this.burst, required this.onDoubleTap});
  final CommunityPost post;
  final bool burst;
  final VoidCallback onDoubleTap;

  @override
  Widget build(BuildContext context) {
    final theme = _themeFor(post.exerciseName);
    final w = post.weightKg!;
    final weight = w == w.roundToDouble() ? w.toInt().toString() : w.toString();
    return GestureDetector(
      onDoubleTap: onDoubleTap,
      child: AspectRatio(
        aspectRatio: 4 / 3,
        child: Stack(
          fit: StackFit.expand,
          children: [
            DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: theme.gradient,
                ),
              ),
            ),
            // Decorative rings.
            Positioned(
              top: -40,
              right: -40,
              child: Container(
                width: 200,
                height: 200,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(color: Colors.white.withValues(alpha: 0.1), width: 4),
                ),
              ),
            ),
            Positioned(
              bottom: -56,
              left: -28,
              child: Container(
                width: 170,
                height: 170,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(color: Colors.white.withValues(alpha: 0.08), width: 2),
                ),
              ),
            ),
            // Content.
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(theme.icon, size: 52, color: theme.iconColor),
                  const SizedBox(height: 8),
                  Text(theme.label,
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.9),
                        fontSize: 12,
                        fontWeight: FontWeight.w900,
                        letterSpacing: 2,
                      )),
                  const SizedBox(height: 14),
                  Text(post.exerciseName!,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                          color: Colors.white, fontSize: 16, fontWeight: FontWeight.w600)),
                  const SizedBox(height: 4),
                  Text.rich(TextSpan(
                    text: weight,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 56,
                      height: 1,
                      fontWeight: FontWeight.w900,
                      letterSpacing: -1,
                    ),
                    children: const [
                      TextSpan(text: ' kg', style: TextStyle(fontSize: 26, fontWeight: FontWeight.w700)),
                    ],
                  )),
                  if (post.reps != null) ...[
                    const SizedBox(height: 6),
                    Text('× ${post.reps} reps',
                        style: TextStyle(
                            color: Colors.white.withValues(alpha: 0.85),
                            fontSize: 15,
                            fontWeight: FontWeight.w500)),
                  ],
                ],
              ),
            ),
            // Double-tap heart burst.
            IgnorePointer(
              child: AnimatedScale(
                scale: burst ? 1.0 : 0.4,
                duration: const Duration(milliseconds: 250),
                curve: Curves.easeOut,
                child: AnimatedOpacity(
                  opacity: burst ? 1 : 0,
                  duration: const Duration(milliseconds: 250),
                  child: const Center(
                    child: Icon(Icons.favorite, size: 110, color: Colors.white),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ActionButton extends StatelessWidget {
  const _ActionButton({
    required this.icon,
    required this.color,
    required this.count,
    required this.onTap,
  });
  final IconData icon;
  final Color color;
  final int count;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(8),
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(icon, size: 24, color: color),
          if (count > 0) ...[
            const SizedBox(width: 6),
            Text('$count', style: TextStyle(color: color, fontWeight: FontWeight.w600)),
          ],
        ]),
      ),
    );
  }
}

// ── Options / delete sheets ───────────────────────────────────────────────────
class _OptionsSheet extends StatelessWidget {
  const _OptionsSheet();
  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 16),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Container(
            width: 40,
            height: 4,
            margin: const EdgeInsets.only(bottom: 12),
            decoration: BoxDecoration(
                color: scheme.outlineVariant, borderRadius: BorderRadius.circular(2)),
          ),
          ListTile(
            onTap: () => Navigator.of(context).pop(true),
            leading: Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                  color: _red.withValues(alpha: 0.15), shape: BoxShape.circle),
              child: const Icon(Icons.flag_outlined, color: _red),
            ),
            title: const Text('Report post', style: TextStyle(fontWeight: FontWeight.w600)),
            subtitle: const Text('Flag inappropriate content'),
          ),
          const SizedBox(height: 8),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton(
              onPressed: () => Navigator.of(context).pop(false),
              child: const Text('Cancel'),
            ),
          ),
        ]),
      ),
    );
  }
}

class _DeleteConfirmSheet extends StatelessWidget {
  const _DeleteConfirmSheet();
  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
                color: _red.withValues(alpha: 0.15), shape: BoxShape.circle),
            child: const Icon(Icons.delete_outline, color: _red),
          ),
          const SizedBox(height: 12),
          const Text('Delete post?', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
          const SizedBox(height: 4),
          Text('This cannot be undone.',
              style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant)),
          const SizedBox(height: 18),
          Row(children: [
            Expanded(
              child: OutlinedButton(
                onPressed: () => Navigator.of(context).pop(false),
                child: const Text('Cancel'),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: FilledButton(
                style: FilledButton.styleFrom(backgroundColor: _red),
                onPressed: () => Navigator.of(context).pop(true),
                child: const Text('Delete'),
              ),
            ),
          ]),
        ]),
      ),
    );
  }
}

// ── Comments sheet ────────────────────────────────────────────────────────────
class _CommentsSheet extends ConsumerStatefulWidget {
  const _CommentsSheet({required this.postId});
  final String postId;

  @override
  ConsumerState<_CommentsSheet> createState() => _CommentsSheetState();
}

class _CommentsSheetState extends ConsumerState<_CommentsSheet> {
  final _controller = TextEditingController();
  bool _sending = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final text = _controller.text.trim();
    if (text.isEmpty) return;
    setState(() => _sending = true);
    final messenger = ScaffoldMessenger.of(context);
    try {
      await ref
          .read(communityFeedControllerProvider.notifier)
          .addComment(widget.postId, text);
      _controller.clear();
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    } catch (_) {
      messenger.showSnackBar(const SnackBar(content: Text('Could not comment')));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _delete(String commentId) async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      await ref
          .read(communityFeedControllerProvider.notifier)
          .deleteComment(widget.postId, commentId);
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    } catch (_) {
      messenger.showSnackBar(const SnackBar(content: Text('Could not delete')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final myId = ref.watch(authControllerProvider).user?.clientProfileId;
    final posts = ref.watch(communityFeedControllerProvider).valueOrNull ?? const [];
    final post = posts.where((p) => p.id == widget.postId).firstOrNull;
    final comments = post?.comments ?? const [];

    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SizedBox(
        height: MediaQuery.sizeOf(context).height * 0.7,
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text.rich(TextSpan(children: [
                  const TextSpan(
                      text: 'Comments',
                      style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                  TextSpan(
                      text: comments.isEmpty ? '' : '  ${comments.length}',
                      style: TextStyle(color: scheme.onSurfaceVariant)),
                ])),
              ),
            ),
            Divider(height: 1, color: scheme.outlineVariant),
            Expanded(
              child: comments.isEmpty
                  ? const Center(child: Text('No comments yet. Be the first!'))
                  : ListView.builder(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                      itemCount: comments.length,
                      itemBuilder: (context, i) {
                        final c = comments[i];
                        final mine = myId != null && c.author.clientProfileId == myId;
                        return Padding(
                          padding: const EdgeInsets.symmetric(vertical: 8),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              _Avatar(name: c.author.name, url: c.author.photoUrl, size: 32),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text.rich(TextSpan(children: [
                                      TextSpan(
                                          text: '${c.author.name}  ',
                                          style: const TextStyle(
                                              fontWeight: FontWeight.w700, fontSize: 13)),
                                      TextSpan(text: c.content, style: const TextStyle(fontSize: 13)),
                                    ])),
                                    Text(_timeAgo(c.createdAt),
                                        style: TextStyle(
                                            fontSize: 11, color: scheme.onSurfaceVariant)),
                                  ],
                                ),
                              ),
                              if (mine)
                                InkWell(
                                  onTap: () => _delete(c.id),
                                  child: Padding(
                                    padding: const EdgeInsets.all(4),
                                    child: Icon(Icons.delete_outline,
                                        size: 16, color: scheme.onSurfaceVariant),
                                  ),
                                ),
                            ],
                          ),
                        );
                      },
                    ),
            ),
            Divider(height: 1, color: scheme.outlineVariant),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 8, 12),
              child: Row(children: [
                Expanded(
                  child: TextField(
                    controller: _controller,
                    minLines: 1,
                    maxLines: 3,
                    textCapitalization: TextCapitalization.sentences,
                    decoration: const InputDecoration(
                      hintText: 'Add a comment…',
                      isDense: true,
                    ),
                  ),
                ),
                IconButton(
                  icon: _sending
                      ? const SizedBox(
                          height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Icon(Icons.send, color: _orange500),
                  onPressed: _sending ? null : _send,
                ),
              ]),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Leaderboard (pushed screen) ───────────────────────────────────────────────
class _LeaderboardScreen extends ConsumerStatefulWidget {
  const _LeaderboardScreen();

  @override
  ConsumerState<_LeaderboardScreen> createState() => _LeaderboardScreenState();
}

class _LeaderboardScreenState extends ConsumerState<_LeaderboardScreen> {
  String? _selectedId;

  @override
  Widget build(BuildContext context) {
    final exercises = ref.watch(compoundExercisesProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Leaderboard')),
      body: exercises.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ErrorRetry(
          message: e.toString(),
          onRetry: () => ref.invalidate(compoundExercisesProvider),
        ),
        data: (list) {
          if (list.isEmpty) {
            return const EmptyState(
              icon: Icons.leaderboard_outlined,
              message: 'No compound lifts configured.',
            );
          }
          final selected = _selectedId ?? list.first.id;
          return Column(
            children: [
              SizedBox(
                height: 56,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  children: [
                    for (final ex in list)
                      Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: ChoiceChip(
                          label: Text(ex.name),
                          selected: ex.id == selected,
                          onSelected: (_) => setState(() => _selectedId = ex.id),
                        ),
                      ),
                  ],
                ),
              ),
              const Divider(height: 1),
              Expanded(child: _LeaderboardList(exerciseId: selected)),
            ],
          );
        },
      ),
    );
  }
}

class _LeaderboardList extends ConsumerWidget {
  const _LeaderboardList({required this.exerciseId});
  final String exerciseId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final board = ref.watch(leaderboardProvider(exerciseId));
    return board.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => ErrorRetry(
        message: e.toString(),
        onRetry: () => ref.invalidate(leaderboardProvider(exerciseId)),
      ),
      data: (entries) {
        if (entries.isEmpty) {
          return const EmptyState(
            icon: Icons.leaderboard_outlined,
            message: 'No lifts logged yet for this exercise.',
          );
        }
        return ListView.separated(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
          itemCount: entries.length,
          separatorBuilder: (_, _) => const Divider(height: 1),
          itemBuilder: (context, i) => _LeaderboardRow(entry: entries[i]),
        );
      },
    );
  }
}

class _LeaderboardRow extends StatelessWidget {
  const _LeaderboardRow({required this.entry});
  final LeaderboardEntry entry;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final medal = switch (entry.rank) {
      1 => const Color(0xFFFFD700),
      2 => const Color(0xFFC0C0C0),
      3 => const Color(0xFFCD7F32),
      _ => null,
    };
    final w = entry.maxWeightKg;
    final weightLabel = '${w == w.roundToDouble() ? w.toInt() : w} kg';
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: CircleAvatar(
        radius: 16,
        backgroundColor: medal ?? scheme.surfaceContainerHighest,
        child: Text('${entry.rank}',
            style: TextStyle(
              fontWeight: FontWeight.w700,
              color: medal != null ? Colors.black : scheme.onSurfaceVariant,
            )),
      ),
      title: Text(entry.name, style: const TextStyle(fontWeight: FontWeight.w600)),
      subtitle: entry.reps != null ? Text('${entry.reps} reps') : null,
      trailing: Text(weightLabel,
          style: Theme.of(context)
              .textTheme
              .titleMedium
              ?.copyWith(fontWeight: FontWeight.w700)),
    );
  }
}

// ── Shared ────────────────────────────────────────────────────────────────────
class _Avatar extends StatelessWidget {
  const _Avatar({required this.name, this.url, this.size = 40});
  final String name;
  final String? url;
  final double size;

  @override
  Widget build(BuildContext context) {
    final initials = name
        .trim()
        .split(RegExp(r'\s+'))
        .where((p) => p.isNotEmpty)
        .take(2)
        .map((p) => p[0].toUpperCase())
        .join();
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [_orange500, _orange700],
        ),
        image: (url != null && url!.isNotEmpty)
            ? DecorationImage(image: NetworkImage(url!), fit: BoxFit.cover)
            : null,
        border: Border.all(color: Colors.white.withValues(alpha: 0.1), width: 2),
      ),
      child: (url != null && url!.isNotEmpty)
          ? null
          : Text(initials.isEmpty ? '?' : initials,
              style: TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w800,
                  fontSize: size * 0.34)),
    );
  }
}

String _timeAgo(DateTime? d) {
  if (d == null) return '';
  final diff = DateTime.now().difference(d);
  if (diff.inMinutes < 1) return 'just now';
  if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
  if (diff.inHours < 24) return '${diff.inHours}h ago';
  if (diff.inDays < 7) return '${diff.inDays}d ago';
  return '${(diff.inDays / 7).floor()}w ago';
}
