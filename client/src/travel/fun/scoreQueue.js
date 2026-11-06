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

// localStorage is the single source of truth (two open tabs share it); `queue` is a mirror.
const SKEY = 'playnest.fun.sent';
const readQueue = () => { const v = read(QKEY, []); return Array.isArray(v) ? v.filter((x) => x && typeof x === 'object' && x.id && x.game) : []; };
const readObj = (k) => { const v = read(k, {}); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; };
const readSent = () => { const v = read(SKEY, []); return Array.isArray(v) ? v : []; };
const sentId = (item) => (item.key ? `${item.key}|${item.score}` : '');

let queue = readQueue();
let lastSent = readObj(LKEY);
let status = { pending: queue.length, offline: false };
const listeners = new Set();
const resultListeners = new Set();
let timer = null;
let busy = false;

const emit = () => { status = { pending: queue.length, offline: status.offline }; listeners.forEach((l) => l()); };
const saveQ = () => { write(QKEY, queue); emit(); };

/** Run fn while holding a cross-tab lock (Web Locks), so two tabs never send the same item. */
const withLock = (fn) => (typeof navigator !== 'undefined' && navigator.locks?.request
  ? navigator.locks.request('playnest.fun.queue', fn)
  : fn());

function schedule(ms) {
  clearTimeout(timer);
  timer = setTimeout(pump, Math.max(50, ms));
}

function withTimeout(p) {
  let id;
  return Promise.race([p, new Promise((_, rej) => { id = setTimeout(() => rej(Object.assign(new Error('timeout'), { status: 0 })), TIMEOUT_MS); })])
    .finally(() => clearTimeout(id));
}

async function sendOne() {
  queue = readQueue(); lastSent = readObj(LKEY);
  if (!queue.length) { emit(); return; }
  const next = nextToSend(queue, lastSent, Date.now());
  if (!next || next.wait > 0) { emit(); return; }
  const { item } = next;
  lastSent = { ...lastSent, [item.game]: Date.now() }; write(LKEY, lastSent);
  const patch = (fn) => { queue = readQueue().map((x) => (x.id === item.id ? fn(x) : x)); };
  try {
    const r = await withTimeout(submitTravelScore(item.game, item.score, item.data));
    queue = readQueue().filter((x) => x.id !== item.id);
    if (sentId(item)) write(SKEY, [...readSent().filter((k) => k !== sentId(item)), sentId(item)].slice(-50));
    status.offline = false;
    saveQ();
    resultListeners.forEach((l) => l({ item, progress: r.progress, ok: true }));
  } catch (e) {
    if (e.status === 429) {
      patch((x) => ({ ...x, notBefore: Date.now() + GAP_MS }));
    } else if (e.status && e.status >= 400 && e.status < 500 && e.status !== 401 && e.status !== 408) {
      queue = readQueue().filter((x) => x.id !== item.id); // invalid — drop it, never retry forever
      resultListeners.forEach((l) => l({ item, ok: false, error: e.message }));
    } else {
      patch((x) => ({ ...x, notBefore: Date.now() + OFFLINE_RETRY_MS }));
      status.offline = true;
      lastSent = { ...readObj(LKEY), [item.game]: 0 }; write(LKEY, lastSent);
    }
    saveQ();
  }
}

async function pump() {
  if (busy) return;
  queue = readQueue();
  if (!queue.length) { emit(); return; }
  busy = true;
  try { await withLock(sendOne); } catch { /* lock/storage failure: retry later */ } finally {
    busy = false;
    queue = readQueue();
    if (queue.length) schedule(nextToSend(queue, readObj(LKEY), Date.now())?.wait ?? GAP_MS);
  }
}

/**
 * Queue a score. `key` collapses repeat submits (e.g. the same bingo card) into the latest one,
 * and a key+score that was already sent (e.g. by another tab) is not sent again.
 */
export function queueScore(game, score, data = {}, key = '') {
  const item = { id: Math.random().toString(36).slice(2, 10), game, score: Math.max(0, Math.min(100, Math.round(score))), data, key, at: Date.now() };
  queue = readQueue();
  if (key && (readSent().includes(sentId(item)) || queue.some((x) => x.key === key && x.score === item.score))) { emit(); return null; }
  queue = enqueueItem(queue, item);
  saveQ();
  pump();
  return item.id;
}

export function flushQueue() {
  queue = readQueue().map((x) => ({ ...x, notBefore: 0 }));
  saveQ();
  pump();
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', flushQueue);
  // Another tab changed the queue: refresh our mirror (the pending count shown on screen).
  window.addEventListener('storage', (e) => { if (e.key === QKEY) { queue = readQueue(); emit(); } });
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
