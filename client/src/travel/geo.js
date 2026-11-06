// Pure geo helpers (no network). Distances in km, angles in degrees.
const R = 6371.0088;
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

/** Great-circle distance in km between {lat, lon} points. */
export function distanceKm(a, b) {
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial bearing from a to b, degrees clockwise from north (0–360). */
export function bearing(a, b) {
  const y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const POINT_NAMES = { N: 'north', NE: 'north-east', E: 'east', SE: 'south-east', S: 'south', SW: 'south-west', W: 'west', NW: 'north-west' };
/** 8-point compass label for a bearing, e.g. 'NE'. */
export const compassPoint = (b) => POINTS[Math.round((((b % 360) + 360) % 360) / 45) % 8];
export const compassName = (b) => POINT_NAMES[compassPoint(b)];

/** Smallest absolute difference between two bearings (0–180). */
export const angleDiff = (a, b) => { const d = Math.abs((((a - b) % 360) + 540) % 360 - 180); return d; };

export function formatKm(km) {
  if (km == null || Number.isNaN(km)) return '—';
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km).toLocaleString('en-IN')} km`;
}

export function formatDuration(ms) {
  if (ms == null || !Number.isFinite(ms)) return '—';
  const m = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(m / 60);
  return h ? `${h} h ${String(m % 60).padStart(2, '0')} min` : `${m} min`;
}

/** Local clock time "06:42" in the device's time zone (or a given IANA zone). */
export const formatTime = (date, timeZone) =>
  date ? new Date(date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, ...(timeZone ? { timeZone } : {}) }) : '—';
