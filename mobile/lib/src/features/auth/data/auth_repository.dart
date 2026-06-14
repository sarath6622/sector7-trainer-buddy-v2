import '../../../core/network/api_client.dart';
import '../../../core/storage/token_storage.dart';
import '../domain/auth_user.dart';

/// Talks to the mobile auth endpoints. The login/refresh routes are Phase 0
/// backend work — they verify bcrypt credentials (reusing the existing User
/// table) and issue short-lived access + long-lived refresh JWTs.
///
/// Expected `POST /api/mobile/auth/login` response:
///   { data: { accessToken, refreshToken, user: { ...AuthUser } } }
class AuthRepository {
  AuthRepository(this._api, this._tokens);

  final ApiClient _api;
  final TokenStorage _tokens;

  Future<AuthUser> login({
    required String email,
    required String password,
  }) async {
    final data = await _api.post(
      '/mobile/auth/login',
      body: {'email': email.trim(), 'password': password},
    ) as Map<String, dynamic>;

    await _tokens.saveTokens(
      accessToken: data['accessToken'] as String,
      refreshToken: data['refreshToken'] as String,
    );
    return AuthUser.fromJson(data['user'] as Map<String, dynamic>);
  }

  /// Reads the current session from the existing `GET /api/auth/me` (which the
  /// Bearer auth shim makes token-aware in Phase 0). Used on cold start to
  /// restore a session from a stored token.
  Future<AuthUser> me() async {
    final data = await _api.get('/auth/me') as Map<String, dynamic>;
    return AuthUser.fromJson(data['user'] as Map<String, dynamic>);
  }

  /// Revokes the refresh token server-side (best-effort) then clears the local
  /// keychain. Server revocation is what makes the token unusable even if it
  /// was captured; clearing local storage always happens regardless.
  Future<void> logout() async {
    final refreshToken = await _tokens.readRefreshToken();
    await _api.revokeRefreshToken(refreshToken);
    await _tokens.clear();
  }

  Future<bool> hasStoredSession() async =>
      (await _tokens.readAccessToken()) != null;
}
