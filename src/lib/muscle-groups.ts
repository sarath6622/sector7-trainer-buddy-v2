/**
 * Curated muscle-group buckets used by the trainer's "today's focus" picker.
 *
 * The exercise catalog stores fine-grained `targetMuscleGroup` strings
 * (Quadriceps, Hamstrings, Calves, Glutes, ...). For session planning the
 * trainer doesn't want a 13-card grid — they want to say "Legs today" and
 * have the matcher pull every primary leg exercise. Each curated group lists
 * the catalog values it absorbs.
 */

export type CuratedMuscleGroupId =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'legs'
  | 'core'
  | 'fullbody';

export interface CuratedMuscleGroup {
  id: CuratedMuscleGroupId;
  label: string;
  /** Catalog `targetMuscleGroup` values that map into this bucket (case-insensitive). */
  includes: string[];
  /** Lucide icon name — looked up by the picker UI. */
  icon:
    | 'shield'
    | 'flame'
    | 'mountain'
    | 'biceps-flexed'
    | 'arm'
    | 'footprints'
    | 'circle-dot'
    | 'sparkles';
}

export const CURATED_MUSCLE_GROUPS: CuratedMuscleGroup[] = [
  { id: 'chest', label: 'Chest', includes: ['Chest'], icon: 'shield' },
  { id: 'back', label: 'Back', includes: ['Back', 'Lats', 'Lower Back'], icon: 'mountain' },
  {
    id: 'shoulders',
    label: 'Shoulders',
    includes: ['Shoulders', 'Rear Deltoid'],
    icon: 'flame',
  },
  { id: 'biceps', label: 'Biceps', includes: ['Biceps', 'Forearms'], icon: 'biceps-flexed' },
  { id: 'triceps', label: 'Triceps', includes: ['Triceps'], icon: 'arm' },
  {
    id: 'legs',
    label: 'Legs',
    includes: ['Quadriceps', 'Hamstrings', 'Glutes', 'Calves', 'Legs'],
    icon: 'footprints',
  },
  { id: 'core', label: 'Core', includes: ['Core', 'Abs'], icon: 'circle-dot' },
  { id: 'fullbody', label: 'Full Body', includes: ['Full Body'], icon: 'sparkles' },
];

const BY_ID = new Map(CURATED_MUSCLE_GROUPS.map((g) => [g.id, g]));

export function getCuratedGroup(id: string): CuratedMuscleGroup | undefined {
  return BY_ID.get(id as CuratedMuscleGroupId);
}

/** Resolve a list of curated IDs to the union of their catalog `targetMuscleGroup` values. */
export function expandCuratedGroups(ids: string[]): string[] {
  const out = new Set<string>();
  for (const id of ids) {
    const g = BY_ID.get(id as CuratedMuscleGroupId);
    if (g) for (const v of g.includes) out.add(v);
  }
  return [...out];
}

/** Reverse lookup: which curated bucket does a catalog `targetMuscleGroup`
 *  value (e.g. "Quadriceps") fall into? Returns `null` for orphan values. */
export function curatedGroupOf(catalogValue: string): CuratedMuscleGroupId | null {
  const lower = catalogValue.toLowerCase();
  for (const g of CURATED_MUSCLE_GROUPS) {
    if (g.includes.some((v) => v.toLowerCase() === lower)) return g.id;
  }
  return null;
}
