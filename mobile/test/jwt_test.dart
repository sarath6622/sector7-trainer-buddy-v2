import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:sector7_mobile/src/core/network/jwt.dart';

/// Builds an unsigned JWT (header.payload.sig) with the given claims. Signature
/// is irrelevant — the client only reads `exp` locally.
String _jwt(Map<String, dynamic> claims) {
  String seg(Map<String, dynamic> m) =>
      base64Url.encode(utf8.encode(jsonEncode(m))).replaceAll('=', '');
  return '${seg({'alg': 'HS256', 'typ': 'JWT'})}.${seg(claims)}.sig';
}

int _epoch(DateTime d) => d.toUtc().millisecondsSinceEpoch ~/ 1000;

void main() {
  group('jwtExpiry', () {
    test('reads the exp claim', () {
      final exp = DateTime.utc(2030, 1, 1);
      expect(jwtExpiry(_jwt({'exp': _epoch(exp)})), exp);
    });

    test('null on malformed / missing exp', () {
      expect(jwtExpiry('not-a-jwt'), isNull);
      expect(jwtExpiry(_jwt({'sub': 'x'})), isNull);
      expect(jwtExpiry(_jwt({'exp': 'soon'})), isNull);
    });
  });

  group('isJwtExpired', () {
    test('true for a token that expired in the past', () {
      final past = _jwt({'exp': _epoch(DateTime.now().subtract(const Duration(minutes: 1)))});
      expect(isJwtExpired(past), isTrue);
    });

    test('false for a comfortably-valid token', () {
      final future = _jwt({'exp': _epoch(DateTime.now().add(const Duration(minutes: 10)))});
      expect(isJwtExpired(future), isFalse);
    });

    test('skew refreshes a token expiring within the window', () {
      final almost = _jwt({'exp': _epoch(DateTime.now().add(const Duration(seconds: 5)))});
      expect(isJwtExpired(almost), isTrue); // within the 15s default skew
      expect(isJwtExpired(almost, skew: Duration.zero), isFalse);
    });

    test('unparseable token is treated as not-expired (let server decide)', () {
      expect(isJwtExpired('garbage'), isFalse);
    });
  });
}
