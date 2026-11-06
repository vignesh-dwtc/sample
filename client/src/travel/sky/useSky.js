import { useEffect, useMemo, useState } from 'react';
import { moonInfo, sunInfo } from '../sky.js';
import SunCalc from 'suncalc';
import { firstAfter, goldenStatus, nextMoonEvents, upBands } from './skyLogic.js';

const LAST_KEY = 'playnest.sky.lastpos';

/** Ticking clock (ms resolution `every`). */
export function useNow(every = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), every);
    const vis = () => { if (!document.hidden) setNow(new Date()); };
    document.addEventListener('visibilitychange', vis);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', vis); };
  }, [every]);
  return now;
}

/**
 * Live position, or the last known one (kept on this device only, rounded to ~1 km) so the sky
 * still works in a tunnel or before the first GPS fix. Returns { lat, lon, stale } | null.
 */
export function useSkyPosition(position) {
  const [last, setLast] = useState(() => {
    try { const v = JSON.parse(localStorage.getItem(LAST_KEY)); return v && Number.isFinite(v.lat) ? v : null; } catch { return null; }
  });
  useEffect(() => {
    if (!position) return;
    const v = { lat: Math.round(position.lat * 100) / 100, lon: Math.round(position.lon * 100) / 100, at: Date.now() };
    if (last && last.lat === v.lat && last.lon === v.lon && Date.now() - last.at < 600000) return;
    setLast(v);
    try { localStorage.setItem(LAST_KEY, JSON.stringify(v)); } catch { /* ignore */ }
  }, [position]); // eslint-disable-line react-hooks/exhaustive-deps
  if (position) return { lat: position.lat, lon: position.lon, stale: false };
  if (last) return { lat: last.lat, lon: last.lon, stale: true, at: last.at };
  return null;
}

/** Everything the page shows about the sky, computed on-device. */
export function useSkyData(pos, now) {
  const lat = pos?.lat, lon = pos?.lon;
  // Positions every tick; times only when the minute / place changes.
  const minute = Math.floor(now.getTime() / 60000);
  const latKey = lat == null ? null : Math.round(lat * 100), lonKey = lon == null ? null : Math.round(lon * 100);

  const slow = useMemo(() => {
    if (latKey == null) return null;
    const t = new Date(minute * 60000);
    const la = latKey / 100, lo = lonKey / 100;
    const today = sunInfo(t, la, lo);
    const tomorrow = sunInfo(new Date(t.getTime() + 86400000), la, lo);
    const moonToday = moonInfo(t, la, lo);
    const moonTomorrow = moonInfo(new Date(t.getTime() + 86400000), la, lo);
    const moonYesterday = moonInfo(new Date(t.getTime() - 86400000), la, lo);
    const waxing = moonToday.phase < 0.5;
    const events = nextMoonEvents(t, moonToday.phase, (d) => SunCalc.getMoonIllumination(d).fraction);
    // 24h timeline samples every 15 min
    const sunS = [], moonS = [];
    for (let i = 0; i <= 96; i++) {
      const d = new Date(t.getTime() + i * 900000);
      const sp = SunCalc.getPosition(d, la, lo), mp = SunCalc.getMoonPosition(d, la, lo);
      sunS.push({ t: d.getTime(), alt: (sp.altitude * 180) / Math.PI });
      moonS.push({ t: d.getTime(), alt: (mp.altitude * 180) / Math.PI });
    }
    return {
      today, tomorrow, waxing, events,
      golden: goldenStatus(t, today, tomorrow),
      nextSunrise: firstAfter(t, [today.sunrise, tomorrow.sunrise]),
      nextSunset: firstAfter(t, [today.sunset, tomorrow.sunset]),
      moonRiseToday: moonToday.rise, moonSetToday: moonToday.set,
      nextMoonrise: firstAfter(t, [moonYesterday.rise, moonToday.rise, moonTomorrow.rise]),
      nextMoonset: firstAfter(t, [moonYesterday.set, moonToday.set, moonTomorrow.set]),
      timeline: { start: t.getTime(), sun: upBands(sunS, -0.833), moon: upBands(moonS, 0), sunS, moonS },
      moonAlwaysUp: moonToday.alwaysUp, moonAlwaysDown: moonToday.alwaysDown,
    };
  }, [minute, latKey, lonKey]);

  const sec = Math.floor(now.getTime() / 1000);
  const live = useMemo(() => {
    if (lat == null) return null;
    const t = new Date(sec * 1000);
    return { sun: sunInfo(t, lat, lon), moon: moonInfo(t, lat, lon) };
  }, [sec, lat, lon]);

  if (!slow || !live) return null;
  return { ...slow, sun: live.sun, moon: live.moon };
}
