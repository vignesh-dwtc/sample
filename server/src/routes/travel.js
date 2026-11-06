// Travel games: scores are computed on the player's device (location never leaves the phone),
// so the server only sanity-checks and awards XP via recordResult().
import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { query } from '../db.js';
import { recordResult } from '../progress.js';
import { ah, HttpError, today } from '../util.js';
import { TRAVEL_GAMES, travelReward } from '../games/travel.js';

const MIN_GAP_MS = 15000;
const lastSubmit = new Map(); // `${userId}:${game}` -> ms

export const travelRouter = Router();

travelRouter.post('/submit', requireAuth, ah(async (req, res) => {
  const { game, score, data } = req.body || {};
  if (!TRAVEL_GAMES.includes(game)) throw new HttpError(400, 'Unknown travel game');
  const clean = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  if (JSON.stringify(clean).length > 2000) throw new HttpError(400, 'Data too large');
  const reward = travelReward(game, score, clean);

  const key = `${req.user.id}:${game}`;
  const now = Date.now();
  if (game !== 'travel_trip' && now - (lastSubmit.get(key) || 0) < MIN_GAP_MS) {
    throw new HttpError(429, 'Slow down — try again in a few seconds');
  }
  if (game === 'travel_trip') {
    const { rows } = await query(
      'SELECT 1 FROM game_results WHERE user_id=$1 AND game=$2 AND play_date=$3 AND score=$4 LIMIT 1',
      [req.user.id, game, today(), score]
    );
    if (rows.length) throw new HttpError(409, 'Milestone already counted today');
  }
  lastSubmit.set(key, now);
  // Location data is deliberately not stored: only keep small, non-location fields.
  const { target, lines, full, mode, minutes, tripId } = clean;
  const progress = await recordResult(req.user.id, {
    game, score, won: reward.won, xp: reward.xp, achievements: reward.achievements,
    data: { target, lines, full, mode, minutes, tripId },
  });
  res.json({ progress });
}));
