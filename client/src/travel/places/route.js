// Pure helpers for the live map: route thinning and trip stats.
import { distanceKm } from '../geo.js';

/** Perpendicular-ish distance (km) of p from segment a–b using a local flat projection. */
function segDistKm(p, a, b) {
  const k = Math.cos((a[0] * Math.PI) / 180) * 111.32;
  const ax = a[1] * k, ay = a[0] * 111.32, bx = b[1] * k, by = b[0] * 111.32, px = p[1] * k, py = p[0] * 111.32;
  const dx = bx - ax, dy = by - ay;
  const L2 = dx * dx + dy * dy;
  const t = L2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * Thin trip points [[lat, lon, ms], …] to at most `max` [lat, lon] pairs with Douglas–Peucker
 * (iterative, so long trips can't blow the stack). Always keeps the first and last point.
 */
export function thinRoute(points, { toleranceKm = 0.02, max = 800 } = {}) {
  const pts = (points || []).filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]));
  if (pts.length <= 2) return pts.map((p) => [p[0], p[1]]);
  let tol = toleranceKm;
  let out;
  for (let round = 0; round < 8; round++) {
    const keep = new Uint8Array(pts.length);
    keep[0] = keep[pts.length - 1] = 1;
    const stack = [[0, pts.length - 1]];
    while (stack.length) {
      const [s, e] = stack.pop();
      let maxD = 0, idx = -1;
      for (let i = s + 1; i < e; i++) {
        const d = segDistKm(pts[i], pts[s], pts[e]);
        if (d > maxD) { maxD = d; idx = i; }
      }
      if (idx !== -1 && maxD > tol) { keep[idx] = 1; stack.push([s, idx], [idx, e]); }
    }
    out = pts.filter((_, i) => keep[i]).map((p) => [p[0], p[1]]);
    if (out.length <= max) return out;
    tol *= 2;
  }
  return out;
}

/**
 * Stats for the overlay.
 * @returns {{ travelledKm, speedKmh: number|null, toGoKm: number|null, etaMs: number|null, avgKmh: number|null }}
 */
export function tripStats(trip, position, now = Date.now()) {
  const travelledKm = trip?.distanceKm || 0;
  let speedKmh = position && Number.isFinite(position.speed) && position.speed >= 0 ? position.speed * 3.6 : null;
  const pts = trip?.points || [];
  // Fallback speed from the last few minutes of recorded points.
  if (speedKmh == null && pts.length >= 2) {
    const last = pts[pts.length - 1];
    let i = pts.length - 2, d = 0;
    while (i >= 0 && last[2] - pts[i][2] < 5 * 60000) { d += distanceKm({ lat: pts[i][0], lon: pts[i][1] }, { lat: pts[i + 1][0], lon: pts[i + 1][1] }); i--; }
    const first = pts[i + 1];
    const dtH = (last[2] - first[2]) / 3600000;
    if (dtH > 0.005 && now - last[2] < 10 * 60000) speedKmh = d / dtH;
  }
  const elapsedH = trip?.startedAt ? (now - trip.startedAt) / 3600000 : 0;
  const avgKmh = elapsedH > 0.05 && travelledKm > 0.5 ? travelledKm / elapsedH : null;
  const dest = trip?.destination;
  const here = position || (pts.length ? { lat: pts[pts.length - 1][0], lon: pts[pts.length - 1][1] } : null);
  const toGoKm = dest && here && Number.isFinite(dest.lat) ? distanceKm(here, dest) : null;
  // ETA: straight-line distance at a blend of current and average speed (roads wind, so add 25% unless flying).
  const pace = [speedKmh, avgKmh].filter((v) => v && v > 3);
  const kmh = pace.length ? pace.reduce((a, b) => a + b, 0) / pace.length : null;
  const winding = trip?.mode === 'flight' ? 1 : 1.25;
  const etaMs = toGoKm != null && kmh ? ((toGoKm * winding) / kmh) * 3600000 : null;
  return { travelledKm, speedKmh, toGoKm, etaMs, avgKmh };
}
