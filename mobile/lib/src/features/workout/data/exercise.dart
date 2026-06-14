/// Exercise library item from `GET /api/exercises` (open to all authenticated
/// users; trainers + clients use it during workout logging).
class Exercise {
  const Exercise({
    required this.id,
    required this.name,
    required this.targetMuscleGroup,
    required this.category,
    required this.exerciseType,
    required this.secondaryMetric,
    this.equipment,
  });

  final String id;
  final String name;
  final String targetMuscleGroup;
  final String category;
  final String exerciseType; // WEIGHTED | BODYWEIGHT | CARDIO | TIMED ...
  final String secondaryMetric; // KM | STEPS | ...
  final String? equipment;

  bool get isCardio => exerciseType == 'CARDIO';
  bool get isBodyweight => exerciseType == 'BODYWEIGHT';
  bool get tracksSteps => isCardio && secondaryMetric == 'STEPS';

  factory Exercise.fromJson(Map<String, dynamic> json) => Exercise(
        id: json['id'] as String,
        name: (json['name'] ?? '') as String,
        targetMuscleGroup: (json['targetMuscleGroup'] ?? '') as String,
        category: (json['category'] ?? '') as String,
        exerciseType: (json['exerciseType'] ?? 'WEIGHTED') as String,
        secondaryMetric: (json['secondaryMetric'] ?? 'KM') as String,
        equipment: json['equipmentRequired'] as String?,
      );
}
