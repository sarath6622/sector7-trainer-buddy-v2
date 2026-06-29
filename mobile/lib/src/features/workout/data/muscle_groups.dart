import 'package:flutter/material.dart';

/// Curated muscle-group buckets — Dart mirror of [src/lib/muscle-groups.ts].
///
/// The exercise catalog stores fine-grained `targetMuscleGroup` values
/// (Quadriceps, Hamstrings, Calves, …). For session planning the trainer picks
/// one of 8 buckets; the **server** expands a curated id to the union of its
/// catalog values (`expandCuratedGroups` in exercise.service), so the client
/// only ever sends ids on `GET /api/exercises?muscleGroups=chest,back`.
///
/// Keep this list in lockstep with the web source: if a bucket's `includes`
/// changes there, mirror it here.
class CuratedMuscleGroup {
  const CuratedMuscleGroup({
    required this.id,
    required this.label,
    required this.includes,
    required this.icon,
  });

  final String id;
  final String label;

  /// Catalog `targetMuscleGroup` values this bucket absorbs (case-insensitive).
  final List<String> includes;

  /// Icon shown in the "By Muscle" grid.
  final IconData icon;
}

const curatedMuscleGroups = <CuratedMuscleGroup>[
  CuratedMuscleGroup(
    id: 'chest',
    label: 'Chest',
    includes: ['Chest'],
    icon: Icons.shield_outlined,
  ),
  CuratedMuscleGroup(
    id: 'back',
    label: 'Back',
    includes: ['Back', 'Lats', 'Lower Back'],
    icon: Icons.terrain,
  ),
  CuratedMuscleGroup(
    id: 'shoulders',
    label: 'Shoulders',
    includes: ['Shoulders', 'Rear Deltoid'],
    icon: Icons.local_fire_department,
  ),
  CuratedMuscleGroup(
    id: 'biceps',
    label: 'Biceps',
    includes: ['Biceps', 'Forearms'],
    icon: Icons.sports_gymnastics,
  ),
  CuratedMuscleGroup(
    id: 'triceps',
    label: 'Triceps',
    includes: ['Triceps'],
    icon: Icons.sports_martial_arts,
  ),
  CuratedMuscleGroup(
    id: 'legs',
    label: 'Legs',
    includes: ['Quadriceps', 'Hamstrings', 'Glutes', 'Calves', 'Legs'],
    icon: Icons.directions_walk,
  ),
  CuratedMuscleGroup(
    id: 'core',
    label: 'Core',
    includes: ['Core', 'Abs'],
    icon: Icons.adjust,
  ),
  CuratedMuscleGroup(
    id: 'fullbody',
    label: 'Full Body',
    includes: ['Full Body'],
    icon: Icons.auto_awesome,
  ),
];

/// Lookup table keyed by curated id (e.g. `'chest'`).
final curatedGroupById = {for (final g in curatedMuscleGroups) g.id: g};

/// Every curated id, in canonical order. Used as the "All" default when the
/// trainer opens Suggestions with no inferred focus.
final allCuratedGroupIds = [for (final g in curatedMuscleGroups) g.id];

/// Reverse lookup: which curated bucket does a catalog `targetMuscleGroup`
/// value (e.g. "Quadriceps") fall into? Returns `null` for orphan values.
String? curatedGroupOf(String catalogValue) {
  final lower = catalogValue.toLowerCase();
  for (final g in curatedMuscleGroups) {
    if (g.includes.any((v) => v.toLowerCase() == lower)) return g.id;
  }
  return null;
}

/// Full-colour anatomical art per curated group, keyed by group id. Shared by
/// the workout logger's exercise cards and the Session-History thumbnails. A
/// group with no asset falls back to a tinted glyph at the call site.
const Map<String, String> curatedGroupImages = {
  'chest': 'assets/muscles/chest.png',
  'back': 'assets/muscles/back.png',
  'shoulders': 'assets/muscles/shoulders.png',
  'biceps': 'assets/muscles/biceps.png',
  'triceps': 'assets/muscles/triceps.png',
  'legs': 'assets/muscles/legs.png',
  'core': 'assets/muscles/core.png',
  'fullbody': 'assets/muscles/fullbody.png',
};

/// The bundled anatomical asset for a catalog `targetMuscleGroup` value (e.g.
/// "Quadriceps" → legs art), or null when the value maps to no curated group.
String? muscleGroupImageAsset(String? targetMuscleGroup) {
  if (targetMuscleGroup == null) return null;
  final id = curatedGroupOf(targetMuscleGroup);
  return id == null ? null : curatedGroupImages[id];
}
