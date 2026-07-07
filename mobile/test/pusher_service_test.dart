import 'package:flutter_test/flutter_test.dart';
import 'package:sector7_mobile/src/core/realtime/pusher_service.dart';

void main() {
  group('decodePusherData', () {
    test('parses a JSON-string payload (the usual Pusher delivery)', () {
      final out = decodePusherData('{"sessionId":"s1","actorUserId":"u9"}');
      expect(out, {'sessionId': 's1', 'actorUserId': 'u9'});
    });

    test('passes through an already-decoded map', () {
      final out = decodePusherData({'a': 1, 'b': 'two'});
      expect(out, {'a': 1, 'b': 'two'});
    });

    test('empty string → empty map', () {
      expect(decodePusherData(''), <String, dynamic>{});
    });

    test('null → empty map', () {
      expect(decodePusherData(null), <String, dynamic>{});
    });

    test('malformed JSON → empty map (never throws)', () {
      expect(decodePusherData('{not json'), <String, dynamic>{});
    });

    test('JSON that is not an object (array) → empty map', () {
      expect(decodePusherData('[1,2,3]'), <String, dynamic>{});
    });
  });

  group('PusherService (no build-time creds → disabled)', () {
    test('enabled is false without PUSHER_KEY/CLUSTER dart-defines', () {
      expect(PusherService().enabled, isFalse);
    });

    test('subscribe/unsubscribe are no-ops and never emit when disabled', () async {
      final svc = PusherService();
      final seen = <RealtimeEvent>[];
      final sub = svc.events.listen(seen.add);

      // Must not touch the platform channel (would throw without a binding).
      await svc.subscribe('session-abc');
      await svc.unsubscribe('session-abc');
      await Future<void>.delayed(const Duration(milliseconds: 10));

      expect(seen, isEmpty);
      await sub.cancel();
    });
  });
}
