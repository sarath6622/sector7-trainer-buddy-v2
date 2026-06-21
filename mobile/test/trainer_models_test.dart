import 'package:flutter_test/flutter_test.dart';
import 'package:sector7_mobile/src/core/util/formatters.dart';
import 'package:sector7_mobile/src/features/client/data/client_extras_models.dart';
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
      expect(c.stats.used, 6);
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

  group('TrainerClientPackage', () {
    test('parses the package block off a client card', () {
      final c = TrainerClient.fromJson({
        'clientProfile': {
          'id': 'cp_1',
          'user': {'firstName': 'Arun', 'lastName': 'Kumar'},
        },
        'isReassigned': false,
        'package': {
          'startDate': '2026-01-01T00:00:00.000Z',
          'endDate': '2026-12-31T00:00:00.000Z',
          'sessionsPerMonth': 12,
        },
      });
      expect(c.package, isNotNull);
      expect(c.package!.sessionsPerMonth, 12);
      expect(c.package!.startDate, isNotNull);
      expect(c.package!.endDate, isNotNull);
    });

    test('is null when the package block is absent', () {
      final c = TrainerClient.fromJson({
        'clientProfile': {
          'id': 'cp_2',
          'user': {'firstName': 'Bea', 'lastName': 'Lo'},
        },
        'isReassigned': false,
      });
      expect(c.package, isNull);
    });

    test('daysLeft clamps to 0 once the window has passed', () {
      final past = TrainerClientPackage(
        startDate: DateTime.now().subtract(const Duration(days: 60)),
        endDate: DateTime.now().subtract(const Duration(days: 5)),
        sessionsPerMonth: 8,
      );
      expect(past.daysLeft, 0);
      expect(past.fractionUsed, 1.0);
    });

    test('daysLeft + fractionUsed track an in-flight window', () {
      final pkg = TrainerClientPackage(
        startDate: DateTime.now().subtract(const Duration(days: 10)),
        endDate: DateTime.now().add(const Duration(days: 10)),
        sessionsPerMonth: 8,
      );
      // ~10 days remain, ~halfway through the window.
      expect(pkg.daysLeft, inInclusiveRange(9, 10));
      expect(pkg.fractionUsed, inInclusiveRange(0.45, 0.55));
    });

    test('open-ended package (no endDate) has null daysLeft', () {
      const pkg = TrainerClientPackage(
        startDate: null,
        endDate: null,
        sessionsPerMonth: 8,
      );
      expect(pkg.daysLeft, isNull);
      expect(pkg.fractionUsed, 0.0);
    });
  });

  group('TrainerDayView.fromJson', () {
    test('parses a working day with sessions + slots + summary', () {
      final v = TrainerDayView.fromJson({
        'date': '2026-06-21',
        'workingDay': true,
        'sessions': [
          {
            'id': 'sess_1',
            'clientProfileId': 'cp_1',
            'clientName': 'Test Ammu Client',
            'startTime': '07:00',
            'durationMin': 60,
            'status': 'IN_PROGRESS',
          },
        ],
        'availableSlots': [
          {'startTime': '09:00', 'endTime': '10:00', 'durationMin': 60},
          {'startTime': '10:00', 'endTime': '11:00', 'durationMin': 60},
        ],
        'summary': {'sessionCount': 1, 'bookedMin': 60, 'availableMin': 120},
      });
      expect(v.date, '2026-06-21');
      expect(v.workingDay, isTrue);
      expect(v.sessions, hasLength(1));
      expect(v.sessions.first.clientName, 'Test Ammu Client');
      expect(v.sessions.first.status, SessionStatus.inProgress);
      expect(v.availableSlots, hasLength(2));
      expect(v.availableSlots.first.endTime, '10:00');
      expect(v.summary.bookedMin, 60);
      expect(v.summary.availableMin, 120);
    });

    test('non-working day tolerates missing slots + summary', () {
      final v = TrainerDayView.fromJson({
        'date': '2026-06-22',
        'workingDay': false,
        'sessions': const [],
      });
      expect(v.workingDay, isFalse);
      expect(v.availableSlots, isEmpty);
      expect(v.summary.sessionCount, 0);
    });
  });

  group('Fmt schedule helpers', () {
    test('durationMin formats compactly', () {
      expect(Fmt.durationMin(60), '1h');
      expect(Fmt.durationMin(90), '1h 30m');
      expect(Fmt.durationMin(30), '30m');
      expect(Fmt.durationMin(0), '0m');
    });

    test('addMinutes advances HH:MM and wraps at 24h', () {
      expect(Fmt.addMinutes('07:00', 60), '08:00');
      expect(Fmt.addMinutes('07:45', 30), '08:15');
      expect(Fmt.addMinutes('23:30', 60), '00:30');
    });
  });

  group('WorkoutCalendarMonth.fromJson', () {
    test('keys days by date and reads totalDays', () {
      final m = WorkoutCalendarMonth.fromJson({
        'days': [
          {'date': '2026-06-13', 'sessionIds': ['s1'], 'isPR': false},
          {'date': '2026-06-21', 'sessionIds': ['s2', 's3'], 'isPR': true},
        ],
        'totalDays': 2,
      });
      expect(m.totalDays, 2);
      expect(m.days.keys, containsAll(['2026-06-13', '2026-06-21']));
      expect(m.days['2026-06-21']!.isPR, isTrue);
      expect(m.days['2026-06-21']!.sessionIds, ['s2', 's3']);
      expect(m.days['2026-06-13']!.isPR, isFalse);
    });

    test('falls back to day count when totalDays is missing', () {
      final m = WorkoutCalendarMonth.fromJson({
        'days': [
          {'date': '2026-06-13', 'sessionIds': <String>[], 'isPR': false},
        ],
      });
      expect(m.totalDays, 1);
    });

    test('empty constant has no days', () {
      expect(WorkoutCalendarMonth.empty.days, isEmpty);
      expect(WorkoutCalendarMonth.empty.totalDays, 0);
    });
  });

  group('CalendarDayLog.fromJson', () {
    test('parses exercise + sets + session context', () {
      final log = CalendarDayLog.fromJson({
        'id': 'wl_1',
        'exercise': {'name': 'Bench Press', 'targetMuscleGroup': 'Chest'},
        'sets': [
          {'setNumber': 1, 'reps': 8, 'weightKg': 60},
          {'setNumber': 2, 'reps': 6, 'weightKg': 70},
        ],
        'sessionInstance': {
          'id': 'sess_1',
          'scheduledTime': '07:00',
          'trainer': {
            'user': {'firstName': 'Dev', 'lastName': 'Anand'},
          },
        },
      });
      expect(log.exerciseName, 'Bench Press');
      expect(log.muscleGroup, 'Chest');
      expect(log.sets, hasLength(2));
      expect(log.sessionId, 'sess_1');
      expect(log.scheduledTime, '07:00');
      expect(log.trainerName, 'Dev Anand');
    });

    test('setSummary picks the heaviest weighted set', () {
      final log = CalendarDayLog.fromJson({
        'id': 'wl_1',
        'exercise': {'name': 'Squat'},
        'sets': [
          {'setNumber': 1, 'reps': 5, 'weightKg': 100},
          {'setNumber': 2, 'reps': 3, 'weightKg': 120},
        ],
      });
      expect(log.setSummary, 'Best 120kg × 3');
    });

    test('setSummary falls back to total reps, then null', () {
      final reps = CalendarDayLog.fromJson({
        'id': 'wl_2',
        'exercise': {'name': 'Push-up'},
        'sets': [
          {'setNumber': 1, 'reps': 12},
          {'setNumber': 2, 'reps': 10},
        ],
      });
      expect(reps.setSummary, '22 reps');

      final none = CalendarDayLog.fromJson({
        'id': 'wl_3',
        'exercise': {'name': 'Plank'},
        'sets': <Map<String, dynamic>>[],
      });
      expect(none.setSummary, isNull);
    });
  });

  group('TrainerWorkoutSession.fromJson', () {
    test('parses a session-grouped workout-history row', () {
      final s = TrainerWorkoutSession.fromJson({
        'sessionId': 'sess_1',
        'date': '2026-06-10T00:00:00.000Z',
        'time': '07:00',
        'status': 'COMPLETED',
        'durationMin': 55,
        'exercises': [
          {
            'id': 'wl_1',
            'name': 'Back Squat',
            'targetMuscleGroup': 'Legs',
            'exerciseType': 'WEIGHTED',
            'sets': [
              {'setNumber': 1, 'reps': 5, 'weightKg': 100},
              {'setNumber': 2, 'reps': 5, 'weightKg': 105},
            ],
          },
        ],
      });
      expect(s.sessionId, 'sess_1');
      expect(s.status, SessionStatus.completed);
      expect(s.durationMin, 55);
      expect(s.exercises, hasLength(1));
      expect(s.exercises.first.name, 'Back Squat');
      expect(s.exercises.first.muscleGroup, 'Legs');
      expect(s.exercises.first.sets, hasLength(2));
      expect(s.exercises.first.sets.last.weightKg, 105);
    });

    test('tolerates an empty exercises list', () {
      final s = TrainerWorkoutSession.fromJson({
        'sessionId': 'sess_2',
        'time': '08:00',
        'status': 'NO_SHOW',
      });
      expect(s.exercises, isEmpty);
      expect(s.status, SessionStatus.noShow);
    });
  });

  group('LeaveBalance + TrainerLeave', () {
    test('parses balance quotas', () {
      final b = LeaveBalance.fromJson({
        'month': '2026-06',
        'regular': {'quota': 4, 'used': 1, 'remaining': 3},
        'emergency': {'quota': 1, 'used': 0, 'remaining': 1},
      });
      expect(b.month, '2026-06');
      expect(b.regular.remaining, 3);
      expect(b.emergency.quota, 1);
    });

    test('falls back to empty quotas when missing', () {
      final b = LeaveBalance.fromJson({'month': '2026-06'});
      expect(b.regular.quota, 0);
      expect(b.emergency.remaining, 0);
    });

    test('parses a leave request with status + reason', () {
      final l = TrainerLeave.fromJson({
        'id': 'lr_1',
        'startDate': '2026-06-20T00:00:00.000Z',
        'endDate': '2026-06-21T00:00:00.000Z',
        'leaveType': 'FULL_DAY',
        'status': 'PENDING',
        'reason': 'Family',
        'createdAt': '2026-06-14T00:00:00.000Z',
      });
      expect(l.id, 'lr_1');
      expect(l.status, LeaveStatus.pending);
      expect(l.reason, 'Family');
      expect(l.startDate, isNotNull);
    });
  });

  group('TrainerRescheduleRequest.fromJson', () {
    test('reads the client identity + original/requested slots', () {
      final r = TrainerRescheduleRequest.fromJson({
        'id': 'rr_1',
        'status': 'PENDING',
        'requestedDate': '2026-06-25T00:00:00.000Z',
        'requestedTime': '09:00',
        'reason': 'Travel',
        'createdAt': '2026-06-14T00:00:00.000Z',
        'client': {
          'user': {'firstName': 'Arun', 'lastName': 'Kumar'},
        },
        'sessionInstance': {
          'scheduledDate': '2026-06-23T00:00:00.000Z',
          'scheduledTime': '07:00',
        },
      });
      expect(r.clientName, 'Arun Kumar');
      expect(r.status, RescheduleStatus.pending);
      expect(r.requestedTime, '09:00');
      expect(r.originalTime, '07:00');
      expect(r.originalDate, isNotNull);
    });
  });
}
