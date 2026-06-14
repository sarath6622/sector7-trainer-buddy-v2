import 'package:flutter_test/flutter_test.dart';
import 'package:sector7_mobile/src/features/client/data/client_models.dart';
import 'package:sector7_mobile/src/features/trainer/data/trainer_models.dart';
import 'package:sector7_mobile/src/features/trainer/data/trainer_repository.dart';

void main() {
  group('TrainerSession.fromJson', () {
    test('parses a schedule row with client + status', () {
      final s = TrainerSession.fromJson({
        'id': 'sess_1',
        'clientProfileId': 'cp_1',
        'scheduledDate': '2026-06-16T00:00:00.000Z',
        'scheduledTime': '07:00',
        'durationMin': 60,
        'status': 'IN_PROGRESS',
        'isCarryForward': false,
        'client': {
          'user': {'firstName': 'Arun', 'lastName': 'Kumar'},
        },
      });
      expect(s.id, 'sess_1');
      expect(s.clientProfileId, 'cp_1');
      expect(s.clientName, 'Arun Kumar');
      expect(s.status, SessionStatus.inProgress);
      expect(s.scheduledTime, '07:00');
      expect(s.scheduledDate, isNotNull);
    });

    test('tolerates a missing client block', () {
      final s = TrainerSession.fromJson({
        'id': 'sess_2',
        'clientProfileId': 'cp_2',
        'scheduledTime': '08:00',
        'durationMin': 45,
        'status': 'SCHEDULED',
        'isCarryForward': true,
      });
      expect(s.clientName, isNull);
      expect(s.summary.isCarryForward, isTrue);
      expect(s.status, SessionStatus.scheduled);
    });
  });

  group('TrainerClient.fromJson', () {
    test('parses a primary client card with stats + next session', () {
      final c = TrainerClient.fromJson({
        'clientProfile': {
          'id': 'cp_1',
          'user': {
            'firstName': 'Arun',
            'lastName': 'Kumar',
            'email': 'arun@gmail.com',
            'phone': '99999',
            'profileImageUrl': 'https://img/x.jpg',
          },
        },
        'measurementStale': true,
        'isReassigned': false,
        'stats': {
          'totalThisMonth': 8,
          'completed': 5,
          'noShow': 1,
          'scheduled': 2,
          'used': 6,
          'remaining': 2,
        },
        'nextSession': {
          'id': 'sess_9',
          'scheduledDate': '2026-06-20T00:00:00.000Z',
          'scheduledTime': '06:30',
        },
      });
      expect(c.clientProfileId, 'cp_1');
      expect(c.name, 'Arun Kumar');
      expect(c.phone, '99999');
      expect(c.photoUrl, 'https://img/x.jpg');
      expect(c.measurementStale, isTrue);
      expect(c.isReassigned, isFalse);
      expect(c.stats.completed, 5);
      expect(c.stats.scheduled, 2);
      expect(c.nextSession, isNotNull);
      expect(c.nextSession!.id, 'sess_9');
    });

    test('reassigned client without stats falls back to empty + no next', () {
      final c = TrainerClient.fromJson({
        'clientProfile': {
          'id': 'cp_2',
          'user': {'firstName': 'Bea', 'lastName': 'Lo'},
        },
        'isReassigned': true,
        'reassignedSessionCount': 3,
        'nextSession': null,
      });
      expect(c.name, 'Bea Lo');
      expect(c.isReassigned, isTrue);
      expect(c.reassignedSessionCount, 3);
      expect(c.stats.completed, 0);
      expect(c.nextSession, isNull);
    });
  });

  group('TrainerRepository.ymd', () {
    test('formats local date as zero-padded YYYY-MM-DD', () {
      expect(TrainerRepository.ymd(DateTime(2026, 6, 7)), '2026-06-07');
      expect(TrainerRepository.ymd(DateTime(2026, 12, 31)), '2026-12-31');
    });
  });
}
