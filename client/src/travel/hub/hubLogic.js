// Pure helpers for the Travel hub (no React, no network) — unit-tested with `node --test`.
import { distanceKm } from '../geo.js';

/** WMO weather code → { emoji, words } (Open-Meteo `weather_code`). */
const WEATHER = [
  [[0], '☀️', '🌙', 'Clear sky'],
  [[1], '🌤️', '🌙', 'Mostly clear'],
  [[2], '⛅', '☁️', 'Partly cloudy'],
  [[3], '☁️', '☁️', 'Cloudy'],
  [[45, 48], '🌫️', '🌫️', 'Foggy'],
  [[51, 53, 55], '🌦️', '🌧️', 'Drizzle'],
  [[56, 57], '🌧️', '🌧️', 'Freezing drizzle'],
  [[61, 63], '🌧️', '🌧️', 'Rain'],
  [[65], '🌧️', '🌧️', 'Heavy rain'],
  [[66, 67], '🌧️', '🌧️', 'Freezing rain'],
  [[71, 73, 75, 77], '🌨️', '🌨️', 'Snow'],
  [[80, 81], '🌦️', '🌧️', 'Rain showers'],
  [[82], '⛈️', '⛈️', 'Heavy showers'],
  [[85, 86], '🌨️', '🌨️', 'Snow showers'],
  [[95], '⛈️', '⛈️', 'Thunderstorm'],
  [[96, 99], '⛈️', '⛈️', 'Thunderstorm with hail'],
];
export function weatherInfo(code, isDay = true) {
  const hit = WEATHER.find(([codes]) => codes.includes(Number(code)));
  if (!hit) return { emoji: '🌡️', words: 'Weather' };
  return { emoji: isDay === false || isDay === 0 ? hit[2] : hit[1], words: hit[3] };
}

/** Speed in km/h from a GPS fix (m/s), else null. */
export const gpsKmh = (pos) => (pos && Number.isFinite(pos.speed) && pos.speed >= 0 ? pos.speed * 3.6 : null);

/**
 * Speed (km/h) derived from recent fixes [[lat, lon, ms], …] (oldest first): uses the span between the
 * newest fix and the oldest one within `windowMs` (needs ≥ 15 s of data). Null when unknown.
 */
export function derivedKmh(points, now = Date.now(), windowMs = 3 * 60000) {
  if (!points || points.length < 2) return null;
  const last = points[points.length - 1];
  if (now - last[2] > windowMs) return 0; // no fresh movement recorded → standing still (or no fix)
  let first = null;
  for (let i = points.length - 2; i >= 0; i--) {
    if (last[2] - points[i][2] > windowMs) break;
    first = points[i];
  }
  if (!first) return null;
  const dt = (last[2] - first[2]) / 3600000;
  if (dt < 15 / 3600) return null;
  return pathKm(points.slice(points.indexOf(first), points.length)) / dt;
}

/** Sum of segment lengths along a list of [lat, lon, ms] points. */
export function pathKm(points) {
  let km = 0;
  for (let i = 1; i < points.length; i++) {
    km += distanceKm({ lat: points[i - 1][0], lon: points[i - 1][1] }, { lat: points[i][0], lon: points[i][1] });
  }
  return km;
}

/**
 * Recent average speed (km/h) for ETAs: distance over the last `windowMs` of trip points, falling back to the
 * whole-trip average when the window is too short. Null if there's too little data.
 */
export function averageKmh(trip, now = Date.now(), windowMs = 20 * 60000) {
  const pts = trip?.points || [];
  if (pts.length < 2) return null;
  const recent = pts.filter((p) => now - p[2] <= windowMs);
  const last = pts[pts.length - 1];
  if (recent.length >= 2) {
    const span = (now - recent[0][2]) / 3600000;
    if (span >= 3 / 60) return pathKm(recent) / Math.max(span, (last[2] - recent[0][2]) / 3600000);
  }
  // Nothing recent: whole-trip average (time since the trip started).
  const hours = (now - (trip.startedAt || pts[0][2])) / 3600000;
  if (hours < 5 / 60) return null;
  return (trip.distanceKm || 0) / hours;
}

/** Road/rail routes are longer than the straight line; used only to make ETAs realistic. */
export const DETOUR = { road: 1.3, train: 1.25, flight: 1.03 };

/** ETA in ms for `remainingKm` (straight-line) at `kmh`, or null if not moving. */
export function etaMs(remainingKm, kmh, mode = 'road') {
  if (remainingKm == null || !kmh || kmh < 3) return null;
  return ((remainingKm * (DETOUR[mode] || 1.2)) / kmh) * 3600000;
}

/** Progress (0–1) from origin to destination given the current position, or null. */
export function tripProgress(origin, here, dest) {
  if (!origin || !here || !dest) return null;
  const total = distanceKm(origin, dest);
  if (total < 0.5) return 1;
  const left = distanceKm(here, dest);
  return Math.max(0, Math.min(1, 1 - left / total));
}

/** Next distance milestone not yet reached: { km, inKm } or null. */
export function nextMilestone(distanceDone, milestones) {
  const km = milestones.find((m) => m > (distanceDone || 0));
  return km == null ? null : { km, inKm: km - (distanceDone || 0) };
}

/**
 * Should we reverse-geocode now? At most once every 2 minutes; then when we moved ≥ 2 km,
 * or after 10 minutes if we moved a little (≥ 300 m).
 * @param {{lat, lon, at}|null} last  the position/time of the previous lookup
 */
export function shouldReverse(last, here, now = Date.now()) {
  if (!here) return false;
  if (!last) return true;
  const since = now - last.at;
  if (since < 2 * 60000) return false;
  const moved = distanceKm(last, here);
  return moved >= 2 || (since >= 10 * 60000 && moved >= 0.3);
}

/** Pick a short place label from a Nominatim reverse result: { name, state, country }. */
export function placeFromNominatim(r) {
  const a = r?.address || {};
  const name = a.city || a.town || a.village || a.suburb || a.hamlet || a.municipality || a.county
    || a.state_district || r?.name || '';
  const state = a.state || a.region || a.province || a.territory || '';
  return { name: name || state || a.country || 'Somewhere', state, country: a.country || '', countryCode: a.country_code || '' };
}

/** Short label for a Nominatim search hit: { name, detail, lat, lon }. */
export function searchHit(r) {
  const parts = String(r.display_name || '').split(',').map((s) => s.trim()).filter(Boolean);
  const name = r.name || parts[0] || 'Unnamed place';
  const detail = parts.filter((p) => p !== name && !/^\d{5,6}$/.test(p)).slice(-3).join(', ');
  return { name, detail, lat: Number(r.lat), lon: Number(r.lon) };
}

/** Countdown text: 3725000 → "1h 02m 05s"; 65000 → "1m 05s"; 9000 → "9s". */
export function countdownText(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const p = (n) => String(n).padStart(2, '0');
  if (h) return `${h}h ${p(m)}m ${p(sec)}s`;
  if (m) return `${m}m ${p(sec)}s`;
  return `${sec}s`;
}

/** Elapsed clock "2:05:09" (h:mm:ss). */
export function elapsedText(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const p = (n) => String(n).padStart(2, '0');
  return `${Math.floor(s / 3600)}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}

/** "12 min ago" style label. */
export function agoText(ms) {
  const m = Math.floor(Math.max(0, ms) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return `${h} h ago`;
}

/** Game suggestion for a sky/trip event kind. */
const CHALLENGES = {
  golden: { to: '/travel/sky', text: 'Find the sun before it sets', game: 'Sky Compass' },
  sunset: { to: '/travel/sky', text: 'Point at the setting sun', game: 'Sky Compass' },
  sunrise: { to: '/travel/sky', text: 'Find where the sun will rise', game: 'Sky Compass' },
  dawn: { to: '/travel/sky', text: 'Guess where the sun will rise', game: 'Sky Compass' },
  noon: { to: '/travel/sky', text: 'The sun is high — can you point at it?', game: 'Sky Compass' },
  moonrise: { to: '/travel/sky', text: 'Find the moon in the sky', game: 'Sky Compass' },
  dusk: { to: '/travel/bingo', text: 'Spot lights coming on outside', game: 'Window Bingo' },
  milestone: { to: '/travel/predict', text: 'Predict when you’ll hit it', game: 'Distance Predictor' },
  halfway: { to: '/travel/quiz', text: 'Guess where you are right now', game: 'Guess Where?' },
  arrive: { to: '/travel/map', text: 'Watch the last stretch on the map', game: 'Live Map' },
  region: { to: '/travel/quiz', text: 'New state — test your geography', game: 'Guess Where?' },
};
export const challengeFor = (kind) => CHALLENGES[kind] || null;

/**
 * Build the live events feed: sky events + estimated trip events, sorted by time.
 * Trip events with no ETA (not moving) get `at: null` and a distance label instead; they sort last.
 */
export function buildEvents({ now, sky = [], trip, here, kmh, milestones = [], progress }) {
  const out = sky.map((e) => ({ ...e, key: `${e.kind}-${Math.round(e.at.getTime() / 60000)}`, source: 'sky' }));
  if (trip) {
    const mode = trip.mode || 'road';
    const next = nextMilestone(trip.distanceKm, milestones);
    if (next) {
      const ms = kmh && kmh >= 3 ? (next.inKm / kmh) * 3600000 : null;
      out.push({ kind: 'milestone', key: `milestone-${next.km}`, icon: '🛣️', title: `${next.km} km milestone`,
        at: ms != null ? new Date(now.getTime() + ms) : null, distance: next.inKm, source: 'trip' });
    }
    const dest = trip.destination;
    if (dest && here) {
      const left = distanceKm(here, dest);
      const origin = trip.origin || here;
      const total = distanceKm(origin, dest);
      if (progress != null && progress < 0.5 && total > 20) {
        const toHalf = left - total / 2;
        const ms = etaMs(toHalf, kmh, mode);
        out.push({ kind: 'halfway', key: 'halfway', icon: '🏁', title: 'Halfway point',
          at: ms != null ? new Date(now.getTime() + ms) : null, distance: toHalf, source: 'trip' });
      }
      if (left > 10) {
        const ms = etaMs(left - 10, kmh, mode);
        out.push({ kind: 'arrive', key: 'arrive', icon: '📍', title: `Nearly at ${dest.name}`,
          at: ms != null ? new Date(now.getTime() + ms) : null, distance: left - 10, source: 'trip' });
      }
    }
  }
  return out.sort((a, b) => (a.at ? a.at.getTime() : Infinity) - (b.at ? b.at.getTime() : Infinity));
}

/** Short local zone name for a date in an IANA zone, e.g. "IST" or "GMT+4". */
export function zoneLabel(timeZone, date = new Date()) {
  try {
    const part = new Intl.DateTimeFormat('en-IN', { timeZone, timeZoneName: 'short' })
      .formatToParts(date).find((p) => p.type === 'timeZoneName');
    return part?.value || timeZone;
  } catch { return timeZone || ''; }
}

/** UTC offset in minutes of an IANA zone at `date` (e.g. Asia/Kolkata → 330). */
export function zoneOffsetMin(timeZone, date = new Date()) {
  try {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(date).map((p) => [p.type, p.value]));
    const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
    return Math.round((asUtc - Math.floor(date.getTime() / 60000) * 60000) / 60000);
  } catch { return null; }
}

/** True when two IANA zones currently show different clock times. */
export function differentClock(a, b, date = new Date()) {
  if (!a || !b || a === b) return false;
  const x = zoneOffsetMin(a, date), y = zoneOffsetMin(b, date);
  return x != null && y != null && x !== y;
}

/** Offline-friendly destination suggestions (filtered locally while typing). */
export const POPULAR_PLACES = [
  ['Bengaluru', 'Karnataka, India', 12.9716, 77.5946], ['Chennai', 'Tamil Nadu, India', 13.0827, 80.2707],
  ['Mumbai', 'Maharashtra, India', 19.076, 72.8777], ['New Delhi', 'Delhi, India', 28.6139, 77.209],
  ['Hyderabad', 'Telangana, India', 17.385, 78.4867], ['Kolkata', 'West Bengal, India', 22.5726, 88.3639],
  ['Pune', 'Maharashtra, India', 18.5204, 73.8567], ['Mysuru', 'Karnataka, India', 12.2958, 76.6394],
  ['Kochi', 'Kerala, India', 9.9312, 76.2673], ['Coimbatore', 'Tamil Nadu, India', 11.0168, 76.9558],
  ['Madurai', 'Tamil Nadu, India', 9.9252, 78.1198], ['Puducherry', 'Puducherry, India', 11.9416, 79.8083],
  ['Goa (Panaji)', 'Goa, India', 15.4909, 73.8278], ['Thiruvananthapuram', 'Kerala, India', 8.5241, 76.9366],
  ['Ooty', 'Tamil Nadu, India', 11.4102, 76.695], ['Tirupati', 'Andhra Pradesh, India', 13.6288, 79.4192],
  ['Visakhapatnam', 'Andhra Pradesh, India', 17.6868, 83.2185], ['Ahmedabad', 'Gujarat, India', 23.0225, 72.5714],
  ['Jaipur', 'Rajasthan, India', 26.9124, 75.7873], ['Agra', 'Uttar Pradesh, India', 27.1767, 78.0081],
  ['Varanasi', 'Uttar Pradesh, India', 25.3176, 82.9739], ['Lucknow', 'Uttar Pradesh, India', 26.8467, 80.9462],
  ['Chandigarh', 'Chandigarh, India', 30.7333, 76.7794], ['Bhubaneswar', 'Odisha, India', 20.2961, 85.8245],
  ['Guwahati', 'Assam, India', 26.1445, 91.7362], ['Dubai', 'United Arab Emirates', 25.2048, 55.2708],
  ['Singapore', 'Singapore', 1.3521, 103.8198], ['London', 'United Kingdom', 51.5072, -0.1276],
].map(([name, detail, lat, lon]) => ({ name, detail, lat, lon }));

export function localMatches(q, n = 5) {
  const s = String(q || '').trim().toLowerCase();
  if (s.length < 2) return [];
  return POPULAR_PLACES.filter((p) => p.name.toLowerCase().includes(s) || p.detail.toLowerCase().startsWith(s)).slice(0, n);
}
