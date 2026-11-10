// Tests for client/public/sw.js: routing decisions and the fetch/install/activate handlers,
// run inside a vm sandbox with a minimal fake service-worker environment.
// Run: node --test client/src/components/*.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SRC = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8');
const ORIGIN = 'https://playnest.example';

function fakeCaches() {
  const stores = new Map();
  const keyOf = (r) => (typeof r === 'string' ? new URL(r, ORIGIN).href : r.url);
  const open = async (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const m = stores.get(name);
    return {
      match: async (r) => m.get(keyOf(r)),
      put: async (r, res) => { m.set(keyOf(r), res); },
      add: async (r) => { m.set(keyOf(r), new Response('precached', { status: 200 })); },
      keys: async () => [...m.keys()].map((u) => ({ url: u })),
      delete: async (r) => m.delete(keyOf(r)),
    };
  };
  return {
    stores,
    open,
    keys: async () => [...stores.keys()],
    delete: async (n) => stores.delete(n),
  };
}

function load({ fetchImpl } = {}) {
  const listeners = {};
  const caches = fakeCaches();
  const calls = [];
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type, fn) => { listeners[type] = fn; },
    skipWaiting: async () => { calls.push('skipWaiting'); },
    clients: { claim: async () => { calls.push('claim'); } },
    registration: {},
  };
  const fetch = async (req) => {
    calls.push(['fetch', typeof req === 'string' ? req : req.url]);
    return fetchImpl ? fetchImpl(req) : new Response('net', { status: 200 });
  };
  // Like a browser SW, resolve relative Request URLs against the worker's origin.
  class SwRequest extends Request {
    constructor(input, init) { super(typeof input === 'string' ? new URL(input, ORIGIN).href : input, init); }
  }
  const ctx = vm.createContext({ self, caches, fetch, Request: SwRequest, Response, URL, Promise, console });
  vm.runInContext(`${SRC}\n;globalThis.__sw = { strategyFor, VERSION, CACHE, CACHE_PREFIX };`, ctx);
  return { sw: ctx.__sw, listeners, caches, calls };
}

// Simulates a FetchEvent; resolves to the response (or undefined when the SW did not respond).
async function dispatch(listeners, { url, method = 'GET', mode = 'cors' }) {
  let responded = null;
  const waits = [];
  const request = { url, method, mode };
  listeners.fetch({
    request,
    preloadResponse: Promise.resolve(undefined),
    respondWith: (p) => { responded = Promise.resolve(p); },
    waitUntil: (p) => waits.push(p),
  });
  const res = responded ? await responded : undefined;
  await Promise.all(waits);
  return res;
}

test('cache name carries a version constant', () => {
  const { sw } = load();
  assert.match(sw.VERSION, /^v\d+/);
  assert.equal(sw.CACHE, `${sw.CACHE_PREFIX}${sw.VERSION}`);
});

test('strategyFor never handles /api or /ws', () => {
  const { sw } = load();
  const s = (path, extra = {}) => sw.strategyFor({ method: 'GET', mode: 'cors', url: ORIGIN + path, ...extra }, ORIGIN);
  assert.equal(s('/api/profile'), 'bypass');
  assert.equal(s('/api'), 'bypass');
  assert.equal(s('/api/leaderboard?game=xp'), 'bypass');
  assert.equal(s('/ws?token=abc'), 'bypass');
  assert.equal(s('/ws'), 'bypass');
  assert.equal(s('/api/health', { mode: 'navigate' }), 'bypass'); // even top-level navigations
  assert.equal(s('/ws', { mode: 'navigate' }), 'bypass');
});

test('strategyFor routes navigations, assets, statics; bypasses the rest', () => {
  const { sw } = load();
  const s = (url, extra = {}) => sw.strategyFor({ method: 'GET', mode: 'cors', url, ...extra }, ORIGIN);
  assert.equal(s(`${ORIGIN}/`, { mode: 'navigate' }), 'navigate');
  assert.equal(s(`${ORIGIN}/party/ABCD`, { mode: 'navigate' }), 'navigate');
  assert.equal(s(`${ORIGIN}/apiary`, { mode: 'navigate' }), 'navigate'); // not the /api prefix
  assert.equal(s(`${ORIGIN}/assets/index-abc.js`), 'asset');
  assert.equal(s(`${ORIGIN}/icon-192.png`), 'static');
  assert.equal(s(`${ORIGIN}/manifest.webmanifest`), 'static');
  assert.equal(s(`${ORIGIN}/sw.js`), 'bypass');
  assert.equal(s(`${ORIGIN}/assets/x.js`, { method: 'POST' }), 'bypass');
  assert.equal(s('https://fonts.googleapis.com/css2?family=Nunito'), 'bypass');
  assert.equal(s('not a url'), 'bypass');
});

test('fetch handler ignores /api and /ws entirely (no respondWith, no caching)', async () => {
  const { listeners, caches } = load();
  assert.equal(await dispatch(listeners, { url: `${ORIGIN}/api/profile` }), undefined);
  assert.equal(await dispatch(listeners, { url: `${ORIGIN}/api/daily/lexicon/guess`, method: 'POST' }), undefined);
  assert.equal(await dispatch(listeners, { url: `${ORIGIN}/ws?token=t` }), undefined);
  for (const m of caches.stores.values()) for (const k of m.keys()) assert.ok(!/\/(api|ws)\b/.test(new URL(k).pathname));
});

test('navigation: network-first, refreshes the shell, falls back to cached "/" offline', async () => {
  let online = true;
  const { listeners } = load({
    fetchImpl: () => {
      if (!online) throw new TypeError('offline');
      return new Response('<html>fresh</html>', { status: 200, headers: { 'content-type': 'text/html' } });
    },
  });
  // fetch Response.type is 'default' in Node; mark as basic like a same-origin browser response.
  const proto = Object.getOwnPropertyDescriptor(Response.prototype, 'type');
  Object.defineProperty(Response.prototype, 'type', { configurable: true, get: () => 'basic' });
  try {
    const res = await dispatch(listeners, { url: `${ORIGIN}/leaderboard`, mode: 'navigate' });
    assert.equal(await res.text(), '<html>fresh</html>');
    online = false;
    const off = await dispatch(listeners, { url: `${ORIGIN}/profile`, mode: 'navigate' });
    assert.equal(await off.text(), '<html>fresh</html>');
  } finally {
    Object.defineProperty(Response.prototype, 'type', proto);
  }
});

test('navigation offline with empty cache returns an offline page', async () => {
  const { listeners } = load({ fetchImpl: () => { throw new TypeError('offline'); } });
  const res = await dispatch(listeners, { url: `${ORIGIN}/`, mode: 'navigate' });
  assert.equal(res.status, 503);
  assert.match(await res.text(), /offline/i);
});

test('assets: cache-first (second request does not hit the network)', async () => {
  const proto = Object.getOwnPropertyDescriptor(Response.prototype, 'type');
  Object.defineProperty(Response.prototype, 'type', { configurable: true, get: () => 'basic' });
  try {
    const { listeners, calls } = load({ fetchImpl: () => new Response('js', { status: 200 }) });
    const url = `${ORIGIN}/assets/index-123.js`;
    await dispatch(listeners, { url });
    await dispatch(listeners, { url });
    assert.equal(calls.filter((c) => c[0] === 'fetch' && c[1] === url).length, 1);
  } finally {
    Object.defineProperty(Response.prototype, 'type', proto);
  }
});

test('assets: error responses are not cached', async () => {
  const proto = Object.getOwnPropertyDescriptor(Response.prototype, 'type');
  Object.defineProperty(Response.prototype, 'type', { configurable: true, get: () => 'basic' });
  try {
    const { listeners, calls } = load({ fetchImpl: () => new Response('nope', { status: 404 }) });
    const url = `${ORIGIN}/assets/missing.js`;
    await dispatch(listeners, { url });
    await dispatch(listeners, { url });
    assert.equal(calls.filter((c) => c[0] === 'fetch' && c[1] === url).length, 2);
  } finally {
    Object.defineProperty(Response.prototype, 'type', proto);
  }
});

test('install precaches the shell; activate deletes old playnest caches only', async () => {
  const { listeners, caches, sw, calls } = load();
  let p;
  listeners.install({ waitUntil: (x) => { p = x; } });
  await p;
  const cur = caches.stores.get(sw.CACHE);
  assert.ok(cur.has(`${ORIGIN}/`));
  assert.ok(calls.includes('skipWaiting'));

  await caches.open('playnest-v0');
  await caches.open('other-app-cache');
  listeners.activate({ waitUntil: (x) => { p = x; } });
  await p;
  const names = await caches.keys();
  assert.ok(names.includes(sw.CACHE));
  assert.ok(!names.includes('playnest-v0'));
  assert.ok(names.includes('other-app-cache'));
  assert.ok(calls.includes('claim'));
});
