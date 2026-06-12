import 'package:dio/dio.dart';

import '../config/app_config.dart';
import '../storage/token_storage.dart';
import 'api_exception.dart';

/// Thin wrapper over Dio that:
///   1. attaches the Bearer access token to every request,
///   2. unwraps the backend `{ data }` success envelope,
///   3. maps `{ error, code }` failures into [ApiException],
///   4. on 401, attempts a one-shot refresh via /api/mobile/auth/refresh and retries.
///
/// The refresh endpoint is Phase 0 backend work (see docs/flutter-migration-plan.md).
/// Until it ships, a 401 simply surfaces as an [ApiException] and the auth layer
/// logs the user out.
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

  Future<dynamic> get(String path, {Map<String, dynamic>? query}) =>
      _request(() => _dio.get(path, queryParameters: query));

  Future<dynamic> post(String path, {Object? body}) =>
      _request(() => _dio.post(path, data: body));

  Future<dynamic> put(String path, {Object? body}) =>
      _request(() => _dio.put(path, data: body));

  Future<dynamic> delete(String path, {Object? body}) =>
      _request(() => _dio.delete(path, data: body));

  Future<dynamic> _request(Future<Response> Function() send) async {
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

    if (status == 401) {
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
}
