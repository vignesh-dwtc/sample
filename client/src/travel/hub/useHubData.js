// React hooks for the hub's live data. All network calls are optional extras: failures keep the last known value.
import { useEffect, useRef, useState } from 'react';
import { distanceKm } from '../geo.js';
import { derivedKmh, gpsKmh, placeFromNominatim, shouldReverse } from './hubLogic.js';
import { nominatim, openMeteo, readCache, writeCache } from './net.js';

// Guards for on-device caches: a corrupted or old-format value must never crash the hub.
const okNum = (n) => typeof n === 'number' && Number.isFinite(n);
const validPlace = (p) => (p && typeof p === 'object' && okNum(p.lat) && okNum(p.lon) && okNum(p.at) && typeof p.name === 'string' ? p : null);
const validWx = (w) => (w && typeof w === 'object' && okNum(w.lat) && okNum(w.lon) && okNum(w.at) && w.current && typeof w.current === 'object' ? w : null);

/** Current time, re-rendering every `ms`. */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    // Skip ticks while the screen is off / tab hidden (saves battery over a 12 h trip); catch up on return.
    const hidden = () => typeof document !== 'undefined' && document.hidden;
    const id = setInterval(() => { if (!hidden()) setNow(new Date()); }, ms);
    const vis = () => { if (!hidden()) setNow(new Date()); };
    document.addEventListener('visibilitychange', vis);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', vis); };
  }, [ms]);
  return now;
}

/** Live speed in km/h: the GPS speed when the device reports it, else derived from the last few fixes. */
export function useSpeed(position) {
  const fixes = useRef([]);
  const [kmh, setKmh] = useState(null);
  useEffect(() => {
    if (!position) return;
    const at = position.at || Date.now();
    const list = fixes.current;
    if (!list.length || list[list.length - 1][2] !== at) list.push([position.lat, position.lon, at]);
    while (list.length > 2 && at - list[0][2] > 3 * 60000) list.shift();
    const g = gpsKmh(position);
    setKmh(g != null ? g : derivedKmh(list, at));
  }, [position]);
  return kmh;
}

/** Track the trip's top speed on the device. */
export function useTopSpeed(trip, kmh) {
  const [top, setTop] = useState(() => {
    const c = readCache('top');
    return c && trip && c.tripId === trip.id && Number.isFinite(c.kmh) ? c.kmh : 0;
  });
  useEffect(() => {
    if (!trip) return;
    const c = readCache('top');
    const prev = c && c.tripId === trip.id && Number.isFinite(c.kmh) ? c.kmh : 0;
    const max = { road: 200, train: 400, flight: 1100 }[trip.mode] || 400;
    const next = kmh != null && kmh <= max && kmh > prev ? kmh : prev;
    if (next !== prev || !c || c.tripId !== trip.id) writeCache('top', { tripId: trip.id, kmh: next });
    setTop(next);
  }, [trip?.id, trip?.mode, kmh]); // eslint-disable-line react-hooks/exhaustive-deps
  return top;
}

/**
 * Current place name via Nominatim reverse geocoding (at most every 2 min / 2 km, cached on-device).
 * Calls onRegion(newState, place) when the state/region changes.
 */
export function usePlace(position, online, onRegion) {
  const [place, setPlace] = useState(() => validPlace(readCache('place')));
  const [status, setStatus] = useState('idle'); // idle | loading | error
  const busy = useRef(false);
  const failedAt = useRef(0);
  const cb = useRef(onRegion);
  cb.current = onRegion;

  useEffect(() => {
    if (!position || !online || busy.current) return;
    const now = Date.now();
    if (now - failedAt.current < 3 * 60000) return; // back off politely after a failure (e.g. Nominatim 429)
    const last = validPlace(readCache('place'));
    if (!shouldReverse(last, position, now)) return;
    busy.current = true;
    setStatus('loading');
    nominatim('reverse', { lat: position.lat.toFixed(4), lon: position.lon.toFixed(4), zoom: 10 })
      .then((r) => {
        if (r?.error) throw new Error(r.error);
        const p = { ...placeFromNominatim(r), lat: position.lat, lon: position.lon, at: Date.now() };
        writeCache('place', p);
        if (last?.state && p.state && last.state !== p.state) cb.current?.(p.state, p, last);
        setPlace(p);
        setStatus('idle');
      })
      .catch(() => { failedAt.current = Date.now(); setStatus('error'); })
      .finally(() => { busy.current = false; });
  }, [position, online]);

  return { place, status };
}

/**
 * Open-Meteo current weather for a point. Refreshes every 15 min (or after moving 25 km), keeps the
 * last result on-device for offline use. Returns { data, at, status, timezone }.
 */
export function useWeather(cacheKey, point, online) {
  const [state, setState] = useState(() => validWx(readCache(`wx.${cacheKey}`)));
  const [status, setStatus] = useState('idle');
  const tick = useNow(60000);
  const busy = useRef(false);
  const failedAt = useRef(0);
  const lat = point?.lat, lon = point?.lon;

  useEffect(() => {
    if (lat == null || lon == null || !online || busy.current) return;
    const now = Date.now();
    if (now - failedAt.current < 90000) return;
    const c = validWx(readCache(`wx.${cacheKey}`));
    const age = c ? now - c.at : Infinity;
    const moved = c ? distanceKm(c, { lat, lon }) : Infinity;
    if (c && moved < 25 && age < 15 * 60000) { setState((s) => (s && s.at === c.at ? s : c)); return; }
    // Moving fast: refresh at most every 3 min — unless the cached result is too far away to show at all.
    if (c && moved >= 25 && moved < 60 && age < 3 * 60000) return;
    busy.current = true;
    setStatus('loading');
    openMeteo(lat, lon)
      .then((r) => {
        if (!r?.current) throw new Error('No data');
        const next = { lat, lon, at: Date.now(), current: r.current, timezone: r.timezone, units: r.current_units };
        writeCache(`wx.${cacheKey}`, next);
        setState(next);
        setStatus('idle');
      })
      .catch(() => { failedAt.current = Date.now(); setStatus('error'); })
      .finally(() => { busy.current = false; });
  }, [cacheKey, lat, lon, online, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  // A cached result for a different destination is not useful.
  const fresh = state && lat != null && distanceKm(state, { lat, lon }) < 60 ? state : null;
  return { data: fresh, status };
}

/** Pre-load every travel page chunk so the service worker caches it for offline use. */
const TRAVEL_PAGES = [
  () => import('../../pages/TravelSky.jsx'),
  () => import('../../pages/TravelMap.jsx'),
  () => import('../../pages/TravelQuiz.jsx'),
  () => import('../../pages/TravelBingo.jsx'),
  () => import('../../pages/TravelPredict.jsx'),
];
let readyPromise = null;

/**
 * On a first visit the chunks may load before the service worker takes control, so they'd miss its cache.
 * Once it controls the page (up to 10 s), re-request every loaded /assets/ file so the worker stores it.
 */
async function warmServiceWorker() {
  const sw = typeof navigator !== 'undefined' ? navigator.serviceWorker : null;
  if (!sw || !import.meta.env?.PROD) return;
  if (!sw.controller) {
    await new Promise((resolve) => {
      const t = setTimeout(resolve, 10000);
      sw.addEventListener('controllerchange', () => { clearTimeout(t); resolve(); }, { once: true });
    });
  }
  if (!sw.controller) return;
  const urls = [...new Set(performance.getEntriesByType('resource').map((e) => e.name)
    .filter((u) => { try { const x = new URL(u); return x.origin === location.origin && x.pathname.startsWith('/assets/'); } catch { return false; } }))];
  await Promise.all(urls.map((u) => fetch(u).catch(() => {})));
}
export function useOfflineReady(online) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    if (!online && !readyPromise) return undefined;
    // Never cache a failed attempt: if one chunk fails, the next online event tries again.
    readyPromise ||= Promise.all(TRAVEL_PAGES.map((f) => f())).then(warmServiceWorker)
      .catch((e) => { readyPromise = null; throw e; });
    readyPromise.then(() => alive && setReady(true), () => {});
    return () => { alive = false; };
  }, [online]);
  return ready;
}
