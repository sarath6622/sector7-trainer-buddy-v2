import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';
import '../../../core/storage/token_storage.dart';
import '../data/auth_repository.dart';
import '../domain/auth_user.dart';

// ── Providers (composition root) ────────────────────────────────────────────

final tokenStorageProvider = Provider<TokenStorage>((_) => TokenStorage());

final apiClientProvider = Provider<ApiClient>((ref) {
  final client = ApiClient(tokenStorage: ref.watch(tokenStorageProvider));
  // A hard auth failure (failed refresh) forces a logout.
  client.onAuthFailure = () => ref.read(authControllerProvider.notifier).onAuthFailure();
  return client;
});

final authRepositoryProvider = Provider<AuthRepository>((ref) => AuthRepository(
      ref.watch(apiClientProvider),
      ref.watch(tokenStorageProvider),
    ));

final authControllerProvider =
    NotifierProvider<AuthController, AuthState>(AuthController.new);

// ── State ───────────────────────────────────────────────────────────────────

enum AuthStatus { unknown, authenticating, authenticated, unauthenticated }

class AuthState {
  const AuthState({required this.status, this.user, this.error});

  final AuthStatus status;
  final AuthUser? user;
  final String? error;

  const AuthState.unknown() : this(status: AuthStatus.unknown);

  AuthState copyWith({AuthStatus? status, AuthUser? user, String? error}) =>
      AuthState(
        status: status ?? this.status,
        user: user ?? this.user,
        error: error,
      );
}

// ── Controller ────────────────────────────────────────────────────────────────

class AuthController extends Notifier<AuthState> {
  @override
  AuthState build() {
    _restore();
    return const AuthState.unknown();
  }

  AuthRepository get _repo => ref.read(authRepositoryProvider);

  /// Cold-start session restore from a stored token.
  Future<void> _restore() async {
    if (!await _repo.hasStoredSession()) {
      state = const AuthState(status: AuthStatus.unauthenticated);
      return;
    }
    try {
      final user = await _repo.me();
      state = AuthState(status: AuthStatus.authenticated, user: user);
    } catch (_) {
      await _repo.logout();
      state = const AuthState(status: AuthStatus.unauthenticated);
    }
  }

  Future<void> login(String email, String password) async {
    state = state.copyWith(status: AuthStatus.authenticating, error: null);
    try {
      final user = await _repo.login(email: email, password: password);
      state = AuthState(status: AuthStatus.authenticated, user: user);
    } catch (e) {
      state = AuthState(status: AuthStatus.unauthenticated, error: e.toString());
    }
  }

  Future<void> logout() async {
    await _repo.logout();
    state = const AuthState(status: AuthStatus.unauthenticated);
  }

  void onAuthFailure() {
    _repo.logout();
    state = const AuthState(status: AuthStatus.unauthenticated);
  }
}
