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

const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; } };
let state = load();
const listeners = new Set();
const save = (next) => {
  state = next;
  try { next ? localStorage.setItem(KEY, JSON.stringify(next)) : localStorage.removeItem(KEY); } catch { /* storage full/blocked */ }
  listeners.forEach((l) => l());
};
const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };

/** Current trip or null: { id, mode, startedAt, origin, destination: {name, lat, lon}|null, points: [[lat, lon, ms]], distanceKm, milestones: number[] } */
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

/** Hook: feed live positions into the trip and award distance milestones (calls onMilestone(progress, km)). */
export function useTripRecorder(position, onMilestone) {
  useEffect(() => {
    if (!position || !state) return;
    addPosition(position);
    const due = MILESTONES_KM.filter((km) => state.distanceKm >= km && !state.milestones.includes(km));
    if (!due.length) return;
    const km = due[due.length - 1];
    save({ ...state, milestones: [...state.milestones, ...due] });
    submitTravelScore('travel_trip', km, { tripId: state.id, mode: state.mode })
      .then((r) => onMilestone?.(r.progress, km)).catch(() => {});
  }, [position, onMilestone]);
}

/** Save a travel game result → { progress } (pass progress to useSession().celebrate). */
export const submitTravelScore = (game, score, data = {}) =>
  api('/travel/submit', { method: 'POST', body: { game, score: Math.round(score), data } });
