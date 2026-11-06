// Sun & moon positions/times computed on-device (works offline) via suncalc.
// All azimuths here are converted to degrees clockwise from NORTH (compass convention).
import SunCalc from 'suncalc';

const toCompass = (azRad) => ((azRad * 180) / Math.PI + 180 + 360) % 360; // suncalc: from south, westward
const toDeg = (r) => (r * 180) / Math.PI;
const valid = (d) => (d instanceof Date && !Number.isNaN(d.getTime()) ? d : null);

export function sunInfo(date, lat, lon) {
  const p = SunCalc.getPosition(date, lat, lon);
  const t = SunCalc.getTimes(date, lat, lon);
  return {
    azimuth: toCompass(p.azimuth),          // degrees from north
    altitude: toDeg(p.altitude),            // degrees above horizon (negative = below)
    up: toDeg(p.altitude) > -0.833,
    sunrise: valid(t.sunrise), sunset: valid(t.sunset), solarNoon: valid(t.solarNoon),
    dawn: valid(t.dawn), dusk: valid(t.dusk),
    goldenHourStart: valid(t.goldenHour),   // evening golden hour begins
    goldenHourEnd: valid(t.goldenHourEnd),  // morning golden hour ends
    night: valid(t.night), nightEnd: valid(t.nightEnd),
  };
}

const PHASES = [
  [0.03, 'New moon', '🌑'], [0.22, 'Waxing crescent', '🌒'], [0.28, 'First quarter', '🌓'],
  [0.47, 'Waxing gibbous', '🌔'], [0.53, 'Full moon', '🌕'], [0.72, 'Waning gibbous', '🌖'],
  [0.78, 'Last quarter', '🌗'], [0.97, 'Waning crescent', '🌘'], [1.01, 'New moon', '🌑'],
];

export function moonInfo(date, lat, lon) {
  const p = SunCalc.getMoonPosition(date, lat, lon);
  const ill = SunCalc.getMoonIllumination(date);
  const t = SunCalc.getMoonTimes(date, lat, lon);
  const [, phaseName, emoji] = PHASES.find(([max]) => ill.phase < max);
  return {
    azimuth: toCompass(p.azimuth),
    altitude: toDeg(p.altitude),
    up: toDeg(p.altitude) > 0,
    distanceKm: p.distance,
    illumination: ill.fraction,   // 0–1
    phase: ill.phase,             // 0 new → 0.5 full → 1 new
    phaseName, emoji,
    rise: valid(t.rise), set: valid(t.set), alwaysUp: !!t.alwaysUp, alwaysDown: !!t.alwaysDown,
  };
}

/** Upcoming sky events (next 24h) for an events feed: [{at: Date, kind, icon, title}] sorted by time. */
export function upcomingSkyEvents(now, lat, lon) {
  const out = [];
  for (const offset of [0, 1]) {
    const d = new Date(now.getTime() + offset * 86400000);
    const s = sunInfo(d, lat, lon), m = moonInfo(d, lat, lon);
    const add = (at, kind, icon, title) => at && at > now && at - now < 86400000 && out.push({ at, kind, icon, title });
    add(s.dawn, 'dawn', '🌌', 'First light (dawn)');
    add(s.sunrise, 'sunrise', '🌅', 'Sunrise');
    add(s.goldenHourEnd, 'golden-end', '✨', 'Morning golden hour ends');
    add(s.solarNoon, 'noon', '☀️', 'Sun at its highest (solar noon)');
    add(s.goldenHourStart, 'golden', '📸', 'Golden hour begins');
    add(s.sunset, 'sunset', '🌇', 'Sunset');
    add(s.dusk, 'dusk', '🌃', 'Dusk — stars come out');
    add(m.rise, 'moonrise', m.emoji, `Moonrise (${m.phaseName.toLowerCase()})`);
    add(m.set, 'moonset', '🌙', 'Moonset');
  }
  const seen = new Set();
  return out.sort((a, b) => a.at - b.at).filter((e) => (seen.has(e.kind) ? false : seen.add(e.kind)));
}
