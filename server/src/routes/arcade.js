import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { recordResult } from '../progress.js';
import { ah, HttpError } from '../util.js';
import { arcadeReward } from '../games/arcade.js';

const MIN_GAP_MS = 20000; // a real round takes longer than this
const lastSubmit = new Map();

export const arcadeRouter = Router();

// POST /api/arcade/submit { game, score, data, runId } → { progress }
// runId (client-generated per round) makes retries idempotent within this server process.
const seenRuns = new Map(); // runId -> expiry ms
arcadeRouter.post('/submit', requireAuth, ah(async (req, res) => {
  const { game, score, data, runId } = req.body || {};
  const clean = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  if (JSON.stringify(clean).length > 1000) throw new HttpError(400, 'Data too large');
  const reward = arcadeReward(game, score, clean);

  const now = Date.now();
  for (const [k, exp] of seenRuns) if (exp < now) seenRuns.delete(k);
  const runKey = typeof runId === 'string' && runId.length <= 64 ? `${req.user.id}:${runId}` : null;
  if (runKey && seenRuns.has(runKey)) throw new HttpError(409, 'Already saved');

  const key = `${req.user.id}:${game}`;
  if (now - (lastSubmit.get(key) || 0) < MIN_GAP_MS) throw new HttpError(429, 'Slow down — try again in a few seconds');
  lastSubmit.set(key, now);
  if (runKey) seenRuns.set(runKey, now + 6 * 3600 * 1000);

  const { sixes, fours, nearMisses, queen, pocketed, durationMs } = clean;
  const progress = await recordResult(req.user.id, {
    game, score, won: reward.won, xp: reward.xp, achievements: reward.achievements,
    data: { sixes, fours, nearMisses, queen, pocketed, durationMs },
  });
  res.json({ progress });
}));
