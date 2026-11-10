// Save an arcade score with retry (429 / offline) and an idempotent runId per round.
import { api } from '../lib/api.js';

const QKEY = 'playnest.arcade.queue';
const readQ = () => { try { const q = JSON.parse(localStorage.getItem(QKEY)); return Array.isArray(q) ? q : []; } catch { return []; } };
const writeQ = (q) => { try { localStorage.setItem(QKEY, JSON.stringify(q.slice(-20))); } catch { /* ignore */ } };
export const newRunId = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

/**
 * submitArcadeScore(game, score, data, runId) → Promise<{ progress } | { queued: true }>
 * On network error / 429 the score is queued and retried automatically; 4xx (except 429) rejects.
 */
export async function submitArcadeScore(game, score, data = {}, runId = newRunId()) {
  const body = { game, score: Math.max(0, Math.round(score)), data, runId };
  try {
    return await api('/arcade/submit', { method: 'POST', body });
  } catch (e) {
    if (e.status === 409) return { progress: null, duplicate: true };
    if (!e.status || e.status === 429 || e.status >= 500) { writeQ([...readQ().filter((x) => x.runId !== runId), body]); schedule(); return { queued: true }; }
    throw e;
  }
}

let timer;
function schedule(ms = 22000) { clearTimeout(timer); timer = setTimeout(flush, ms); }
async function flush() {
  const q = readQ(); if (!q.length) return;
  const [first, ...rest] = q;
  try { await api('/arcade/submit', { method: 'POST', body: first }); writeQ(rest); }
  catch (e) { if (e.status && e.status !== 429 && e.status < 500) writeQ(rest); }
  if (readQ().length) schedule();
}
if (typeof window !== 'undefined') { window.addEventListener('online', () => schedule(1000)); if (readQ().length) schedule(5000); }
