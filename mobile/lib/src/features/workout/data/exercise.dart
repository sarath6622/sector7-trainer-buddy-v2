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

/// One set from a client's most recent prior session for an exercise, returned
/// by `GET /api/trainer/clients/[id]/last-sets`. Powers the "last time" hints
/// in the workout logger (set 1 → prior set 1, set 2 → prior set 2, …).
class LastSetSnapshot {
  const LastSetSnapshot({
    required this.setNumber,
    this.reps,
    this.weightKg,
    this.durationSec,
    this.restSec,
    this.stepsCount,
  });

  final int setNumber;
  final int? reps;
  final double? weightKg;
  final int? durationSec;
  final int? restSec;
  final int? stepsCount;

  factory LastSetSnapshot.fromJson(Map<String, dynamic> json) => LastSetSnapshot(
        setNumber: (json['setNumber'] as num?)?.toInt() ?? 1,
        reps: (json['reps'] as num?)?.toInt(),
        weightKg: (json['weightKg'] as num?)?.toDouble(),
        durationSec: (json['durationSec'] as num?)?.toInt(),
        restSec: (json['restSec'] as num?)?.toInt(),
        stepsCount: (json['stepsCount'] as num?)?.toInt(),
      );
}
