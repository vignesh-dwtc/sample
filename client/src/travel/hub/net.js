// Network helpers for the hub: timeouts, a polite Nominatim queue (≤ 1 request/second), and small
// on-device caches so the last known values survive reloads and offline stretches.

const TIMEOUT_MS = 8000;

/** fetch JSON with a timeout; rejects on HTTP errors, offline, or timeout. Accepts an external AbortSignal. */
export async function fetchJson(url, { signal, timeout = TIMEOUT_MS } = {}) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('offline');
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  const onAbort = () => ctl.abort();
  signal?.addEventListener('abort', onAbort);
  try {
    const res = await fetch(url, { signal: ctl.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
    signal?.removeEventListener('abort', onAbort);
  }
}

// Nominatim usage policy: max 1 request per second, across every caller on the page.
let chain = Promise.resolve();
let lastAt = 0;
export function nominatim(path, params, opts) {
  const qs = new URLSearchParams({ format: 'jsonv2', 'accept-language': 'en', ...params });
  const url = `https://nominatim.openstreetmap.org/${path}?${qs}`;
  const run = chain.then(async () => {
    if (opts?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const wait = lastAt + 1100 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastAt = Date.now();
    return fetchJson(url, opts);
  });
  chain = run.catch(() => {});
  return run;
}

export const openMeteo = (lat, lon, opts) => fetchJson(
  `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}` +
  '&current=temperature_2m,weather_code,wind_speed_10m,is_day&timezone=auto', opts);

export function readCache(key) {
  try { return JSON.parse(localStorage.getItem(`playnest.travel.${key}`)) ?? null; } catch { return null; }
}
export function writeCache(key, value) {
  try { localStorage.setItem(`playnest.travel.${key}`, JSON.stringify(value)); } catch { /* storage blocked */ }
}
