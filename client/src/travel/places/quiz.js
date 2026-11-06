// Pure question generation for "Guess Where?" (no network, no DOM). Unit-tested in quiz.test.js.
import { distanceKm, bearing, compassPoint, compassName, angleDiff, formatKm } from '../geo.js';

export const QUESTION_COUNT = 6;
export const POINTS8 = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export const POINTS4 = ['N', 'E', 'S', 'W'];
const ANGLE = { N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315 };

/** Small deterministic PRNG (mulberry32) so a seed reproduces the same quiz. */
export function rng(seed = Date.now()) {
  let a = (Number(seed) >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const shuffle = (arr, rand) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};
const pick = (arr, rand) => arr[Math.floor(rand() * arr.length)];

/** Annotate places with distance (km) and bearing (deg) from `from`, de-duplicated by id/title, sorted near → far. */
export function annotate(places, from) {
  const seen = new Set();
  const out = [];
  for (const p of places || []) {
    if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lon) || !p.title) continue;
    const key = String(p.id ?? p.title).toLowerCase();
    const tkey = p.title.toLowerCase();
    if (seen.has(key) || seen.has(tkey)) continue;
    seen.add(key); seen.add(tkey);
    out.push({ ...p, km: distanceKm(from, p), deg: bearing(from, p) });
  }
  return out.sort((a, b) => a.km - b.km);
}

/** Distance bands (km upper bounds) used for "about how far" questions. */
export function bandsFor(kind) {
  return kind === 'city'
    ? [50, 200, 500, 1000, 2000, 4000, 8000, Infinity]
    : [0.5, 1, 2, 4, 7, 12, 20, Infinity];
}
export function bandLabel(bands, i) {
  const lo = i === 0 ? 0 : bands[i - 1], hi = bands[i];
  const f = (km) => (km < 1 ? `${Math.round(km * 1000)} m` : `${km.toLocaleString('en-IN')} km`);
  if (i === 0) return `Under ${f(hi)}`;
  if (hi === Infinity) return `Over ${f(lo)}`;
  return `${f(lo)} – ${f(hi)}`;
}
export const bandIndex = (bands, km) => bands.findIndex((hi) => km < hi);

/** How clearly a distance sits inside its band (0 = on an edge, 0.5 = in the middle, log scale). */
function bandMargin(bands, km) {
  const i = bandIndex(bands, km);
  const lo = i === 0 ? bands[0] / 4 : bands[i - 1];
  const hi = bands[i] === Infinity ? lo * 4 : bands[i];
  const t = (Math.log(Math.max(km, 1e-3)) - Math.log(lo)) / (Math.log(hi) - Math.log(lo));
  return Math.min(t, 1 - t);
}

/** Pick 4 places whose distances are clearly different (≥ 20% apart where possible). */
function pickDistinct(pool, rand, n = 4) {
  for (let tries = 0; tries < 40; tries++) {
    const set = shuffle(pool, rand).slice(0, n).sort((a, b) => a.km - b.km);
    if (set.length < n) return null;
    const ok = set.every((p, i) => i === 0 || p.km >= set[i - 1].km * 1.2 + 0.1);
    if (ok) return set;
  }
  // Fall back: spread across the sorted pool.
  if (pool.length < n) return null;
  const step = (pool.length - 1) / (n - 1);
  return Array.from({ length: n }, (_, i) => pool[Math.round(i * step)]);
}

function directionOptions(p) {
  const centre8 = angleDiff(p.deg, ANGLE[compassPoint(p.deg)]);
  if (centre8 <= 15) return { options: POINTS8, answer: compassPoint(p.deg) };
  const card = POINTS4[Math.round(p.deg / 90) % 4];
  if (angleDiff(p.deg, ANGLE[card]) <= 30) return { options: POINTS4, answer: card };
  return { options: POINTS8, answer: compassPoint(p.deg) };
}

const explainPlace = (p) => `${p.title} is ${formatKm(p.km)} away, to the ${compassName(p.deg)} (${Math.round(p.deg)}°).`;

const builders = {
  closest(pool, rand, used) {
    const set = pickDistinct(pool.filter((p) => !used.has(p.id)), rand) || pickDistinct(pool, rand);
    if (!set) return null;
    const answer = set[0];
    return {
      type: 'closest', prompt: 'Which of these is closest to you right now?', icon: '🎯',
      options: shuffle(set, rand).map((p) => ({ id: p.id, label: p.title })), answer: answer.id, subject: answer,
      explain: `${explainPlace(answer)} The farthest option, ${set[3].title}, is ${formatKm(set[3].km)} away.`,
      places: set,
    };
  },
  farthest(pool, rand, used) {
    const set = pickDistinct(pool.filter((p) => !used.has(p.id)), rand) || pickDistinct(pool, rand);
    if (!set) return null;
    const answer = set[3];
    return {
      type: 'farthest', prompt: 'Which of these is farthest from you?', icon: '🔭',
      options: shuffle(set, rand).map((p) => ({ id: p.id, label: p.title })), answer: answer.id, subject: answer,
      explain: `${explainPlace(answer)} The closest option, ${set[0].title}, is only ${formatKm(set[0].km)} away.`,
      places: set,
    };
  },
  direction(pool, rand, used) {
    const minKm = pool[0]?.kind === 'city' ? 30 : 0.4;
    let cands = pool.filter((p) => !used.has(p.id) && p.km >= minKm);
    if (!cands.length) cands = pool.filter((p) => p.km >= minKm);
    if (!cands.length) return null;
    // Prefer places sitting clearly inside a compass sector.
    const clear = cands.filter((p) => angleDiff(p.deg, ANGLE[compassPoint(p.deg)]) <= 15);
    const subject = pick(clear.length ? clear : cands, rand);
    const { options, answer } = directionOptions(subject);
    return {
      type: 'direction', prompt: `In which direction is ${subject.title}?`, icon: '🧭',
      options: options.map((pt) => ({ id: pt, label: pt })), answer, subject, compass: options.length,
      explain: explainPlace(subject), places: [subject],
    };
  },
  distance(pool, rand, used) {
    const bands = bandsFor(pool[0]?.kind);
    let cands = pool.filter((p) => !used.has(p.id));
    if (!cands.length) cands = pool;
    const clear = cands.filter((p) => bandMargin(bands, p.km) >= 0.15);
    const subject = pick(clear.length ? clear : cands, rand);
    const bi = bandIndex(bands, subject.km);
    // Four consecutive bands containing the answer, at a random position.
    const maxStart = Math.min(bi, bands.length - 4);
    const minStart = Math.max(0, bi - 3);
    const start = minStart + Math.floor(rand() * (maxStart - minStart + 1));
    const options = [0, 1, 2, 3].map((k) => ({ id: String(start + k), label: bandLabel(bands, start + k) }));
    return {
      type: 'distance', prompt: `About how far away is ${subject.title}?`, icon: '📏',
      options, answer: String(bi), subject, explain: explainPlace(subject), places: [subject],
    };
  },
};

export const QUESTION_PLAN = ['closest', 'direction', 'distance', 'farthest', 'direction', 'distance'];

/**
 * Build the quiz from real places.
 * @param {Array<{id,title,lat,lon,kind,url}>} places
 * @param {{lat:number, lon:number}} from  position snapshot at quiz start
 * @param {number} seed
 * @returns {Array<object>} questions (QUESTION_COUNT of them), or [] if there are fewer than 4 usable places
 */
export function buildQuiz(places, from, seed = Date.now()) {
  const rand = rng(seed);
  const pool = annotate(places, from).filter((p) => p.km >= 0.05); // skip "you are standing on it"
  if (pool.length < 4) return [];
  const used = new Set();
  const qs = [];
  for (const type of QUESTION_PLAN) {
    const q = builders[type](pool, rand, used);
    if (!q) continue;
    used.add(q.subject.id);
    qs.push({ ...q, n: qs.length + 1 });
  }
  return qs.length >= QUESTION_COUNT ? qs.slice(0, QUESTION_COUNT) : qs;
}

/** Points for an answer: 1 for correct; ½ for a neighbouring compass point or distance band. */
export function scoreAnswer(q, choice) {
  if (choice === q.answer) return 1;
  if (q.type === 'direction') return angleDiff(ANGLE[choice] ?? 999, ANGLE[q.answer]) <= 45 && q.compass === 8 ? 0.5 : 0;
  if (q.type === 'distance') return Math.abs(Number(choice) - Number(q.answer)) === 1 ? 0.5 : 0;
  return 0;
}

/** 0–100 integer score. */
export const totalScore = (points, count = QUESTION_COUNT) =>
  Math.max(0, Math.min(100, Math.round((points.reduce((s, x) => s + (x || 0), 0) / Math.max(1, count)) * 100)));

export function verdict(score) {
  if (score >= 90) return { emoji: '🏆', title: 'Geo guru!' };
  if (score >= 70) return { emoji: '🧭', title: 'Great sense of place' };
  if (score >= 40) return { emoji: '🗺️', title: 'Not bad, explorer' };
  return { emoji: '🌀', title: 'Lost in the world' };
}
