// Carrom Strike scoring rules — pure functions, unit-tested in node.
//
// • White 20, black 10. Pocketing 2+ coins in one shot is a combo: that shot's coin points double.
// • Queen 50, provisional until "covered" by pocketing any coin in the same or the next shot (+50 bonus).
//   If not covered, the queen's 50 is taken back and she returns to the centre.
// • Striker foul (striker pocketed): −10, striker returns to the baseline.
// • Score never drops below 0 and is capped at MAX_SCORE (server cap for arcade_carrom is 600).

export const ROUND_SECONDS = 120;
export const POINTS_WHITE = 20;
export const POINTS_BLACK = 10;
export const POINTS_QUEEN = 50;
export const COVER_BONUS = 50;
export const FOUL_PENALTY = 10;
export const MAX_SCORE = 500;
export const TOTAL_WHITE = 9;
export const TOTAL_BLACK = 9;

export function createRules() {
  return {
    score: 0,
    white: 0, black: 0,
    queen: 'board', // 'board' | 'pending' | 'covered'
    queenCovered: false,
    bestCombo: 0, // most coins in a single shot
    combos: 0,
    fouls: 0,
    shots: 0,
  };
}

const clampScore = (s) => Math.max(0, Math.min(MAX_SCORE, s));

/**
 * Apply one finished shot.
 * @param st rules state (mutated)
 * @param shot { white, black, queen: bool, striker: bool } pocketed this shot
 * @param left { white, black } coins still on the board after the shot
 * @returns outcome { points, coinPoints, combo, multiplier, queenPocketed, covered, queenReturned, foul }
 */
export function resolveShot(st, shot, left = { white: 1, black: 1 }) {
  const w = shot.white | 0, b = shot.black | 0, q = !!shot.queen, foul = !!shot.striker;
  const coins = w + b + (q ? 1 : 0);
  const combo = coins >= 2;
  const multiplier = combo ? 2 : 1;
  const coinPoints = (w * POINTS_WHITE + b * POINTS_BLACK) * multiplier;
  let points = coinPoints;
  let covered = false, queenReturned = false;

  st.shots += 1;
  st.white += w; st.black += b;
  if (coins > st.bestCombo) st.bestCombo = coins;
  if (combo) st.combos += 1;

  if (q) {
    points += POINTS_QUEEN;
    const nothingLeft = (left.white | 0) + (left.black | 0) === 0;
    if (w + b > 0 || nothingLeft) covered = true; // covered in the same shot (or nothing left to cover with)
    else st.queen = 'pending';
  } else if (st.queen === 'pending') {
    if (w + b > 0) covered = true;
    else { points -= POINTS_QUEEN; queenReturned = true; st.queen = 'board'; }
  }
  if (covered) { points += COVER_BONUS; st.queen = 'covered'; st.queenCovered = true; }
  if (foul) { points -= FOUL_PENALTY; st.fouls += 1; }

  const before = st.score;
  st.score = clampScore(before + points);
  return { points: st.score - before, rawPoints: points, coinPoints, combo, multiplier, coins, queenPocketed: q, covered, queenReturned, foul };
}

/** End of round: an uncovered queen is lost. Returns the points change. */
export function finalizeRound(st) {
  if (st.queen === 'pending') {
    st.queen = 'board';
    const before = st.score;
    st.score = clampScore(st.score - POINTS_QUEEN);
    return st.score - before;
  }
  return 0;
}

/** Coins pocketed (white + black + covered queen) — what we submit as data.pocketed. */
export const pocketedCount = (st) => st.white + st.black + (st.queenCovered ? 1 : 0);

/** Theoretical best without the cap: every coin in a combo, plus queen + cover. */
export const UNCAPPED_MAX = 2 * (TOTAL_WHITE * POINTS_WHITE + TOTAL_BLACK * POINTS_BLACK) + POINTS_QUEEN + COVER_BONUS;
