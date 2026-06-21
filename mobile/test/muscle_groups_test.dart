import 'package:flutter_test/flutter_test.dart';
import 'package:sector7_mobile/src/features/workout/data/muscle_groups.dart';

void main() {
  group('curatedGroupOf', () {
    test('maps catalog values into buckets (case-insensitive)', () {
      expect(curatedGroupOf('Quadriceps'), 'legs');
      expect(curatedGroupOf('hamstrings'), 'legs');
      expect(curatedGroupOf('Glutes'), 'legs');
      expect(curatedGroupOf('Chest'), 'chest');
      expect(curatedGroupOf('Lats'), 'back');
      expect(curatedGroupOf('Lower Back'), 'back');
      expect(curatedGroupOf('Rear Deltoid'), 'shoulders');
      expect(curatedGroupOf('Abs'), 'core');
      expect(curatedGroupOf('Forearms'), 'biceps');
    });

    test('returns null for orphan / empty values', () {
      expect(curatedGroupOf('Neck'), isNull);
      expect(curatedGroupOf(''), isNull);
    });
  });

  test('allCuratedGroupIds covers the 8 buckets in canonical order', () {
    expect(allCuratedGroupIds, [
      'chest',
      'back',
      'shoulders',
      'biceps',
      'triceps',
      'legs',
      'core',
      'fullbody',
    ]);
  });

  test('curatedGroupById resolves a bucket and its catalog values', () {
    expect(curatedGroupById['legs']?.label, 'Legs');
    expect(curatedGroupById['legs']?.includes, contains('Calves'));
    expect(curatedGroupById['nope'], isNull);
  });
}
