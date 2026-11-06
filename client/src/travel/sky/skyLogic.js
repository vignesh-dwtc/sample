// Pure helpers for Sky Compass (no React, no network). Angles are degrees clockwise from north.
// Run tests: node --test client/src/travel/sky/skyLogic.test.js

export const norm360 = (a) => ((a % 360) + 360) % 360;

/** Signed shortest turn from `from` to `to` in degrees (-180, 180]. Positive = clockwise. */
export function signedDiff(from, to) {
  const d = norm360(to - from);
  return d > 180 ? d - 360 : d;
}

/** Absolute shortest difference between two bearings (0–180). */
export const absDiff = (a, b) => Math.abs(signedDiff(a, b));

/**
 * Keep a CSS rotation continuous: given the previous (unwrapped) rotation and a new 0–360 target,
 * return the unwrapped rotation nearest to the previous one (so 359 → 1 turns 2°, not -358°).
 */
export const unwrapAngle = (prev, next) => (prev == null || !Number.isFinite(prev) ? norm360(next) : prev + signedDiff(prev, next));

/** Round score: 100 − error × 2, clamped to 0–100, integer. */
export function roundScore(errorDeg) {
  if (errorDeg == null || !Number.isFinite(errorDeg)) return 0;
  return Math.max(0, Math.min(100, Math.round(100 - Math.abs(errorDeg) * 2)));
}

/** Final score = rounded average of round scores (0 when no rounds). */
export function finalScore(rounds) {
  if (!rounds?.length) return 0;
  return Math.round(rounds.reduce((s, r) => s + (r.score || 0), 0) / rounds.length);
}

/** Target ('sun'|'moon') of the best-scoring round (first one wins ties). */
export function bestTarget(rounds) {
  if (!rounds?.length) return 'sun';
  return rounds.reduce((best, r) => (r.score > best.score ? r : best), rounds[0]).body;
}

/** Fun verdict for a round score. */
export function verdict(score) {
  if (score >= 95) return { emoji: '🎯', text: 'Bullseye!' };
  if (score >= 80) return { emoji: '🌟', text: 'Sky expert' };
  if (score >= 60) return { emoji: '👍', text: 'Nicely spotted' };
  if (score >= 30) return { emoji: '🧭', text: 'In the right half of the sky' };
  return { emoji: '🙃', text: 'Way off — the sky is tricky!' };
}

const SIXTEEN = ['north', 'north-north-east', 'north-east', 'east-north-east', 'east', 'east-south-east', 'south-east', 'south-south-east',
  'south', 'south-south-west', 'south-west', 'west-south-west', 'west', 'west-north-west', 'north-west', 'north-north-west'];
const SIXTEEN_SHORT = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

/** 16-point direction name, e.g. 250 → 'west-south-west'. */
export const directionName = (az) => SIXTEEN[Math.round(norm360(az) / 22.5) % 16];
export const directionShort = (az) => SIXTEEN_SHORT[Math.round(norm360(az) / 22.5) % 16];

/** How high a body is, in words. */
export function heightWord(alt) {
  if (alt < -18) return 'deep below the horizon';
  if (alt < -0.833) return 'below the horizon';
  if (alt < 10) return 'low';
  if (alt < 35) return 'fairly low';
  if (alt < 60) return 'high';
  if (alt < 80) return 'very high';
  return 'almost straight overhead';
}

/** "Sun is low in the west-south-west" / "Moon is below the horizon, under your feet towards the east". */
export function describeBody(name, az, alt) {
  const dir = directionName(az);
  if (alt >= 80) return `${name} is almost straight overhead`;
  if (alt < -0.833) return `${name} is ${heightWord(alt)} — under your feet towards the ${dir}`;
  return `${name} is ${heightWord(alt)} in the ${dir}`;
}

/** "in 1 h 05 min" / "in 4 min" / "in 35 s" countdown text for ms. */
export function countdownText(ms) {
  if (ms == null || !Number.isFinite(ms)) return '—';
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${String(s % 60).padStart(2, '0')} s`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}

/** Day length text from sunrise/sunset dates. */
export function dayLengthText(sunrise, sunset) {
  if (!sunrise || !sunset) return '—';
  const m = Math.round((sunset - sunrise) / 60000);
  if (m <= 0) return '—';
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}

/**
 * SVG path for the lit part of the moon. fraction 0–1 illuminated; waxing = lit on the right
 * (as seen from the northern hemisphere / India). Returns '' for a new moon.
 */
export function moonLitPath(fraction, waxing, r = 50, cx = 50, cy = 50) {
  const f = Math.max(0, Math.min(1, fraction));
  if (f < 0.005) return '';
  const top = `${cx} ${cy - r}`, bottom = `${cx} ${cy + r}`;
  if (f > 0.995) return `M ${top} A ${r} ${r} 0 1 1 ${bottom} A ${r} ${r} 0 1 1 ${top} Z`;
  const k = +(r * Math.abs(1 - 2 * f)).toFixed(3); // terminator ellipse half-width
  const gibbous = f > 0.5;
  // Outer limb: top → bottom via the lit side.
  const limbSweep = waxing ? 1 : 0;
  // Terminator: bottom → top, bulging towards the lit side for crescents and the dark side for gibbous.
  const termSweep = waxing ? (gibbous ? 1 : 0) : (gibbous ? 0 : 1);
  return `M ${top} A ${r} ${r} 0 0 ${limbSweep} ${bottom} A ${k} ${r} 0 0 ${termSweep} ${top} Z`;
}

export const SYNODIC_DAYS = 29.530588853;

/**
 * Next full / new moon. `phase` is 0 (new) → 0.5 (full) → 1. Optionally refine with `illumAt(date)`
 * (returns fraction lit) by scanning ±36 h around the estimate in 1 h steps.
 * Returns { full: Date, new: Date }.
 */
export function nextMoonEvents(now, phase, illumAt) {
  const t = now.getTime();
  const day = 86400000;
  let toFull = ((0.5 - phase + 1) % 1) * SYNODIC_DAYS;
  let toNew = ((1 - phase) % 1) * SYNODIC_DAYS;
  if (toFull < 0.02) toFull += SYNODIC_DAYS;
  if (toNew < 0.02) toNew += SYNODIC_DAYS;
  const refine = (estMs, wantMax) => {
    if (typeof illumAt !== 'function') return new Date(estMs);
    let best = estMs, bestV = illumAt(new Date(estMs));
    for (let h = -36; h <= 36; h++) {
      const ms = estMs + h * 3600000;
      if (ms <= t) continue;
      const v = illumAt(new Date(ms));
      if (wantMax ? v > bestV : v < bestV) { best = ms; bestV = v; }
    }
    return new Date(best);
  };
  return { full: refine(t + toFull * day, true), new: refine(t + toNew * day, false) };
}

/**
 * Up/down bands for a 24h timeline. samples: [{t: ms, alt: deg}] in time order; threshold in degrees.
 * Returns [{from, to}] fractions 0–1 of the span where alt > threshold.
 */
export function upBands(samples, threshold = 0) {
  if (!samples?.length) return [];
  const t0 = samples[0].t, span = samples[samples.length - 1].t - t0 || 1;
  const out = [];
  let start = null;
  samples.forEach((s, i) => {
    const up = s.alt > threshold;
    if (up && start == null) start = i === 0 ? s.t : crossing(samples[i - 1], s, threshold);
    if (!up && start != null) { out.push([start, crossing(samples[i - 1], s, threshold)]); start = null; }
  });
  if (start != null) out.push([start, samples[samples.length - 1].t]);
  return out.map(([a, b]) => ({ from: (a - t0) / span, to: (b - t0) / span }));
}
function crossing(a, b, th) {
  const d = b.alt - a.alt;
  if (!d) return b.t;
  return a.t + ((th - a.alt) / d) * (b.t - a.t);
}

/** Bearing (0–360) from the centre of a square element to a point, screen y down; north = up. */
export function pointToBearing(x, y, cx, cy) {
  return norm360((Math.atan2(x - cx, cy - y) * 180) / Math.PI);
}

/** Position on a dial: radius r from centre for a bearing (north = up). */
export function polar(cx, cy, r, az) {
  const a = (az * Math.PI) / 180;
  return { x: +(cx + r * Math.sin(a)).toFixed(2), y: +(cy - r * Math.cos(a)).toFixed(2) };
}

/** Warmer/colder feedback for compass mode: error in degrees → { level 0–1 (1 = on target), label }. */
export function warmth(errorDeg) {
  const e = Math.abs(errorDeg);
  const level = Math.max(0, 1 - e / 180);
  if (e <= 10) return { level, label: 'Red hot! Hold it…', key: 'hot' };
  if (e <= 25) return { level, label: 'Very warm', key: 'warm' };
  if (e <= 60) return { level, label: 'Warmer', key: 'mild' };
  if (e <= 110) return { level, label: 'Cold', key: 'cold' };
  return { level, label: 'Freezing — turn around!', key: 'freezing' };
}

// A few big Indian (and nearby) places so share text can say "near X" fully offline,
// without ever including coordinates. [name, lat, lon]
export const PLACES = [
  ['Bengaluru', 12.97, 77.59], ['Chennai', 13.08, 80.27], ['Mumbai', 19.08, 72.88], ['Delhi', 28.61, 77.21],
  ['Kolkata', 22.57, 88.36], ['Hyderabad', 17.39, 78.49], ['Pune', 18.52, 73.86], ['Ahmedabad', 23.02, 72.57],
  ['Jaipur', 26.91, 75.79], ['Lucknow', 26.85, 80.95], ['Kochi', 9.93, 76.27], ['Thiruvananthapuram', 8.52, 76.94],
  ['Coimbatore', 11.02, 76.96], ['Madurai', 9.93, 78.12], ['Mysuru', 12.30, 76.64], ['Mangaluru', 12.91, 74.86],
  ['Vellore', 12.92, 79.13], ['Hosur', 12.74, 77.83], ['Krishnagiri', 12.52, 78.21], ['Kanchipuram', 12.83, 79.70],
  ['Tiruchirappalli', 10.80, 78.69], ['Salem', 11.66, 78.15], ['Puducherry', 11.94, 79.81], ['Tirupati', 13.63, 79.42],
  ['Vijayawada', 16.51, 80.65], ['Visakhapatnam', 17.69, 83.22], ['Bhubaneswar', 20.30, 85.82], ['Nagpur', 21.15, 79.09],
  ['Indore', 22.72, 75.86], ['Bhopal', 23.26, 77.41], ['Surat', 21.17, 72.83], ['Goa', 15.50, 73.83],
  ['Hubballi', 15.36, 75.12], ['Belagavi', 15.85, 74.50], ['Chandigarh', 30.73, 76.78], ['Amritsar', 31.63, 74.87],
  ['Varanasi', 25.32, 82.97], ['Patna', 25.59, 85.14], ['Guwahati', 26.14, 91.74], ['Ranchi', 23.34, 85.31],
  ['Dehradun', 30.32, 78.03], ['Agra', 27.18, 78.01], ['Kozhikode', 11.26, 75.78], ['Thrissur', 10.53, 76.21],
  ['Nellore', 14.44, 79.99], ['Warangal', 17.97, 79.59], ['Raipur', 21.25, 81.63], ['Srinagar', 34.08, 74.80],
  ['Colombo', 6.93, 79.86], ['Kathmandu', 27.72, 85.32], ['Dhaka', 23.81, 90.41], ['Dubai', 25.20, 55.27],
  ['Singapore', 1.35, 103.82], ['London', 51.51, -0.13],
];

/** Nearest known place within maxKm, or null. Uses an equirectangular approximation (fine at this scale). */
export function nearestPlace(lat, lon, maxKm = 80) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  let best = null, bestD = Infinity;
  const k = Math.cos((lat * Math.PI) / 180);
  for (const [name, plat, plon] of PLACES) {
    const dx = (plon - lon) * k * 111.32, dy = (plat - lat) * 110.57;
    const d = Math.hypot(dx, dy);
    if (d < bestD) { bestD = d; best = name; }
  }
  return bestD <= maxKm ? best : null;
}

/** Share text — never contains coordinates. */
export function shareTextFor(score, rounds, place, url) {
  const icon = bestTarget(rounds) === 'moon' ? '🌙' : '🌞';
  const marks = (rounds || []).map((r) => (r.score >= 80 ? '🟩' : r.score >= 50 ? '🟨' : '⬛')).join('');
  const where = place ? ` near ${place}` : ' on the move';
  return `PlayNest Sky Compass ${icon} ${score}/100${where}\n${marks}${url ? `\n${url}/travel/sky` : ''}`;
}

/**
 * Golden hour status. today/tomorrow: { sunrise, sunset, goldenHourEnd, goldenHourStart } (Dates).
 * Morning golden hour = sunrise → goldenHourEnd; evening = goldenHourStart → sunset.
 * Returns { active: bool, which: 'morning'|'evening', start: Date, end: Date } for the current or next one, or null.
 */
export function goldenStatus(now, today, tomorrow) {
  const t = now.getTime();
  const windows = [];
  for (const d of [today, tomorrow]) {
    if (!d) continue;
    if (d.sunrise && d.goldenHourEnd) windows.push({ which: 'morning', start: d.sunrise, end: d.goldenHourEnd });
    if (d.goldenHourStart && d.sunset) windows.push({ which: 'evening', start: d.goldenHourStart, end: d.sunset });
  }
  windows.sort((a, b) => a.start - b.start);
  for (const w of windows) {
    if (w.end.getTime() <= t) continue;
    return { ...w, active: w.start.getTime() <= t };
  }
  return null;
}

/** First Date in `list` that is after `now` (nulls ignored), or null. */
export const firstAfter = (now, list) => list.filter((d) => d && d.getTime() > now.getTime()).sort((a, b) => a - b)[0] || null;
