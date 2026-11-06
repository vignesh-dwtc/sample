// Trip state shared across all travel pages, persisted on-device only (localStorage).
// Location history never leaves the phone; only game scores are sent to the server.
import { useEffect, useSyncExternalStore } from 'react';
import { distanceKm } from './geo.js';
import { api } from '../lib/api.js';

const KEY = 'playnest.trip';
const MAX_POINTS = 4000;
export const MILESTONES_KM = [25, 50, 100, 250, 500, 1000];
export const MODES = {
  road: { label: 'Car / bus', icon: '🚗', maxKmh: 200 },
  train: { label: 'Train', icon: '🚆', maxKmh: 400 },
  flight: { label: 'Flight', icon: '✈️', maxKmh: 1100 },
};

const load = () => {
  try {
    const t = JSON.parse(localStorage.getItem(KEY));
    // Ignore a corrupted/foreign value instead of crashing every travel page.
    if (!t || typeof t !== 'object' || !Array.isArray(t.points) || typeof t.startedAt !== 'number') return null;
    return { ...t, distanceKm: Number(t.distanceKm) || 0, milestones: Array.isArray(t.milestones) ? t.milestones : [] };
  } catch { return null; }
};
let state = load();
const listeners = new Set();
const save = (next) => {
  state = next;
  try { next ? localStorage.setItem(KEY, JSON.stringify(next)) : localStorage.removeItem(KEY); } catch { /* storage full/blocked */ }
  listeners.forEach((l) => l());
};
const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };

/** Current trip or null: { id, mode, startedAt, origin, destination: {name, lat, lon}|null, points: [[lat, lon, ms]], distanceKm, milestones: number[], unsent?: number[] } */
export const useTripState = () => useSyncExternalStore(subscribe, () => state, () => state);
export const getTrip = () => state;

export function startTrip({ mode = 'road', destination = null } = {}) {
  save({ id: Math.random().toString(36).slice(2, 10), mode, startedAt: Date.now(), origin: null, destination, points: [], distanceKm: 0, milestones: [] });
}
export const endTrip = () => save(null);
export const setDestination = (destination) => state && save({ ...state, destination });
export const setMode = (mode) => state && save({ ...state, mode });

/** Add a GPS fix to the trip (ignores poor-accuracy fixes and impossible jumps). Returns km added. */
export function addPosition(pos) {
  if (!state || !pos || (pos.accuracy && pos.accuracy > 300)) return 0;
  const pts = state.points;
  const last = pts[pts.length - 1];
  const here = { lat: pos.lat, lon: pos.lon };
  if (!last) { save({ ...state, origin: state.origin || here, points: [[pos.lat, pos.lon, pos.at || Date.now()]] }); return 0; }
  const d = distanceKm({ lat: last[0], lon: last[1] }, here);
  const dtH = Math.max(1, (pos.at || Date.now()) - last[2]) / 3600000;
  const maxKmh = (MODES[state.mode] || MODES.road).maxKmh;
  if (d < 0.05 || d / dtH > maxKmh * 1.5) return 0; // jitter or GPS glitch
  const points = [...pts, [pos.lat, pos.lon, pos.at || Date.now()]];
  save({ ...state, points: points.length > MAX_POINTS ? points.filter((_, i) => i % 2 === 0 || i > points.length - 200) : points, distanceKm: state.distanceKm + d });
  return d;
}

let sending = false;
let retryAt = 0;
const RETRY_MS = 60000;

/** Send milestones that are owed but not yet confirmed by the server (offline / patchy network). */
function flushMilestones(onMilestone) {
  const owed = state?.unsent;
  if (sending || !owed?.length || Date.now() < retryAt) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  const km = Math.max(...owed);
  const tripId = state.id;
  const done = () => { if (state?.id === tripId) save({ ...state, unsent: (state.unsent || []).filter((k) => k !== km) }); };
  sending = true;
  submitTravelScore('travel_trip', km, { tripId, mode: state.mode })
    .then((r) => { done(); onMilestone?.(r.progress, km); })
    .catch((e) => {
      // 4xx (e.g. 409 "already counted today") will never succeed: drop it. Network/5xx/429: retry later.
      if (e?.status >= 400 && e.status < 500 && e.status !== 429) done();
      else retryAt = Date.now() + RETRY_MS;
    })
    .finally(() => { sending = false; if (state?.unsent?.length && Date.now() >= retryAt) flushMilestones(onMilestone); });
}

/** Hook: feed live positions into the trip and award distance milestones (calls onMilestone(progress, km)). */
export function useTripRecorder(position, onMilestone) {
  useEffect(() => {
    if (!position || !state) return;
    addPosition(position);
    const due = MILESTONES_KM.filter((km) => state.distanceKm >= km && !state.milestones.includes(km));
    // Only the biggest newly passed milestone is scored; all passed ones are marked as reached.
    if (due.length) save({ ...state, milestones: [...state.milestones, ...due], unsent: [...(state.unsent || []), due[due.length - 1]] });
    flushMilestones(onMilestone);
  }, [position, onMilestone]);
  // Retry owed milestones as soon as the connection comes back.
  useEffect(() => {
    const up = () => { retryAt = 0; flushMilestones(onMilestone); };
    window.addEventListener('online', up);
    return () => window.removeEventListener('online', up);
  }, [onMilestone]);
}

/** Save a travel game result → { progress } (pass progress to useSession().celebrate). */
export const submitTravelScore = (game, score, data = {}) =>
  api('/travel/submit', { method: 'POST', body: { game, score: Math.round(score), data } });
