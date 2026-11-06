// Wikipedia "nearby" places for Guess Where?. Pure helpers are exported for tests;
// fetchNearbyPlaces() does the network work (timeouts, N/E/S/W retries, on-device cache).

export const RADIUS_M = 10000;
export const LIMIT = 50;
export const MIN_PLACES = 6;
export const OFFSET_KM = 8;
const CACHE_KEY = 'playnest.quiz.places';
const CACHE_MAX_AGE = 12 * 3600 * 1000;
const TIMEOUT_MS = 9000;

export const geosearchUrl = ({ lat, lon }) =>
  `https://en.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=${lat.toFixed(5)}%7C${lon.toFixed(5)}` +
  `&gsradius=${RADIUS_M}&gslimit=${LIMIT}&format=json&origin=*`;

/** A point `km` away from `p` towards N/E/S/W. */
export function offsetPoint(p, dir, km = OFFSET_KM) {
  const dLat = km / 111.32;
  const dLon = km / (111.32 * Math.max(0.05, Math.cos((p.lat * Math.PI) / 180)));
  const m = { N: [dLat, 0], S: [-dLat, 0], E: [0, dLon], W: [0, -dLon] }[dir];
  return { lat: Math.max(-89.9, Math.min(89.9, p.lat + m[0])), lon: ((p.lon + m[1] + 540) % 360) - 180 };
}

// Titles that make poor quiz answers (lists, generic admin units, etc.).
const BORING = /^(list of|.*\b(constituency|ward|taluk|tehsil|block|division|district)\b)/i;

/** Convert a geosearch JSON response to places. */
export function parseGeosearch(json) {
  const rows = json?.query?.geosearch;
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r) => r && r.title && Number.isFinite(r.lat) && Number.isFinite(r.lon) && !BORING.test(r.title))
    .map((r) => ({
      id: `wp:${r.pageid}`, title: r.title, lat: r.lat, lon: r.lon, kind: 'wiki',
      url: `https://en.wikipedia.org/?curid=${r.pageid}`,
    }));
}

/** Merge place lists, de-duplicating by id. */
export function mergePlaces(...lists) {
  const map = new Map();
  for (const list of lists) for (const p of list || []) if (!map.has(p.id)) map.set(p.id, p);
  return [...map.values()];
}

const cellKey = ({ lat, lon }) => `${lat.toFixed(2)},${lon.toFixed(2)}`;

function readCache(pos) {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY));
    if (!c || Date.now() - c.at > CACHE_MAX_AGE || !Array.isArray(c.places)) return null;
    // Re-use if fetched within ~3 km of here.
    const dLat = (pos.lat - c.lat) * 111, dLon = (pos.lon - c.lon) * 111 * Math.cos((pos.lat * Math.PI) / 180);
    return Math.hypot(dLat, dLon) <= 3 ? c.places : null;
  } catch { return null; }
}
function writeCache(pos, places) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), lat: pos.lat, lon: pos.lon, cell: cellKey(pos), places })); } catch { /* full */ }
}

async function geosearch(pos, signal) {
  const ctrl = new AbortController();
  const abort = () => ctrl.abort();
  signal?.addEventListener('abort', abort);
  const t = setTimeout(abort, TIMEOUT_MS);
  try {
    const res = await fetch(geosearchUrl(pos), { signal: ctrl.signal });
    if (!res.ok) throw new Error(`Wikipedia ${res.status}`);
    return parseGeosearch(await res.json());
  } finally { clearTimeout(t); signal?.removeEventListener('abort', abort); }
}

/**
 * Nearby Wikipedia places → { places, source: 'live'|'cache' }.
 * Throws if offline / failed and nothing is cached. Widens the search N/E/S/W if fewer than MIN_PLACES.
 */
export async function fetchNearbyPlaces(pos, { signal } = {}) {
  const cached = readCache(pos);
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    if (cached) return { places: cached, source: 'cache' };
    throw new Error('offline');
  }
  try {
    let places = await geosearch(pos, signal);
    if (places.length < MIN_PLACES) {
      const more = await Promise.allSettled(['N', 'E', 'S', 'W'].map((d) => geosearch(offsetPoint(pos, d), signal)));
      places = mergePlaces(places, ...more.filter((r) => r.status === 'fulfilled').map((r) => r.value));
    }
    if (places.length) writeCache(pos, places);
    return { places, source: 'live' };
  } catch (e) {
    if (cached && !signal?.aborted) return { places: cached, source: 'cache' };
    throw e;
  }
}
