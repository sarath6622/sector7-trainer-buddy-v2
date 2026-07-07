import 'package:flutter_test/flutter_test.dart';
import 'package:sector7_mobile/src/features/workout/data/workout_repository.dart';

void main() {
  group('ExerciseQuery', () {
    test('normalizes group order for equality + hashCode', () {
      final a = ExerciseQuery(search: 'bench', groupIds: ['back', 'chest']);
      final b = ExerciseQuery(search: 'bench', groupIds: ['chest', 'back']);
      expect(a, b);
      expect(a.hashCode, b.hashCode);
    });

    test('differs on search and type', () {
      expect(ExerciseQuery(search: 'a'), isNot(ExerciseQuery(search: 'b')));
      expect(
        ExerciseQuery(type: 'CARDIO'),
        isNot(ExerciseQuery(type: 'WEIGHTED')),
      );
    });

    test('isEmpty only when nothing is set', () {
      expect(ExerciseQuery().isEmpty, isTrue);
      expect(ExerciseQuery(search: '   ').isEmpty, isTrue);
      expect(ExerciseQuery(groupIds: ['chest']).isEmpty, isFalse);
      expect(ExerciseQuery(type: 'CARDIO').isEmpty, isFalse);
      expect(ExerciseQuery(search: 'squat').isEmpty, isFalse);
    });
  });
}
