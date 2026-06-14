import 'package:flutter_test/flutter_test.dart';
import 'package:sector7_mobile/src/features/client/data/client_models.dart';

void main() {
  group('SessionStatus.fromApi', () {
    test('maps known Prisma values', () {
      expect(SessionStatus.fromApi('SCHEDULED'), SessionStatus.scheduled);
      expect(SessionStatus.fromApi('IN_PROGRESS'), SessionStatus.inProgress);
      expect(SessionStatus.fromApi('COMPLETED'), SessionStatus.completed);
      expect(SessionStatus.fromApi('NO_SHOW'), SessionStatus.noShow);
      expect(SessionStatus.fromApi('CANCELLED'), SessionStatus.cancelled);
    });

    test('unknown / null falls back to unknown', () {
      expect(SessionStatus.fromApi('WAT'), SessionStatus.unknown);
      expect(SessionStatus.fromApi(null), SessionStatus.unknown);
    });

    test('isLive only for in-progress', () {
      expect(SessionStatus.inProgress.isLive, isTrue);
      expect(SessionStatus.scheduled.isLive, isFalse);
    });
  });

  group('SessionSummary.fromJson', () {
    test('parses a list row with trainer + counts', () {
      final s = SessionSummary.fromJson({
        'id': 'sess_1',
        'scheduledDate': '2026-06-16T00:00:00.000Z',
        'scheduledTime': '06:30',
        'durationMin': 60,
        'status': 'SCHEDULED',
        'isCarryForward': false,
        'notes': null,
        'trainer': {
          'user': {'firstName': 'Maya', 'lastName': 'Rao'},
        },
      });
      expect(s.id, 'sess_1');
      expect(s.scheduledTime, '06:30');
      expect(s.durationMin, 60);
      expect(s.status, SessionStatus.scheduled);
      expect(s.trainerName, 'Maya Rao');
      expect(s.scheduledDate, isNotNull);
    });

    test('tolerates missing trainer + optional fields', () {
      final s = SessionSummary.fromJson({
        'id': 'sess_2',
        'scheduledTime': '18:00',
        'durationMin': 45,
        'status': 'COMPLETED',
      });
      expect(s.trainerName, isNull);
      expect(s.scheduledDate, isNull);
      expect(s.isCarryForward, isFalse);
      expect(s.status, SessionStatus.completed);
    });
  });

  group('WorkoutSetEntry.summary', () {
    test('joins present fields, trims whole-number weight', () {
      final set = WorkoutSetEntry.fromJson({
        'setNumber': 1,
        'reps': 12,
        'weightKg': 40.0,
        'rpe': 8,
      });
      expect(set.summary, '12 reps · 40kg');
      expect(set.weightKg, 40.0);
      expect(set.rpe, 8);
    });

    test('keeps fractional weight, handles empty set', () {
      expect(
        WorkoutSetEntry.fromJson({'setNumber': 2, 'weightKg': 2.5}).summary,
        '2.5kg',
      );
      expect(WorkoutSetEntry.fromJson({'setNumber': 3}).summary, '—');
    });
  });

  group('SessionDetail.fromJson', () {
    test('parses nested workout logs + sets ', () {
      final d = SessionDetail.fromJson({
        'id': 'sess_3',
        'scheduledDate': '2026-06-10T00:00:00.000Z',
        'scheduledTime': '07:00',
        'durationMin': 60,
        'status': 'COMPLETED',
        'isCarryForward': false,
        'client': {
          'id': 'cli_1',
          'user': {'firstName': 'Arun', 'lastName': 'K'},
        },
        'workoutLogs': [
          {
            'id': 'log_1',
            'isCompleted': true,
            'exercise': {'name': 'Bench Press', 'targetMuscleGroup': 'Chest'},
            'sets': [
              {'setNumber': 1, 'reps': 10, 'weightKg': 50},
              {'setNumber': 2, 'reps': 8, 'weightKg': 55},
            ],
          },
        ],
      });
      expect(d.clientName, 'Arun K');
      expect(d.workoutLogs, hasLength(1));
      expect(d.workoutLogs.first.exerciseName, 'Bench Press');
      expect(d.workoutLogs.first.muscleGroup, 'Chest');
      expect(d.workoutLogs.first.sets, hasLength(2));
      expect(d.workoutLogs.first.sets.first.summary, '10 reps · 50kg');
    });

    test('handles empty workout logs', () {
      final d = SessionDetail.fromJson({
        'id': 'sess_4',
        'scheduledTime': '09:00',
        'durationMin': 30,
        'status': 'SCHEDULED',
      });
      expect(d.workoutLogs, isEmpty);
      expect(d.clientName, isNull);
    });
  });

  group('ClientDashboard.fromJson', () {
    test('parses full payload', () {
      final d = ClientDashboard.fromJson({
        'sessionCount': {
          'used': 4,
          'remaining': 6,
          'completed': 3,
          'scheduled': 6,
          'noShow': 1,
          'total': 10,
        },
        'nextSession': {
          'id': 'sess_next',
          'scheduledDate': '2026-06-16T00:00:00.000Z',
          'scheduledTime': '06:30',
          'durationMin': 60,
          'status': 'SCHEDULED',
          'trainer': {
            'user': {'firstName': 'Maya', 'lastName': 'Rao'},
          },
        },
        'activeSession': null,
        'trainer': {'name': 'Maya Rao', 'sessionsPerMonth': 12},
        'packageExpiry': {
          'daysUntilExpiry': 20,
          'isExpired': false,
          'endDate': '2026-07-04T00:00:00.000Z',
        },
        'engagementStats': {
          'streak': 5,
          'allTimeCompleted': 42,
          'daysSinceLastSession': 2,
          'monthAttendanceRate': 80,
        },
        'prs': [
          {'exerciseName': 'Deadlift', 'muscle': 'Back', 'maxWeightKg': 120},
        ],
      });

      expect(d.sessionCount.used, 4);
      expect(d.sessionCount.remaining, 6);
      expect(d.nextSession?.trainerName, 'Maya Rao');
      expect(d.activeSession, isNull);
      expect(d.trainerName, 'Maya Rao');
      expect(d.packageExpiry?.daysUntilExpiry, 20);
      expect(d.packageExpiry?.isExpired, isFalse);
      expect(d.engagementStats.streak, 5);
      expect(d.engagementStats.monthAttendanceRate, 80);
      expect(d.prs, hasLength(1));
      expect(d.prs.first.exerciseName, 'Deadlift');
      expect(d.prs.first.maxWeightKg, 120);
    });

    test('falls back to empty sub-objects on a sparse payload', () {
      final d = ClientDashboard.fromJson({'sessionCount': {}});
      expect(d.sessionCount.used, 0);
      expect(d.engagementStats.streak, 0);
      expect(d.nextSession, isNull);
      expect(d.activeSession, isNull);
      expect(d.trainerName, isNull);
      expect(d.prs, isEmpty);
    });
  });
}
