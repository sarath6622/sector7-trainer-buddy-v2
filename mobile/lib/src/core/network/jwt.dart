import 'dart:convert';

/// Decodes a JWT's `exp` claim (seconds since epoch). Returns null when the
/// token is malformed or carries no integer `exp`.
DateTime? jwtExpiry(String jwt) {
  try {
    final parts = jwt.split('.');
    if (parts.length != 3) return null;
    final payload = jsonDecode(
      utf8.decode(base64Url.decode(base64Url.normalize(parts[1]))),
    ) as Map<String, dynamic>;
    final exp = payload['exp'];
    if (exp is! int) return null;
    return DateTime.fromMillisecondsSinceEpoch(exp * 1000, isUtc: true);
  } catch (_) {
    return null;
  }
}

/// True when [jwt] is expired (or within [skew] of expiring). An unparseable
/// token returns false so the caller still sends it and falls back to the
/// server's 401/refresh path rather than blocking the request.
bool isJwtExpired(String jwt, {Duration skew = const Duration(seconds: 15)}) {
  final expiry = jwtExpiry(jwt);
  if (expiry == null) return false;
  return DateTime.now().toUtc().add(skew).isAfter(expiry);
}
