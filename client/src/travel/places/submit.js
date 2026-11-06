// Calm score saving for Guess Where?: timeout, automatic retry after a 429, and an on-device
// queue when offline (flushed when the phone reconnects or the page is opened again).
import { useCallback, useEffect, useRef, useState } from 'react';
import { submitTravelScore } from '../trip.js';

const QKEY = 'playnest.quiz.pending';
const GAME = 'travel_quiz';
const TIMEOUT_MS = 10000;

const readQ = () => { try { const v = JSON.parse(localStorage.getItem(QKEY)); return Array.isArray(v) ? v : []; } catch { return []; } };
const writeQ = (q) => { try { q.length ? localStorage.setItem(QKEY, JSON.stringify(q.slice(-3))) : localStorage.removeItem(QKEY); } catch { /* ignore */ } };
const timeout = (p) => {
  let id;
  return Promise.race([p, new Promise((_, rej) => { id = setTimeout(() => rej(Object.assign(new Error('timeout'), { status: 0 })), TIMEOUT_MS); })])
    .finally(() => clearTimeout(id));
};
const isNetwork = (e) => !e?.status || e.status >= 500 || e.name === 'TypeError';

/** useQuizSubmit(celebrate) → { state: {status:'idle'|'saving'|'saved'|'waiting'|'queued'|'error', progress?, message?}, submit(score, data) } */
export function useQuizSubmit(celebrate) {
  const [state, setState] = useState({ status: 'idle' });
  const alive = useRef(true);
  const timer = useRef(null);
  const cel = useRef(celebrate);
  cel.current = celebrate;
  const current = useRef(null);
  // Only the quiz just played drives the visible status; background flushes stay quiet (but still celebrate).
  const set = (s) => alive.current && s.id === current.current && setState(s);

  const inflight = useRef(new Set());

  const send = useCallback(async (item, attempt = 0) => {
    if (inflight.current.has(item.id)) return; // e.g. two 'online' events in a row
    inflight.current.add(item.id);
    set({ status: 'saving', id: item.id });
    try {
      const r = await timeout(submitTravelScore(GAME, item.score, item.data));
      writeQ(readQ().filter((x) => x.id !== item.id));
      set({ status: 'saved', progress: r.progress, id: item.id });
      cel.current?.(r.progress);
    } catch (e) {
      if (e.status === 429 && attempt < 4) {
        set({ status: 'waiting', message: 'Saving in a few seconds…', id: item.id });
        clearTimeout(timer.current);
        timer.current = setTimeout(() => send(item, attempt + 1), 16000);
      } else if (isNetwork(e)) {
        writeQ([...readQ().filter((x) => x.id !== item.id), item]);
        set({ status: 'queued', message: 'No connection — your score is saved on this phone and will be sent when you’re back online.', id: item.id });
      } else {
        writeQ(readQ().filter((x) => x.id !== item.id));
        set({ status: 'error', message: e.message || 'Could not save the score.', id: item.id });
      }
    } finally {
      inflight.current.delete(item.id);
    }
  }, []);

  const submit = useCallback((score, data) => {
    const item = { id: Math.random().toString(36).slice(2), score, data, at: Date.now() };
    current.current = item.id;
    return send(item);
  }, [send]);

  // Flush any queued score when we come back online (and once on mount).
  useEffect(() => {
    alive.current = true;
    const flush = () => {
      if (navigator.onLine === false) return;
      const [next] = readQ();
      if (next) send(next);
    };
    const t = setTimeout(flush, 1500);
    window.addEventListener('online', flush);
    return () => { alive.current = false; clearTimeout(t); clearTimeout(timer.current); window.removeEventListener('online', flush); };
  }, [send]);

  return { state, submit };
}
