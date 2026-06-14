import 'package:dio/dio.dart';

import '../config/app_config.dart';
import '../storage/token_storage.dart';
import 'api_exception.dart';
import 'jwt.dart';

/// Thin wrapper over Dio that:
///   1. attaches the Bearer access token to every request,
///   2. unwraps the backend `{ data }` success envelope,
///   3. maps `{ error, code }` failures into [ApiException],
///   4. on 401, attempts a one-shot refresh via /api/mobile/auth/refresh and
///      retries the original request once; a failed refresh forces a logout.
///
/// The refresh endpoint is Phase 0 backend work (see docs/flutter-migration-plan.md).
class ApiClient {
  ApiClient({TokenStorage? tokenStorage, Dio? dio})
      : _tokens = tokenStorage ?? TokenStorage(),
        _dio = dio ??
            Dio(BaseOptions(
              baseUrl: AppConfig.apiPrefix,
              connectTimeout: const Duration(seconds: 15),
              receiveTimeout: const Duration(seconds: 20),
              // We handle non-2xx ourselves so we can read the error envelope.
              validateStatus: (_) => true,
            )) {
    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          // Proactively refresh an expired access token *before* sending. We
          // can't rely on a 401 to trigger the refresh-and-retry below: many
          // data routes (e.g. /api/client/*) return 403 — not 401 — for an
          // absent/expired session, so a stale token would otherwise surface
          // as "Forbidden" until a manual re-login. The auth endpoints are
          // skipped so refresh can't recurse into itself.
          final isAuthRoute = options.path.contains('/mobile/auth/');
          if (!isAuthRoute) {
            final current = await _tokens.readAccessToken();
            if (current != null && isJwtExpired(current)) {
              await _ensureRefreshed();
            }
          }
          final token = await _tokens.readAccessToken();
          if (token != null) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          handler.next(options);
        },
      ),
    );
  }

  final Dio _dio;
  final TokenStorage _tokens;

  /// Callback the auth layer registers so a hard 401 (failed refresh) can force
  /// a logout. Set in AuthController.
  void Function()? onAuthFailure;

  /// Shared in-flight refresh so concurrent 401s trigger only one refresh call.
  Future<bool>? _refreshInFlight;

  Future<dynamic> get(String path, {Map<String, dynamic>? query}) =>
      _request(() => _dio.get(path, queryParameters: query));

  Future<dynamic> post(String path, {Object? body}) =>
      _request(() => _dio.post(path, data: body));

  Future<dynamic> put(String path, {Object? body}) =>
      _request(() => _dio.put(path, data: body));

  Future<dynamic> delete(String path, {Object? body}) =>
      _request(() => _dio.delete(path, data: body));

  /// Multipart upload of a single file field. Goes through [_request] so the
  /// Bearer header, proactive/401 refresh, and `{ data }` unwrap all apply.
  Future<dynamic> uploadFile(
    String path, {
    required String filePath,
    String field = 'file',
    String? filename,
    DioMediaType? contentType,
  }) async {
    final form = FormData.fromMap({
      field: await MultipartFile.fromFile(
        filePath,
        filename: filename,
        contentType: contentType,
      ),
    });
    return _request(() => _dio.post(path, data: form));
  }

  /// Best-effort server-side logout. Bypasses the 401 auto-refresh / onAuthFailure
  /// path so signing out never loops, and swallows all errors — local tokens are
  /// cleared by the caller regardless.
  Future<void> revokeRefreshToken(String? refreshToken) async {
    try {
      await _dio.post(
        '/mobile/auth/logout',
        data: refreshToken != null ? {'refreshToken': refreshToken} : <String, dynamic>{},
      );
    } catch (_) {
      // ignore — logout is best-effort
    }
  }

  Future<dynamic> _request(Future<Response> Function() send, {bool isRetry = false}) async {
    Response res;
    try {
      res = await send();
    } on DioException catch (e) {
      throw ApiException(
        message: e.message ?? 'Network error',
        code: 'NETWORK_ERROR',
      );
    }

    final status = res.statusCode ?? 0;
    final data = res.data;

    if (status >= 200 && status < 300) {
      // Success envelope: { data: T, message? } — unwrap `data` when present.
      if (data is Map && data.containsKey('data')) return data['data'];
      return data;
    }

    if (status == 401 && !isRetry) {
      // Access token likely expired — try a single refresh, then retry once.
      final refreshed = await _ensureRefreshed();
      if (refreshed) {
        return _request(send, isRetry: true);
      }
      onAuthFailure?.call();
    } else if (status == 401) {
      // Retry still unauthorized — give up and force logout.
      onAuthFailure?.call();
    }

    if (data is Map) {
      throw ApiException(
        message: (data['error'] ?? 'Request failed').toString(),
        code: (data['code'] ?? 'UNKNOWN').toString(),
        statusCode: status,
        details: data['details'] is Map
            ? Map<String, dynamic>.from(data['details'] as Map)
            : null,
      );
    }

    throw ApiException(
      message: 'Request failed ($status)',
      code: 'UNKNOWN',
      statusCode: status,
    );
  }

  /// De-duplicated refresh: callers racing a 401 await the same future.
  Future<bool> _ensureRefreshed() {
    return _refreshInFlight ??=
        _refreshTokens().whenComplete(() => _refreshInFlight = null);
  }

  /// Exchanges the stored refresh token for a new pair. Uses a direct dio call
  /// (not [_request]) so a 401 here cannot recurse into another refresh.
  Future<bool> _refreshTokens() async {
    final refreshToken = await _tokens.readRefreshToken();
    if (refreshToken == null) return false;
    try {
      final res = await _dio.post(
        '/mobile/auth/refresh',
        data: {'refreshToken': refreshToken},
      );
      final data = res.data;
      if (res.statusCode == 200 && data is Map && data['data'] is Map) {
        final tokens = data['data'] as Map;
        final access = tokens['accessToken'];
        final refresh = tokens['refreshToken'];
        if (access is String && refresh is String) {
          await _tokens.saveTokens(accessToken: access, refreshToken: refresh);
          return true;
        }
      }
    } catch (_) {
      // fall through to false
    }
    return false;
  }
}
