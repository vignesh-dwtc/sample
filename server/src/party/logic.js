// Pure helpers for party games (no I/O, no timers) — unit-tested directly.

/** Room codes: 4 uppercase letters, excluding the ambiguous I and O. */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export const CODE_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/;

export function makeCode(random = Math.random) {
  let s = '';
  for (let i = 0; i < 4; i++) s += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  return s;
}

export function normalizeCode(code) {
  const c = String(code ?? '').trim().toUpperCase();
  return CODE_RE.test(c) ? c : null;
}

/** Fisher–Yates shuffle returning a new array. */
export function shuffle(arr, random = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Pick `n` distinct questions and shuffle each one's choices.
 * Tries to avoid back-to-back questions from the same category.
 * Returns [{ id, category, text, choices[4], correct }].
 */
export function pickQuestions(bank, n, random = Math.random) {
  const pool = shuffle(bank, random);
  const out = [];
  while (out.length < n && pool.length) {
    const prev = out[out.length - 1];
    let idx = pool.findIndex((q) => !prev || q.category !== prev.category);
    if (idx < 0) idx = 0;
    const [q] = pool.splice(idx, 1);
    const order = shuffle([0, 1, 2, 3], random);
    out.push({
      id: q.id,
      category: q.category,
      text: q.text,
      choices: order.map((i) => q.choices[i]),
      correct: order.indexOf(q.answer),
    });
  }
  return out;
}

/** Trivia points: 500 for a correct answer plus up to 500 for speed (linear in time left). */
export function triviaPoints(isCorrect, answeredAt, startedAt, durationMs) {
  if (!isCorrect) return 0;
  const left = Math.min(durationMs, Math.max(0, startedAt + durationMs - answeredAt));
  return 500 + Math.round((500 * left) / durationMs);
}

export const FALSE_START_PENALTY = -250;

/** Reaction points by tap order (0 = first): 1000, 750, 560, 420, ... never below 100. */
export function reactionPoints(order) {
  return Math.max(100, Math.round((1000 * 0.75 ** order) / 10) * 10);
}

/** Random delay before "go", in [min, max). */
export function goDelay(random = Math.random, min = 1500, max = 4500) {
  return Math.round(min + random() * (max - min));
}

/**
 * Final standings sorted by score desc (ties keep join order), with rank (ties share a rank).
 * players: [{ id, username, avatar, score }] in join order.
 */
export function standings(players) {
  const sorted = players
    .map((p, i) => ({ p, i }))
    .sort((a, b) => b.p.score - a.p.score || a.i - b.i)
    .map(({ p }) => ({ id: p.id, username: p.username, avatar: p.avatar, score: p.score }));
  let rank = 0;
  let last = null;
  sorted.forEach((s, i) => {
    if (s.score !== last) { rank = i + 1; last = s.score; }
    s.rank = rank;
  });
  return sorted;
}

/** Progression reward for a finished party match. */
export function partyReward({ rank, score, isHost }) {
  const won = rank === 1 && score > 0;
  const achievements = [];
  if (won) achievements.push('party_win');
  if (isHost) achievements.push('party_host');
  return { won, xp: 25 + (won ? 50 : 0), achievements };
}
