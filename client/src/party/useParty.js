// WebSocket connection + party state for the Party page.
// Handles reconnect with backoff, app-level ping/pong to spot dead links,
// clock-offset correction for countdowns, and re-joining the room after a drop.
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { wsUrl } from '../lib/api.js';

const initial = {
  me: null,
  room: null,
  countdown: null,     // { endsAt }
  question: null,      // { round, category, text, choices, endsAt, duration }
  myChoice: null,
  answeredIds: [],
  reveal: null,        // { round, correct, answers, gained }
  reaction: null,      // { round, state:'wait'|'go'|'ended', at, tapped, results }
  final: null,         // standings[]
  lastGained: {},      // playerId -> points from the most recent round
  error: null,         // { message, code, at }
};

function clearGame(s) {
  return { ...s, countdown: null, question: null, myChoice: null, answeredIds: [], reveal: null, reaction: null, final: null, lastGained: {} };
}

function reducer(s, m) {
  switch (m.type) {
    case 'hello': return { ...s, me: m.userId };
    case 'room': {
      const next = { ...s, room: m.room };
      const changed = !s.room || s.room.code !== m.room.code || s.room.phase !== m.room.phase;
      // Entering lobby or a new game wipes old round state; results keep the last round visible.
      const newRoom = s.room?.code !== m.room.code;
      return changed && (newRoom || m.room.phase !== 'results') ? clearGame(next) : next;
    }
    case 'left': return clearGame({ ...s, room: null });
    case 'countdown': return { ...s, countdown: { endsAt: m.endsAt } };
    case 'question':
      if (s.question?.round === m.round && s.question?.text === m.text) return { ...s, countdown: null };
      return { ...s, countdown: null, question: m, myChoice: null, answeredIds: [], reveal: null };
    case 'answered': return s.question?.round === m.round ? { ...s, myChoice: m.choice } : s;
    case 'answeredCount': return s.question?.round === m.round ? { ...s, answeredIds: m.ids } : s;
    case 'reveal': return { ...s, reveal: m, lastGained: m.gained || {} };
    case 'wait':
      if (s.reaction?.round === m.round && s.reaction.state !== 'ended') return { ...s, countdown: null };
      return { ...s, countdown: null, reaction: { round: m.round, state: 'wait', at: null, tapped: null, results: null } };
    case 'go': return { ...s, reaction: { ...(s.reaction || { round: m.round, tapped: null }), round: m.round, state: 'go', at: m.at } };
    case 'tapped': return s.reaction?.round === m.round ? { ...s, reaction: { ...s.reaction, tapped: m } } : s;
    case 'roundEnd': {
      const lastGained = Object.fromEntries(m.results.map((r) => [r.id, r.points]));
      return { ...s, countdown: null, lastGained, reaction: { ...(s.reaction || {}), round: m.round, state: 'ended', results: m.results } };
    }
    case 'final': return { ...s, final: m.standings };
    case 'error': {
      const next = { ...s, error: { message: m.message, code: m.code, at: Date.now() } };
      return m.code === 'closed' ? clearGame({ ...next, room: null }) : next;
    }
    case 'clearError': return { ...s, error: null };
    case 'reset': return { ...initial, me: s.me };
    default: return s;
  }
}

const PING_EVERY = 10_000;
const PONG_TIMEOUT = 6_000;

/**
 * @param {object} o
 * @param {boolean} o.enabled  connect only once the session has a token
 * @param {(progress) => void} o.onProgress
 */
export function useParty({ enabled, onProgress }) {
  const [state, dispatch] = useReducer(reducer, initial);
  const [status, setStatus] = useState('connecting'); // connecting | open | reconnecting | offline | replaced
  const [connId, setConnId] = useState(0); // increments on every successful (re)connect
  const wsRef = useRef(null);
  const offsetRef = useRef(0);
  const progressRef = useRef(onProgress);
  progressRef.current = onProgress;

  const send = useCallback((msg) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) { ws.send(JSON.stringify(msg)); return true; }
    return false;
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    let stopped = false;
    let attempt = 0;
    let retryTimer = null;
    let pingTimer = null;
    let pongTimer = null;

    const clearTimers = () => { clearTimeout(retryTimer); clearInterval(pingTimer); clearTimeout(pongTimer); };

    const scheduleReconnect = () => {
      if (stopped) return;
      clearTimers();
      const delay = Math.min(5000, 400 * 2 ** attempt) + Math.random() * 250;
      attempt += 1;
      setStatus(navigator.onLine === false ? 'offline' : 'reconnecting');
      retryTimer = setTimeout(open, delay);
    };

    function open() {
      if (stopped) return;
      clearTimers();
      let ws;
      try { ws = new WebSocket(wsUrl()); } catch { scheduleReconnect(); return; }
      wsRef.current = ws;
      let replaced = false;

      ws.onopen = () => {
        attempt = 0;
        setStatus('open');
        setConnId((n) => n + 1);
        pingTimer = setInterval(() => {
          if (ws.readyState !== WebSocket.OPEN) return;
          ws.send('{"type":"ping"}');
          clearTimeout(pongTimer);
          pongTimer = setTimeout(() => ws.close(), PONG_TIMEOUT); // dead link: force reconnect
        }, PING_EVERY);
      };
      ws.onmessage = (ev) => {
        let m;
        try { m = JSON.parse(ev.data); } catch { return; }
        if (typeof m.now === 'number') offsetRef.current = m.now - Date.now();
        if (m.type === 'pong') { clearTimeout(pongTimer); return; }
        if (m.type === 'progress') { progressRef.current?.(m.progress); return; }
        if (m.type === 'error' && m.code === 'replaced') replaced = true;
        dispatch(m);
      };
      ws.onclose = () => {
        if (wsRef.current === ws) wsRef.current = null;
        if (stopped) return;
        if (replaced) { clearTimers(); setStatus('replaced'); return; }
        scheduleReconnect();
      };
      ws.onerror = () => { /* onclose follows */ };
    }

    const wake = () => {
      if (stopped) return;
      const ws = wsRef.current;
      if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) { attempt = 0; open(); }
    };
    const onVisible = () => { if (document.visibilityState === 'visible') wake(); };
    window.addEventListener('online', wake);
    document.addEventListener('visibilitychange', onVisible);

    setStatus('connecting');
    open();
    return () => {
      stopped = true;
      clearTimers();
      window.removeEventListener('online', wake);
      document.removeEventListener('visibilitychange', onVisible);
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws) { ws.onclose = null; ws.close(); }
      dispatch({ type: 'reset' });
    };
  }, [enabled]);

  const serverNow = useCallback(() => Date.now() + offsetRef.current, []);
  const clearError = useCallback(() => dispatch({ type: 'clearError' }), []);

  return { ...state, status, connId, send, serverNow, clearError };
}
