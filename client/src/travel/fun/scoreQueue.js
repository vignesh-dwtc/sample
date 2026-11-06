// On-device score queue for the Fun travel games (bingo + predictor).
// Survives reloads/offline, spaces submits per game ≥ 15 s (server rate limit), retries on 429/network errors.
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { submitTravelScore } from '../trip.js';

const QKEY = 'playnest.fun.queue';
const LKEY = 'playnest.fun.lastSent';
export const GAP_MS = 15500;
const TIMEOUT_MS = 10000;
const OFFLINE_RETRY_MS = 30000;

const read = (k, fb) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? fb; } catch { return fb; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } };

/** Pure: add an item; items sharing a non-empty `key` replace the older pending one (keeps the latest score). */
export function enqueueItem(queue, item) {
  const q = item.key ? queue.filter((x) => x.key !== item.key || x.sending) : queue.slice();
  return [...q, item].slice(-20);
}

/** Pure: ms until `game` may be sent again. */
export const waitFor = (lastSent, game, now) => Math.max(0, (lastSent[game] || 0) + GAP_MS - now);

/** Pure: next sendable item (FIFO per game) and how long to wait for it. */
export function nextToSend(queue, lastSent, now) {
  let best = null;
  for (const item of queue) {
    const w = Math.max(waitFor(lastSent, item.game, now), (item.notBefore || 0) - now, 0);
    if (!best || w < best.wait) best = { item, wait: w };
    if (w === 0) break;
  }
  return best;
}

let queue = read(QKEY, []);
if (!Array.isArray(queue)) queue = [];
queue = queue.map((x) => ({ ...x, sending: false }));
let lastSent = read(LKEY, {}) || {};
let status = { pending: queue.length, offline: false };
const listeners = new Set();
const resultListeners = new Set();
let timer = null;
let busy = false;

const emit = () => { status = { pending: queue.length, offline: status.offline }; listeners.forEach((l) => l()); };
const saveQ = () => { write(QKEY, queue.map(({ sending, ...x }) => x)); emit(); };

function schedule(ms) {
  clearTimeout(timer);
  timer = setTimeout(pump, Math.max(50, ms));
}

function withTimeout(p) {
  let id;
  return Promise.race([p, new Promise((_, rej) => { id = setTimeout(() => rej(Object.assign(new Error('timeout'), { status: 0 })), TIMEOUT_MS); })])
    .finally(() => clearTimeout(id));
}

async function pump() {
  if (busy || !queue.length) return;
  const now = Date.now();
  const next = nextToSend(queue, lastSent, now);
  if (!next) return;
  if (next.wait > 0) { schedule(next.wait); return; }
  const { item } = next;
  busy = true; item.sending = true;
  lastSent = { ...lastSent, [item.game]: Date.now() }; write(LKEY, lastSent);
  try {
    const r = await withTimeout(submitTravelScore(item.game, item.score, item.data));
    queue = queue.filter((x) => x.id !== item.id);
    status.offline = false;
    saveQ();
    resultListeners.forEach((l) => l({ item, progress: r.progress, ok: true }));
  } catch (e) {
    item.sending = false;
    if (e.status === 429) {
      item.notBefore = Date.now() + GAP_MS;
    } else if (e.status && e.status >= 400 && e.status < 500 && e.status !== 401 && e.status !== 408) {
      queue = queue.filter((x) => x.id !== item.id); // invalid — drop it, never retry forever
      resultListeners.forEach((l) => l({ item, ok: false, error: e.message }));
    } else {
      item.notBefore = Date.now() + OFFLINE_RETRY_MS;
      status.offline = true;
      lastSent = { ...lastSent, [item.game]: 0 }; write(LKEY, lastSent);
    }
    saveQ();
  } finally {
    busy = false;
    if (queue.length) schedule(nextToSend(queue, lastSent, Date.now())?.wait ?? GAP_MS);
  }
}

/** Queue a score. `key` collapses repeat submits (e.g. the same bingo card) into the latest one. */
export function queueScore(game, score, data = {}, key = '') {
  const item = { id: Math.random().toString(36).slice(2, 10), game, score: Math.max(0, Math.min(100, Math.round(score))), data, key, at: Date.now() };
  queue = enqueueItem(queue, item);
  saveQ();
  pump();
  return item.id;
}

export function flushQueue() {
  queue.forEach((x) => { if (!x.sending) x.notBefore = 0; });
  pump();
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', flushQueue);
  if (queue.length) setTimeout(pump, 500);
}

const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };

/** Hook → { pending, offline }; calls onResult({item, progress, ok, error}) for each finished submit. */
export function useScoreQueue(onResult) {
  const ref = useRef(onResult);
  ref.current = onResult;
  useEffect(() => {
    const l = (r) => ref.current?.(r);
    resultListeners.add(l);
    flushQueue();
    return () => resultListeners.delete(l);
  }, []);
  return useSyncExternalStore(subscribe, () => status, () => status);
}
