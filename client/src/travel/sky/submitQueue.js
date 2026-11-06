// Robust score submit for Sky Compass: timeout, 429 back-off and an on-device queue for offline play.
import { useCallback, useEffect, useRef, useState } from 'react';
import { submitTravelScore } from '../trip.js';

const QKEY = 'playnest.sky.pending';
const TIMEOUT_MS = 15000; // generous: a request that times out but still lands would be re-sent from the queue (duplicate)

const readQ = () => { try { const v = JSON.parse(localStorage.getItem(QKEY)); return Array.isArray(v) ? v : []; } catch { return []; } };
const writeQ = (q) => { try { q.length ? localStorage.setItem(QKEY, JSON.stringify(q.slice(-5))) : localStorage.removeItem(QKEY); } catch { /* ignore */ } };

function withTimeout(p) {
  let id;
  return Promise.race([p, new Promise((_, rej) => { id = setTimeout(() => rej(Object.assign(new Error('timeout'), { status: 0 })), TIMEOUT_MS); })])
    .finally(() => clearTimeout(id));
}

/**
 * useScoreSubmit(celebrate) → { state, submit(score, data) }
 * state: { status: 'idle'|'saving'|'saved'|'queued'|'waiting'|'error', progress?, message? }
 */
export function useScoreSubmit(celebrate) {
  const [state, setState] = useState({ status: 'idle' });
  const retry = useRef(null);
  const alive = useRef(true);
  const celebrateRef = useRef(celebrate);
  celebrateRef.current = celebrate;

  const send = useCallback(async (item, { fromQueue = false } = {}) => {
    if (fromQueue && !readQ().some((x) => x.id === item.id)) return true; // already synced elsewhere
    try {
      const r = await withTimeout(submitTravelScore('travel_sky', item.score, item.data));
      if (fromQueue) writeQ(readQ().filter((x) => x.id !== item.id));
      if (alive.current && !fromQueue) setState({ status: 'saved', progress: r.progress });
      if (fromQueue && alive.current) setState((s) => (s.status === 'queued' && s.id === item.id ? { status: 'saved', progress: r.progress } : s));
      celebrateRef.current?.(r.progress);
      return true;
    } catch (e) {
      if (e.status === 429) {
        if (alive.current && !fromQueue) setState({ status: 'waiting', message: 'Saving in a few seconds…' });
        clearTimeout(retry.current);
        retry.current = setTimeout(() => send(item, { fromQueue }), 16000);
        return false;
      }
      if (e.status && e.status >= 400 && e.status < 500) {
        if (fromQueue) writeQ(readQ().filter((x) => x.id !== item.id));
        if (alive.current && !fromQueue) setState({ status: 'error', message: e.message });
        return false;
      }
      // offline / timeout / server down: keep it for later
      if (!fromQueue) {
        writeQ([...readQ().filter((x) => x.id !== item.id), item]);
        if (alive.current) setState({ status: 'queued', id: item.id, message: 'No connection — your score is saved on this phone and will sync when you’re back online.' });
      }
      return false;
    }
  }, []);

  const flushing = useRef(false);
  const flush = useCallback(async () => {
    if (flushing.current || (typeof navigator !== 'undefined' && navigator.onLine === false)) return;
    flushing.current = true;
    try {
      for (const item of readQ()) {
        if (!(await send(item, { fromQueue: true }))) break;
      }
    } finally { flushing.current = false; }
  }, [send]);

  useEffect(() => {
    alive.current = true;
    flush();
    window.addEventListener('online', flush);
    return () => { alive.current = false; clearTimeout(retry.current); window.removeEventListener('online', flush); };
  }, [flush]);

  const submit = useCallback((score, data) => {
    const item = { id: Math.random().toString(36).slice(2, 10), score, data, at: Date.now() };
    setState({ status: 'saving' });
    return send(item);
  }, [send]);

  return { state, submit };
}
