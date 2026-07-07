import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';
import '../../auth/application/auth_controller.dart';
import 'community_models.dart';

/// Access to the branch-scoped community endpoints (ADR-019). Reads unwrap the
/// `{ data }` envelope; the feed is cursor-paginated.
class CommunityRepository {
  CommunityRepository(this._api);
  final ApiClient _api;

  /// GET /api/community/feed — one page of posts + the next cursor (null = end).
  Future<({List<CommunityPost> posts, String? nextCursor})> feed({
    String? cursor,
    int limit = 20,
  }) async {
    final data = await _api.get('/community/feed', query: {
      'cursor': ?cursor,
      'limit': limit,
    }) as Map<String, dynamic>;
    final posts = (data['posts'] as List? ?? const [])
        .whereType<Map>()
        .map((m) => CommunityPost.fromJson(Map<String, dynamic>.from(m)))
        .toList();
    return (posts: posts, nextCursor: data['nextCursor'] as String?);
  }

  /// POST /api/community/posts/[id]/react — toggle praise; returns the new state.
  Future<bool> toggleReaction(String postId) async {
    final data = await _api.post('/community/posts/$postId/react');
    return data is Map && data['reacted'] == true;
  }

  /// POST /api/community/posts/[id]/comments — add a comment.
  Future<CommunityComment> addComment(String postId, String content) async {
    final data = await _api.post(
      '/community/posts/$postId/comments',
      body: {'content': content},
    ) as Map<String, dynamic>;
    return CommunityComment.fromJson(data);
  }

  /// DELETE /api/community/posts/[id]/comments/[commentId] — remove own comment.
  Future<void> deleteComment(String postId, String commentId) =>
      _api.delete('/community/posts/$postId/comments/$commentId');

  /// DELETE /api/community/posts/[id] — remove own post.
  Future<void> deletePost(String postId) =>
      _api.delete('/community/posts/$postId');

  /// GET /api/community/leaderboard (no exerciseId) — the compound-lift tabs.
  Future<List<CompoundExercise>> compoundExercises() async {
    final data = await _api.get('/community/leaderboard') as List<dynamic>;
    return data
        .whereType<Map>()
        .map((m) => CompoundExercise.fromJson(Map<String, dynamic>.from(m)))
        .toList();
  }

  /// GET /api/community/leaderboard?exerciseId — ranked entries for one lift.
  Future<List<LeaderboardEntry>> leaderboard(String exerciseId) async {
    final data = await _api.get(
      '/community/leaderboard',
      query: {'exerciseId': exerciseId},
    ) as List<dynamic>;
    var i = 0;
    return data
        .whereType<Map>()
        .map((m) => LeaderboardEntry.fromJson(Map<String, dynamic>.from(m), ++i))
        .toList();
  }
}

final communityRepositoryProvider = Provider<CommunityRepository>(
  (ref) => CommunityRepository(ref.watch(apiClientProvider)),
);

/// Stateful, cursor-paginated feed with in-place react/comment mutations so the
/// list isn't refetched on every interaction (which would lose scroll position).
class CommunityFeedController
    extends AutoDisposeAsyncNotifier<List<CommunityPost>> {
  String? _cursor;
  bool _loadingMore = false;

  bool get hasMore => _cursor != null;
  bool get isLoadingMore => _loadingMore;

  CommunityRepository get _repo => ref.read(communityRepositoryProvider);
  String? get _myId => ref.read(authControllerProvider).user?.clientProfileId;

  @override
  Future<List<CommunityPost>> build() async {
    final page = await _repo.feed();
    _cursor = page.nextCursor;
    return page.posts;
  }

  Future<void> refresh() async {
    _cursor = null;
    state = const AsyncLoading();
    state = await AsyncValue.guard(() async {
      final page = await _repo.feed();
      _cursor = page.nextCursor;
      return page.posts;
    });
  }

  Future<void> loadMore() async {
    if (_loadingMore || _cursor == null) return;
    _loadingMore = true;
    try {
      final page = await _repo.feed(cursor: _cursor);
      _cursor = page.nextCursor;
      state = AsyncData([...(state.valueOrNull ?? const []), ...page.posts]);
    } finally {
      _loadingMore = false;
    }
  }

  void _replacePost(String postId, CommunityPost Function(CommunityPost) update) {
    final list = [...(state.valueOrNull ?? const <CommunityPost>[])];
    final idx = list.indexWhere((p) => p.id == postId);
    if (idx < 0) return;
    list[idx] = update(list[idx]);
    state = AsyncData(list);
  }

  /// Optimistic praise toggle, reconciled to the server's reported state.
  Future<void> toggleReaction(String postId) async {
    final myId = _myId;
    if (myId == null) return;
    final original = state.valueOrNull?.firstWhere(
      (p) => p.id == postId,
      orElse: () => throw StateError('post gone'),
    );
    if (original == null) return;
    final wasReacted = original.reactedBy(myId);
    _replacePost(postId, (p) => p.withReaction(myId, !wasReacted));
    try {
      final reacted = await _repo.toggleReaction(postId);
      _replacePost(postId, (p) => p.withReaction(myId, reacted));
    } catch (_) {
      _replacePost(postId, (p) => p.withReaction(myId, wasReacted)); // revert
      rethrow;
    }
  }

  Future<void> addComment(String postId, String content) async {
    final comment = await _repo.addComment(postId, content);
    _replacePost(postId, (p) => p.withAddedComment(comment));
  }

  Future<void> deleteComment(String postId, String commentId) async {
    await _repo.deleteComment(postId, commentId);
    _replacePost(postId, (p) => p.withRemovedComment(commentId));
  }

  /// Removes own post (owner-only on the server), dropping it from the feed.
  Future<void> deletePost(String postId) async {
    await _repo.deletePost(postId);
    final list = [...(state.valueOrNull ?? const <CommunityPost>[])]
      ..removeWhere((p) => p.id == postId);
    state = AsyncData(list);
  }
}

final communityFeedControllerProvider = AutoDisposeAsyncNotifierProvider<
    CommunityFeedController, List<CommunityPost>>(CommunityFeedController.new);

/// Compound exercises that have a leaderboard (the selector chips).
final compoundExercisesProvider =
    FutureProvider.autoDispose<List<CompoundExercise>>(
  (ref) => ref.watch(communityRepositoryProvider).compoundExercises(),
);

/// Ranked leaderboard entries for one compound exercise.
final leaderboardProvider =
    FutureProvider.autoDispose.family<List<LeaderboardEntry>, String>(
  (ref, exerciseId) =>
      ref.watch(communityRepositoryProvider).leaderboard(exerciseId),
);
