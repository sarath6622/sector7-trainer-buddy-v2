import { describe, it, expect } from 'vitest';
import { searchExerciseCatalog, scoreExercise, normalize } from '@/lib/exerciseSearch';

/** A slice of the real catalog — these names are why the matcher exists. */
const CATALOG = [
  { name: 'Bench Press', targetMuscleGroup: 'Chest', equipmentRequired: 'Barbell, Flat Bench' },
  { name: 'Decline Bench Press', targetMuscleGroup: 'Chest', equipmentRequired: 'Barbell' },
  {
    name: 'Incline Chest Press (Machine)',
    targetMuscleGroup: 'Chest',
    equipmentRequired: 'Incline Chest Press Machine',
  },
  {
    name: 'Incline Chest Press (Smith)',
    targetMuscleGroup: 'Chest',
    equipmentRequired: 'Smith Machine, Incline Bench',
  },
  {
    name: 'Incline Dumbbell Press',
    targetMuscleGroup: 'Chest',
    equipmentRequired: 'Dumbbells, Incline Bench',
  },
  { name: 'Deadlift', targetMuscleGroup: 'Back', equipmentRequired: 'Barbell' },
  { name: 'Romanian Deadlift', targetMuscleGroup: 'Hamstrings', equipmentRequired: 'Barbell' },
  { name: 'Dead Bug', targetMuscleGroup: 'Core', equipmentRequired: null },
  { name: 'Tricep Pushdown', targetMuscleGroup: 'Triceps', equipmentRequired: 'Cable Machine' },
  {
    name: 'Triceps rope push down',
    targetMuscleGroup: 'Triceps',
    equipmentRequired: 'Cable Machine',
  },
  { name: 'Lat Pulldown', targetMuscleGroup: 'Lats', equipmentRequired: 'Lat Pulldown Machine' },
  { name: 'Bulgarian Split Squat', targetMuscleGroup: 'Quadriceps', equipmentRequired: 'Bench' },
  { name: 'Leg Curl', targetMuscleGroup: 'Hamstrings', equipmentRequired: 'Leg Curl Machine' },
];

const namesFor = (query: string) =>
  searchExerciseCatalog(query, CATALOG).matches.map((e) => e.name);

describe('normalize', () => {
  it('folds case and punctuation into single spaces', () => {
    expect(normalize('Incline Chest Press (Machine)')).toBe('incline chest press machine');
    expect(normalize('  Close-Grip   Bench Press ')).toBe('close grip bench press');
  });
});

describe('searchExerciseCatalog — word order and gaps', () => {
  // The bug this module was written for: a trainer types the lift the way they
  // say it, and a SQL `contains` on the whole phrase finds nothing.
  it('finds "Incline Chest Press" from "incline press"', () => {
    const names = namesFor('incline press');
    expect(names).toContain('Incline Chest Press (Machine)');
    expect(names).toContain('Incline Chest Press (Smith)');
    expect(names).toContain('Incline Dumbbell Press');
  });

  it('ignores word order', () => {
    expect(namesFor('pulldown lat')).toEqual(['Lat Pulldown']);
  });

  it('matches a query word that spans two catalog words', () => {
    expect(namesFor('tricep pushdown')).toEqual(['Tricep Pushdown', 'Triceps rope push down']);
  });

  it('matches a compound query against a spaced name', () => {
    expect(namesFor('benchpress')[0]).toBe('Bench Press');
  });

  it('matches on equipment as well as name', () => {
    expect(namesFor('smith machine')).toEqual(['Incline Chest Press (Smith)']);
  });
});

describe('searchExerciseCatalog — typos', () => {
  it('tolerates a dropped letter and ranks the real lift first', () => {
    expect(namesFor('deadlft')[0]).toBe('Deadlift');
  });

  it('tolerates a misspelt word inside a phrase', () => {
    expect(namesFor('incline dumbell press')).toContain('Incline Dumbbell Press');
  });

  it('does not let a compound query match on its first word alone', () => {
    // "deadlft" must not drag in "Dead Bug", and "benchpress" must not drag in
    // everything that happens to use a bench.
    expect(namesFor('deadlft')).not.toContain('Dead Bug');
    expect(namesFor('benchpress')).not.toContain('Bulgarian Split Squat');
  });
});

describe('searchExerciseCatalog — ranking', () => {
  it('puts an exact name match first', () => {
    expect(namesFor('bench press')[0]).toBe('Bench Press');
  });

  it('ranks a name match above a muscle-group-only match', () => {
    const names = namesFor('chest');
    expect(names.indexOf('Incline Chest Press (Machine)')).toBeLessThan(
      names.indexOf('Bench Press'),
    );
  });

  it('scores a prefix of the name above a mid-word hit', () => {
    const exercise = CATALOG[0]!;
    expect(scoreExercise('bench', exercise)).toBeGreaterThan(scoreExercise('barbell', exercise));
  });
});

describe('searchExerciseCatalog — relaxed fallback', () => {
  it('returns near misses rather than nothing when no strict match exists', () => {
    // "cabel" is two edits from "cable" — past the strict bar for a 5-letter
    // word, but still the obvious intent.
    const result = searchExerciseCatalog('cabel fly', CATALOG);
    expect(result.relaxed).toBe(true);
  });

  it('flags strict results as not relaxed', () => {
    expect(searchExerciseCatalog('incline press', CATALOG).relaxed).toBe(false);
  });

  it('returns nothing for a query with no plausible match', () => {
    expect(searchExerciseCatalog('zzzqqq', CATALOG).matches).toEqual([]);
  });

  it('returns the whole catalog untouched for an empty query', () => {
    const result = searchExerciseCatalog('   ', CATALOG);
    expect(result.matches).toHaveLength(CATALOG.length);
    expect(result.relaxed).toBe(false);
  });
});
