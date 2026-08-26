/**
 * Fuzzy matching for the exercise catalog.
 *
 * Trainers type what they call a lift, not what the catalog calls it:
 * "incline press" for "Incline Chest Press (Machine)", "benchpress" for
 * "Bench Press", "deadlft" for "Deadlift". A SQL `contains` on the raw query
 * misses every one of those because it demands one contiguous substring, so
 * search is scored here instead. The catalog is a curated library (low
 * hundreds of rows), small enough to rank in memory on each keystroke.
 *
 * Two passes, in order:
 *   strict  — every query token must match something, word order ignored
 *   relaxed — only when strict finds nothing: one strong token match is
 *             enough, so a trainer sees near misses instead of a dead end
 */

export interface SearchableExercise {
  name: string;
  targetMuscleGroup: string;
  equipmentRequired?: string | null;
}

/** Fields searched, and how much a hit in each is worth. Name dominates —
 *  matching "chest" against the muscle column is far weaker evidence than
 *  matching it inside the exercise name. */
const FIELD_WEIGHTS = {
  name: 1,
  targetMuscleGroup: 0.6,
  equipmentRequired: 0.55,
} as const;

/** A token needs at least this much to count as "matched" in strict mode. */
const STRICT_TOKEN_FLOOR = 0.25;
/** Relaxed mode is a last resort, so it demands a near-exact hit on one token
 *  (0.7 ≈ a prefix match on the name) before showing anything. */
const RELAXED_TOKEN_FLOOR = 0.7;
/** Cap on relaxed suggestions — these are guesses, not a catalog dump. */
const RELAXED_LIMIT = 25;

/** Token-level scores. Phrase-level matches are scored above these so an
 *  exercise whose name literally contains the query always sorts first. */
const SCORE_TOKEN_EXACT = 1;
const SCORE_TOKEN_PREFIX = 0.92;
const SCORE_TOKEN_EXTENDS = 0.8;
/** How much longer a query token may be than the catalog token it extends.
 *  Keeps this rule on plurals and suffixes ("rows" → "row") instead of letting
 *  compound queries match their first word ("benchpress" → any "Bench" kit,
 *  "deadlft" → "Dead Bug"). Compounds are caught by the compact-name rule. */
const MAX_EXTENSION = 2;
const SCORE_TOKEN_CONTAINS = 0.78;
const SCORE_TOKEN_FUZZY = 0.7;
/** A query word that spans two catalog words ("pushdown" vs "push down").
 *  Scored just under a plain substring hit — the word boundary it ignores is
 *  weak evidence against it. */
const SCORE_TOKEN_SPANS_WORDS = 0.75;
/** Below this length, spanning is too loose to be meaningful. */
const MIN_SPAN_LENGTH = 4;
/** Token-pass results are compressed into [0, 0.85] so they never outrank the
 *  phrase-level bands below. */
const TOKEN_PASS_CEILING = 0.85;

const SCORE_NAME_EXACT = 1;
const SCORE_NAME_PREFIX = 0.96;
const SCORE_NAME_CONTAINS = 0.92;
const SCORE_NAME_COMPACT = 0.88;

/** Lowercase and reduce every non-alphanumeric run to a single space, so
 *  "Incline Chest Press (Machine)" and "incline chest press machine" are the
 *  same string to the matcher. */
export function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function tokenize(value: string): string[] {
  const normalized = normalize(value);
  return normalized.length === 0 ? [] : normalized.split(' ');
}

/** Whitespace-free form, so "benchpress" can match "Bench Press". */
function compact(normalized: string): string {
  return normalized.replace(/ /g, '');
}

/** How many single-character edits a token of this length may be off by.
 *  Short tokens get none — at 3 characters, one edit reaches a different word. */
function maxEdits(length: number): number {
  if (length <= 3) return 0;
  if (length <= 5) return 1;
  return 2;
}

/**
 * Levenshtein distance, abandoned early once every cell in a row exceeds
 * `limit` — the answer is then only "further than we care about".
 */
export function levenshtein(a: string, b: string, limit: number): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(
        (prev[j] ?? 0) + 1, // deletion
        (curr[j - 1] ?? 0) + 1, // insertion
        (prev[j - 1] ?? 0) + cost, // substitution
      );
      curr[j] = value;
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > limit) return limit + 1;
    const swap = prev;
    prev = curr;
    curr = swap;
  }

  return prev[b.length] ?? limit + 1;
}

/** Score one query token against one catalog token. 0 means no match. */
function scoreToken(query: string, target: string): number {
  if (query === target) return SCORE_TOKEN_EXACT;
  if (target.startsWith(query)) return SCORE_TOKEN_PREFIX;
  if (query.startsWith(target) && query.length - target.length <= MAX_EXTENSION) {
    return SCORE_TOKEN_EXTENDS;
  }
  if (query.length >= 3 && target.includes(query)) return SCORE_TOKEN_CONTAINS;

  const limit = maxEdits(query.length);
  if (limit === 0) return 0;
  const distance = levenshtein(query, target, limit);
  if (distance > limit) return 0;
  return SCORE_TOKEN_FUZZY * (1 - distance / Math.max(query.length, target.length));
}

/**
 * Relevance of one exercise for one query, in [0, 1]. 0 = not a match.
 *
 * `requireAllTokens` is strict mode: every token of the query must land
 * somewhere. Turning it off is the relaxed pass.
 */
export function scoreExercise(
  query: string,
  exercise: SearchableExercise,
  { requireAllTokens = true }: { requireAllTokens?: boolean } = {},
): number {
  const normalizedQuery = normalize(query);
  if (normalizedQuery.length === 0) return 0;

  // Phrase level first — the strongest signal, and the common case.
  const normalizedName = normalize(exercise.name);
  if (normalizedName === normalizedQuery) return SCORE_NAME_EXACT;
  if (normalizedName.startsWith(normalizedQuery)) return SCORE_NAME_PREFIX;
  if (normalizedName.includes(normalizedQuery)) return SCORE_NAME_CONTAINS;
  if (compact(normalizedName).includes(compact(normalizedQuery))) return SCORE_NAME_COMPACT;

  // Token level — the query's words spread across the searched fields in any
  // order, each word allowed to be slightly misspelt.
  const normalizedMuscle = normalize(exercise.targetMuscleGroup);
  const normalizedEquipment = normalize(exercise.equipmentRequired ?? '');
  const fields: { tokens: string[]; compacted: string; weight: number }[] = [
    {
      tokens: normalizedName.split(' '),
      compacted: compact(normalizedName),
      weight: FIELD_WEIGHTS.name,
    },
    {
      tokens: tokenize(exercise.targetMuscleGroup),
      compacted: compact(normalizedMuscle),
      weight: FIELD_WEIGHTS.targetMuscleGroup,
    },
    {
      tokens: tokenize(exercise.equipmentRequired ?? ''),
      compacted: compact(normalizedEquipment),
      weight: FIELD_WEIGHTS.equipmentRequired,
    },
  ];

  const queryTokens = normalizedQuery.split(' ');
  let total = 0;
  let best = 0;
  let matched = 0;

  for (const queryToken of queryTokens) {
    let bestForToken = 0;
    for (const { tokens, compacted, weight } of fields) {
      for (const targetToken of tokens) {
        bestForToken = Math.max(bestForToken, weight * scoreToken(queryToken, targetToken));
      }
      if (queryToken.length >= MIN_SPAN_LENGTH && compacted.includes(queryToken)) {
        bestForToken = Math.max(bestForToken, weight * SCORE_TOKEN_SPANS_WORDS);
      }
    }
    if (bestForToken >= STRICT_TOKEN_FLOOR) matched++;
    if (bestForToken > best) best = bestForToken;
    total += bestForToken;
  }

  if (requireAllTokens) {
    if (matched < queryTokens.length) return 0;
  } else if (best < RELAXED_TOKEN_FLOOR) {
    return 0;
  }

  return (total / queryTokens.length) * TOKEN_PASS_CEILING;
}

export interface ExerciseSearchResult<T> {
  matches: T[];
  /** True when strict matching found nothing and these are near misses — the
   *  UI should label them as such rather than presenting them as hits. */
  relaxed: boolean;
}

function rank<T extends SearchableExercise>(
  query: string,
  items: T[],
  requireAllTokens: boolean,
): T[] {
  return items
    .map((item) => ({ item, score: scoreExercise(query, item, { requireAllTokens }) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name))
    .map((entry) => entry.item);
}

/**
 * Rank a catalog against a free-text query: strict pass, then a relaxed pass
 * only if strict came back empty.
 */
export function searchExerciseCatalog<T extends SearchableExercise>(
  query: string,
  items: T[],
): ExerciseSearchResult<T> {
  if (normalize(query).length === 0) return { matches: items, relaxed: false };

  const strict = rank(query, items, true);
  if (strict.length > 0) return { matches: strict, relaxed: false };

  return { matches: rank(query, items, false).slice(0, RELAXED_LIMIT), relaxed: true };
}
