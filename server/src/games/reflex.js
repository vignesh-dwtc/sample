// Reflex: client-reported 60-second arcade run. Server applies sanity caps.
export const REFLEX_DURATION_MS = 60000;
export const REFLEX_TOLERANCE_MS = 5000;
export const REFLEX_MAX_SCORE = 150;
export const REFLEX_POINTS_PER_HIT_MAX = 3; // golden targets are worth 3
export const REFLEX_MIN_GAP_MS = 45000;      // upper bound on the gap between two counted runs
export const REFLEX_MISS_PENALTY_MS = 2000;  // each miss takes 2s off the run's clock
export const REFLEX_MIN_GAP_FLOOR_MS = 15000; // never count runs closer together than this

const isInt = (n) => Number.isInteger(n) && n >= 0;

/** Returns an error message, or null when the submission is plausible. */
export function validateReflex(body) {
  const { score, hits, misses, durationMs } = body || {};
  if (![score, hits, misses].every(isInt)) return 'score, hits and misses must be non-negative integers';
  if (typeof durationMs !== 'number' || !Number.isFinite(durationMs)) return 'durationMs must be a number';
  if (score > REFLEX_MAX_SCORE) return 'Score is out of range';
  if (Math.abs(durationMs - REFLEX_DURATION_MS) > REFLEX_TOLERANCE_MS) return 'Run duration is out of range';
  if (score > hits * REFLEX_POINTS_PER_HIT_MAX) return 'Score does not match hits';
  if (hits > REFLEX_MAX_SCORE || misses > 500) return 'Too many taps';
  return null;
}

export const reflexXp = (score) => Math.min(60, 10 + score);

/**
 * Minimum wall-clock time since the previous counted run before this one may count.
 * Misses take 2s off the clock, so a miss-heavy run legitimately finishes well under 60s;
 * the gap is the run's real playing time (duration minus penalties), less tolerance,
 * clamped to [REFLEX_MIN_GAP_FLOOR_MS, REFLEX_MIN_GAP_MS].
 */
export function reflexMinGapMs({ durationMs, misses }) {
  const played = durationMs - misses * REFLEX_MISS_PENALTY_MS - REFLEX_TOLERANCE_MS;
  return Math.max(REFLEX_MIN_GAP_FLOOR_MS, Math.min(REFLEX_MIN_GAP_MS, played));
}
