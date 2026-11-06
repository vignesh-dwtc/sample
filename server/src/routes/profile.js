import { Router } from 'express';
import { query, pool } from '../db.js';
import { requireAuth } from '../auth.js';
import { ah, today, addDays, HttpError } from '../util.js';
import { ACHIEVEMENTS, DAILY_GAMES, levelForXp, xpForLevel, unlock } from '../progress.js';

export const profileRouter = Router();

// Dashboard summary: level, streak, today's daily status, achievements.
profileRouter.get('/', requireAuth, ah(async (req, res) => {
  const u = req.user;
  const date = today();
  const [{ rows: done }, { rows: ach }, { rows: stats }] = await Promise.all([
    query('SELECT game, finished FROM daily_progress WHERE user_id=$1 AND play_date=$2', [u.id, date]),
    query('SELECT code, unlocked_at FROM achievements WHERE user_id=$1', [u.id]),
    query(`SELECT game, count(*)::int AS plays, count(*) FILTER (WHERE won)::int AS wins, max(score)::int AS best
           FROM game_results WHERE user_id=$1 GROUP BY game`, [u.id]),
  ]);
  // A streak is only "alive" if the last play was today or yesterday.
  const alive = u.last_play_date === date || u.last_play_date === addDays(date, -1);
  const level = levelForXp(u.xp);
  const unlocked = Object.fromEntries(ach.map((a) => [a.code, a.unlocked_at]));
  res.json({
    user: u,
    level,
    levelXp: { current: u.xp - xpForLevel(level), needed: xpForLevel(level + 1) - xpForLevel(level) },
    streak: { current: alive ? u.streak_current : 0, best: u.streak_best, playedToday: u.last_play_date === date },
    daily: Object.fromEntries(DAILY_GAMES.map((g) => [g, done.find((d) => d.game === g)?.finished ? 'done' : (done.find((d) => d.game === g) ? 'in_progress' : 'new')])),
    stats,
    achievements: Object.entries(ACHIEVEMENTS).map(([code, a]) => ({ code, ...a, unlockedAt: unlocked[code] || null })),
    date,
  });
}));

profileRouter.post('/registered', requireAuth, ah(async (req, res) => {
  if (req.user.is_guest) throw new HttpError(400, 'Not registered');
  res.json({ achievements: await unlock(pool, req.user.id, ['registered']) });
}));

export const leaderboardRouter = Router();

// GET /api/leaderboard?game=xp|lexicon|target|flip|reflex|party|detective&period=today|week|all
leaderboardRouter.get('/', requireAuth, ah(async (req, res) => {
  const game = String(req.query.game || 'xp');
  const period = String(req.query.period || 'today');
  const date = today();
  let rows;
  if (game === 'xp') {
    ({ rows } = await query(
      `SELECT id, username, avatar, xp AS score FROM users ORDER BY xp DESC, created_at LIMIT 50`));
  } else {
    const from = period === 'today' ? date : period === 'week' ? addDays(date, -6) : '1970-01-01';
    const games = game === 'party' ? ['party_trivia', 'party_reaction'] : [game];
    // Per day keep each user's best score, then sum across the period.
    ({ rows } = await query(
      `WITH best AS (
         SELECT user_id, play_date, max(score) AS s FROM game_results
         WHERE game = ANY($1) AND play_date >= $2 GROUP BY user_id, play_date)
       SELECT u.id, u.username, u.avatar, sum(b.s)::int AS score
       FROM best b JOIN users u ON u.id=b.user_id
       GROUP BY u.id ORDER BY score DESC, u.username LIMIT 50`, [games, from]));
  }
  const ranked = rows.map((r, i) => ({ rank: i + 1, ...r, me: r.id === req.user.id }));
  res.json({ game, period, rows: ranked, me: ranked.find((r) => r.me) || null });
}));
