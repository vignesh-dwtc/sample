// Distance Predictor — pure logic (no React, no DOM).
import { distanceKm } from '../geo.js';

export const ROUND_MINUTES = [5, 10, 15, 30];
export const PRACTICE_MINUTES = 1;
export const EXPERT_BONUS = 10;
export const STILL_KMH = 3; // below this we treat the player as not moving

/** Base score: max(0, round(100 − |error| / max(actual, 0.5) × 100)). */
export function predictScore(predictedKm, actualKm) {
  const p = Math.max(0, Number(predictedKm) || 0), a = Math.max(0, Number(actualKm) || 0);
  return Math.max(0, Math.round(100 - (Math.abs(p - a) / Math.max(a, 0.5)) * 100));
}

/** Final score with the expert (no speed hint) bonus, capped at 100. A zero stays zero. */
export function finalPredictScore(predictedKm, actualKm, expert) {
  const base = predictScore(predictedKm, actualKm);
  return base > 0 && expert ? Math.min(100, base + EXPERT_BONUS) : base;
}

/** Points: [[lat, lon, ms]] or [{lat, lon, at}] → [{lat, lon, at}]. */
const norm = (p) => (Array.isArray(p) ? { lat: p[0], lon: p[1], at: p[2] } : p);

/**
 * Distance travelled between startAt and endAt.
 * Path = startPos → every point with startAt ≤ at ≤ endAt (time order) → (endPos if given).
 * Falls back to straight line start→end when there are no in-window points. Returns { km, method }.
 */
export function windowDistance({ points = [], startAt, endAt, startPos = null, endPos = null }) {
  const inWin = points.map(norm).filter((p) => p && Number.isFinite(p.lat) && p.at >= startAt && p.at <= endAt)
    .sort((a, b) => a.at - b.at);
  const path = [startPos, ...inWin, endPos].filter(Boolean);
  if (path.length < 2) return { km: 0, method: 'none' };
  if (!inWin.length) return { km: distanceKm(path[0], path[path.length - 1]), method: 'straight' };
  let km = 0;
  for (let i = 1; i < path.length; i++) km += distanceKm(path[i - 1], path[i]);
  const straight = distanceKm(path[0], path[path.length - 1]);
  return { km: Math.max(km, straight), method: 'track' };
}

/** Best guess of where the player was at time t, from points at or before t (latest one). */
export function positionAtOrBefore(points, t) {
  let best = null;
  for (const raw of points) { const p = norm(raw); if (p && p.at <= t && (!best || p.at > best.at)) best = p; }
  return best;
}

/** Fun verdict for a finished round. */
export function predictFeedback(predictedKm, actualKm) {
  const err = Math.abs(predictedKm - actualKm);
  const s = predictScore(predictedKm, actualKm);
  const off = err < 1 ? `${Math.round(err * 1000)} m` : `${err.toFixed(1)} km`;
  const dir = predictedKm > actualKm ? 'too far' : 'too short';
  if (err < 0.05) return { title: 'Bullseye!', line: `Off by just ${off} — are you secretly the driver?`, emoji: '🎯' };
  if (s >= 90) return { title: 'Human GPS!', line: `Off by ${off} — Human GPS!`, emoji: '🛰️' };
  if (s >= 75) return { title: 'Sharp navigator', line: `Off by ${off} (${dir}). Very nice!`, emoji: '🧭' };
  if (s >= 50) return { title: 'Decent guess', line: `Off by ${off} (${dir}). The road had other plans.`, emoji: '🗺️' };
  if (s > 0) return { title: 'Wild guess', line: `Off by ${off} (${dir}). Traffic? Signal? Chai break?`, emoji: '🤔' };
  return { title: 'Way off!', line: `Off by ${off} (${dir}). Next round is yours!`, emoji: '🙈' };
}

/** Rough speed (km/h) from recent points [{lat,lon,at}] over the last `windowMs`. null if not enough data. */
export function recentSpeedKmh(points, now, windowMs = 120000) {
  const pts = points.map(norm).filter((p) => p && p.at >= now - windowMs && p.at <= now).sort((a, b) => a.at - b.at);
  if (pts.length < 2) return null;
  let km = 0;
  for (let i = 1; i < pts.length; i++) km += distanceKm(pts[i - 1], pts[i]);
  const h = (pts[pts.length - 1].at - pts[0].at) / 3600000;
  return h > 0 ? km / h : null;
}

/** Suggested slider maximum for a round: generous enough for a flight. */
export function sliderMaxKm(minutes, kmh) {
  const guess = ((kmh || 60) * minutes) / 60;
  const nice = [2, 5, 10, 20, 30, 50, 80, 120, 200, 300, 500, 600];
  return nice.find((n) => n >= guess * 2.2) || 600;
}

/** "mm:ss" countdown (or "h:mm:ss"). */
export function countdownLabel(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

/* ---------- Arrival time guess ---------- */
export const ARRIVE_RADIUS_KM = 1;

/** Next occurrence (after `now`) of a local "HH:MM" clock time → ms. */
export function nextClockTime(hhmm, now = Date.now()) {
  const [h, m] = String(hhmm).split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  const d = new Date(now);
  d.setHours(h, m, 0, 0);
  if (d.getTime() <= now) d.setDate(d.getDate() + 1);
  return d.getTime();
}

/** Score for an arrival guess: like distance — error relative to the time remaining when guessed (min 10 min). */
export function arrivalScore(predictedAt, actualAt, guessedAt) {
  const errMin = Math.abs(predictedAt - actualAt) / 60000;
  const remainingMin = Math.max(10, (actualAt - guessedAt) / 60000);
  return Math.max(0, Math.round(100 - (errMin / remainingMin) * 100));
}

export function arrivalFeedback(predictedAt, actualAt) {
  const errMin = Math.round(Math.abs(predictedAt - actualAt) / 60000);
  const early = actualAt < predictedAt;
  if (errMin <= 1) return { title: 'On the dot!', line: 'You called the arrival to the minute. Railway-clock precision!', emoji: '⏰' };
  if (errMin <= 10) return { title: 'So close!', line: `Arrived ${errMin} min ${early ? 'earlier' : 'later'} than your guess.`, emoji: '🎯' };
  if (errMin <= 45) return { title: 'Not bad', line: `Arrived ${errMin} min ${early ? 'early' : 'late'} versus your guess.`, emoji: '🧭' };
  const h = (errMin / 60).toFixed(1);
  return { title: 'Journey surprise!', line: `Off by about ${h} h. Travel in India keeps you guessing!`, emoji: '🙈' };
}

/** First point within ARRIVE_RADIUS_KM of dest at or after `since` → its time, else null. */
export function arrivalTimeFromPoints(points, dest, since) {
  for (const raw of points) {
    const p = norm(raw);
    if (p && p.at >= since && distanceKm(p, dest) <= ARRIVE_RADIUS_KM) return p.at;
  }
  return null;
}
