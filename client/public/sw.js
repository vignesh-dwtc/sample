/* PlayNest service worker.
 * - Navigations: network-first; on failure fall back to the cached app shell "/".
 * - /assets/* (hashed Vite bundles): cache-first.
 * - A few static files (icons, manifest): stale-while-revalidate.
 * - NEVER touches /api or /ws (or any non-GET / cross-origin request).
 * Bump VERSION whenever caching behaviour changes; old caches are deleted on activate.
 */
const VERSION = 'v1';
const CACHE_PREFIX = 'playnest-';
const CACHE = `${CACHE_PREFIX}${VERSION}`;
const SHELL = '/';
const PRECACHE = [SHELL, '/manifest.webmanifest', '/icon.svg', '/icon-192.png', '/icon-512.png'];
const STATIC = new Set(PRECACHE.filter((p) => p !== SHELL));
const MAX_ASSETS = 120;

/**
 * Decide how to handle a request. Pure function (unit-tested).
 * @param {{method:string, mode:string, url:string}} req
 * @param {string} origin  the service worker's origin
 * @returns {'bypass'|'navigate'|'asset'|'static'}
 */
function strategyFor(req, origin) {
  if (req.method !== 'GET') return 'bypass';
  let url;
  try { url = new URL(req.url); } catch { return 'bypass'; }
  if (url.origin !== origin) return 'bypass';
  const p = url.pathname;
  if (p === '/api' || p.startsWith('/api/') || p === '/ws' || p.startsWith('/ws/')) return 'bypass';
  if (req.mode === 'navigate') return 'navigate';
  if (p.startsWith('/assets/')) return 'asset';
  if (STATIC.has(p)) return 'static';
  return 'bypass';
}

const cacheable = (res) => res && res.ok && res.type === 'basic' && !res.redirected;

async function trimAssets(cache) {
  const keys = (await cache.keys()).filter((r) => new URL(r.url).pathname.startsWith('/assets/'));
  for (const r of keys.slice(0, Math.max(0, keys.length - MAX_ASSETS))) await cache.delete(r);
}

async function handleNavigate(event) {
  const cache = await caches.open(CACHE);
  try {
    const preload = await event.preloadResponse;
    const res = preload || (await fetch(event.request));
    // Every SPA route serves index.html: keep the freshest copy as the offline shell.
    if (cacheable(res) && (res.headers.get('content-type') || '').includes('text/html')) {
      await cache.put(SHELL, res.clone());
    }
    return res;
  } catch {
    const shell = await cache.match(SHELL);
    return shell || new Response(
      '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>PlayNest · Offline</title><body style="font-family:system-ui;background:#0f1020;color:#eef0ff;display:grid;place-items:center;min-height:100vh;margin:0;text-align:center">' +
      '<div><h1>You’re offline</h1><p>Reconnect to keep playing PlayNest.</p></div>',
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }
}

async function handleAsset(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (cacheable(res)) {
    await cache.put(request, res.clone());
    trimAssets(cache).catch(() => {});
  }
  return res;
}

async function handleStatic(event) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(event.request);
  const network = fetch(event.request).then(async (res) => {
    if (cacheable(res)) await cache.put(event.request, res.clone());
    return res;
  });
  if (hit) {
    event.waitUntil(network.catch(() => {}));
    return hit;
  }
  return network;
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Best effort: one missing file must not block installation.
    await Promise.all(PRECACHE.map((p) => cache.add(new Request(p, { cache: 'reload' })).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n.startsWith(CACHE_PREFIX) && n !== CACHE).map((n) => caches.delete(n)));
    if (self.registration.navigationPreload) await self.registration.navigationPreload.enable().catch(() => {});
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const strategy = strategyFor(request, self.location.origin);
  if (strategy === 'bypass') return; // let the browser handle it (API, WebSocket, cross-origin, POST…)
  if (strategy === 'navigate') event.respondWith(handleNavigate(event));
  else if (strategy === 'asset') event.respondWith(handleAsset(request));
  else if (strategy === 'static') event.respondWith(handleStatic(event));
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
