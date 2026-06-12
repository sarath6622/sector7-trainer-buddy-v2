/// Normalised API error mirroring the backend envelope `{ error, code, details? }`.
/// See memory/api-contracts.md "Conventions".
class ApiException implements Exception {
  ApiException({
    required this.message,
    required this.code,
    this.statusCode,
    this.details,
  });

  final String message;
  final String code;
  final int? statusCode;
  final Map<String, dynamic>? details;

  bool get isUnauthorized => statusCode == 401 || code == 'UNAUTHORIZED';

  @override
  String toString() => 'ApiException($code, $statusCode): $message';
}
