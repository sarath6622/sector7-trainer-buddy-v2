import 'package:flutter_test/flutter_test.dart';
import 'package:sector7_mobile/src/features/client/data/progress_models.dart';

void main() {
  group('ChartMetric', () {
    test('maps to api values', () {
      expect(ChartMetric.weight.apiValue, 'weight');
      expect(ChartMetric.bodyFat.apiValue, 'bodyFat');
      expect(ChartMetric.muscleMass.apiValue, 'muscleMass');
    });
  });

  group('ChartPoint.listFromJson', () {
    test('parses date + value points, drops undated', () {
      final pts = ChartPoint.listFromJson([
        {'date': '2026-05-01T00:00:00.000Z', 'value': 80.5, 'label': 'Weight (kg)'},
        {'date': '2026-06-01T00:00:00.000Z', 'value': 79, 'label': 'Weight (kg)'},
        {'date': '', 'value': 1}, // dropped (no date)
      ]);
      expect(pts, hasLength(2));
      expect(pts.first.value, 80.5);
      expect(pts[1].value, 79.0);
      expect(pts.first.date.isBefore(pts[1].date), isTrue);
    });
  });

  group('ProgressEntry', () {
    test('parses sparse entry and lists only present measurements', () {
      final e = ProgressEntry.fromJson({
        'id': 'pe_1',
        'recordedAt': '2026-06-10T00:00:00.000Z',
        'weightKg': 78.4,
        'bodyFatPercent': 18,
        'muscleMass': null,
        'waist': 82,
        'notes': 'felt good',
      });
      expect(e.weightKg, 78.4);
      expect(e.bodyFatPercent, 18.0);
      expect(e.muscleMass, isNull);
      final labels = e.measurements.map((m) => m.label).toList();
      expect(labels, containsAll(['Weight', 'Body fat', 'Waist']));
      expect(labels, isNot(contains('Muscle'))); // null → omitted
      final weight = e.measurements.firstWhere((m) => m.label == 'Weight');
      expect(weight.value, '78.4 kg');
      final bf = e.measurements.firstWhere((m) => m.label == 'Body fat');
      expect(bf.value, '18%'); // whole number trimmed
    });

    test('empty measurements when no numeric fields', () {
      final e = ProgressEntry.fromJson({'id': 'pe_2', 'recordedAt': '2026-06-10T00:00:00.000Z'});
      expect(e.measurements, isEmpty);
    });
  });

  group('WorkoutHistoryEntry.fromJson', () {
    test('parses log + embedded session context', () {
      final w = WorkoutHistoryEntry.fromJson({
        'id': 'log_1',
        'isCompleted': true,
        'exercise': {'name': 'Squat', 'targetMuscleGroup': 'Legs'},
        'sets': [
          {'setNumber': 1, 'reps': 5, 'weightKg': 100},
        ],
        'sessionInstance': {
          'id': 'sess_9',
          'scheduledDate': '2026-06-09T00:00:00.000Z',
          'scheduledTime': '07:00',
          'status': 'COMPLETED',
          'trainer': {
            'user': {'firstName': 'Maya', 'lastName': 'Rao'},
          },
        },
      });
      expect(w.log.exerciseName, 'Squat');
      expect(w.log.sets.first.summary, '5 reps · 100kg');
      expect(w.sessionId, 'sess_9');
      expect(w.scheduledTime, '07:00');
      expect(w.trainerName, 'Maya Rao');
      expect(w.sessionDate, isNotNull);
    });

    test('tolerates missing session/trainer', () {
      final w = WorkoutHistoryEntry.fromJson({
        'id': 'log_2',
        'exercise': {'name': 'Plank'},
        'sets': const [],
      });
      expect(w.sessionId, '');
      expect(w.trainerName, isNull);
      expect(w.sessionDate, isNull);
      expect(w.log.sets, isEmpty);
    });
  });
}
