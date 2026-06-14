import 'package:flutter_test/flutter_test.dart';
import 'package:sector7_mobile/src/features/client/data/client_extras_models.dart';

void main() {
  group('BadgesData', () {
    test('parses earned (with metadata) + locked badges', () {
      final d = BadgesData.fromJson({
        'earned': [
          {
            'id': 'ub_1',
            'awardedAt': '2026-06-01T00:00:00.000Z',
            'metadata': {'exerciseName': 'Bench Press', 'weightKg': 75},
            'badgeDefinition': {
              'name': 'PR Beast',
              'description': 'Hit a personal record',
              'icon': '🔥',
              'howToEarn': 'Set a new PR',
            },
          },
        ],
        'locked': [
          {
            'id': 'bd_2',
            'name': '100 Sessions',
            'description': 'Complete 100 sessions',
            'icon': '🏆',
            'howToEarn': 'Attend 100 sessions',
          },
        ],
      });
      expect(d.earned, hasLength(1));
      expect(d.locked, hasLength(1));
      final e = d.earned.first;
      expect(e.name, 'PR Beast');
      expect(e.earned, isTrue);
      expect(e.detail, 'Bench Press · 75kg');
      expect(e.awardedAt, isNotNull);
      expect(d.locked.first.earned, isFalse);
      expect(d.locked.first.howToEarn, 'Attend 100 sessions');
    });

    test('tolerates empty payload', () {
      final d = BadgesData.fromJson({});
      expect(d.earned, isEmpty);
      expect(d.locked, isEmpty);
    });
  });

  group('UnavailabilityDate', () {
    test('parses id + date + reason', () {
      final u = UnavailabilityDate.fromJson({
        'id': 'un_1',
        'date': '2026-07-04T00:00:00.000Z',
        'reason': 'Travel',
      });
      expect(u.id, 'un_1');
      expect(u.reason, 'Travel');
      expect(u.date.year, 2026);
    });
  });

  group('RescheduleStatus', () {
    test('maps api values', () {
      expect(RescheduleStatus.fromApi('PENDING'), RescheduleStatus.pending);
      expect(RescheduleStatus.fromApi('APPROVED'), RescheduleStatus.approved);
      expect(RescheduleStatus.fromApi('REJECTED'), RescheduleStatus.rejected);
      expect(RescheduleStatus.fromApi('???'), RescheduleStatus.unknown);
    });
  });

  group('RescheduleRequestItem.fromJson', () {
    test('parses request + original session context', () {
      final r = RescheduleRequestItem.fromJson({
        'id': 'rr_1',
        'status': 'PENDING',
        'requestedDate': '2026-06-20T00:00:00.000Z',
        'requestedTime': '18:00',
        'reason': 'Work trip',
        'createdAt': '2026-06-14T00:00:00.000Z',
        'sessionInstance': {
          'scheduledDate': '2026-06-18T00:00:00.000Z',
          'scheduledTime': '07:00',
          'trainer': {
            'user': {'firstName': 'Maya', 'lastName': 'Rao'},
          },
        },
      });
      expect(r.status, RescheduleStatus.pending);
      expect(r.requestedTime, '18:00');
      expect(r.reason, 'Work trip');
      expect(r.originalTime, '07:00');
      expect(r.trainerName, 'Maya Rao');
      expect(r.requestedDate, isNotNull);
    });

    test('tolerates missing session/trainer', () {
      final r = RescheduleRequestItem.fromJson({
        'id': 'rr_2',
        'status': 'APPROVED',
        'requestedTime': '09:00',
        'createdAt': '2026-06-14T00:00:00.000Z',
      });
      expect(r.originalDate, isNull);
      expect(r.trainerName, isNull);
      expect(r.status, RescheduleStatus.approved);
    });
  });
}
