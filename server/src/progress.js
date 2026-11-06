// Central progression engine: XP, levels, coins, daily streaks, achievements.
// Every game calls recordResult() exactly once per finished play.
import { pool } from './db.js';
import { today, addDays } from './util.js';

export const levelForXp = (xp) => Math.floor(Math.sqrt(xp / 100)) + 1;
export const xpForLevel = (level) => (level - 1) ** 2 * 100;

// Games that count toward the daily streak (playing any one of them keeps it alive).
export const DAILY_GAMES = ['lexicon', 'target', 'flip'];

export const ACHIEVEMENTS = {
  first_game:      { title: 'Hello, World',     desc: 'Finish your first game',              icon: '🎮' },
  first_win:       { title: 'Winner Winner',    desc: 'Win any game',                         icon: '🏆' },
  streak_3:        { title: 'On a Roll',        desc: 'Reach a 3-day streak',                 icon: '🔥' },
  streak_7:        { title: 'Week Warrior',     desc: 'Reach a 7-day streak',                 icon: '📅' },
  streak_30:       { title: 'Unstoppable',      desc: 'Reach a 30-day streak',                icon: '💎' },
  daily_sweep:     { title: 'Clean Sweep',      desc: 'Finish all daily puzzles in one day',  icon: '🧹' },
  lexicon_genius:  { title: 'Word Wizard',      desc: 'Solve Lexicon in 2 guesses or fewer',  icon: '🧙' },
  target_exact:    { title: 'Bullseye',         desc: 'Hit the exact Target number',          icon: '🎯' },
  flip_par:        { title: 'Efficient',        desc: 'Solve Flip at or under par',           icon: '💡' },
  reflex_40:       { title: 'Lightning Hands',  desc: 'Score 40+ in Reflex',                  icon: '⚡' },
  party_host:      { title: 'Life of the Party', desc: 'Host a party game',                   icon: '🎉' },
  party_win:       { title: 'Crowd Favorite',   desc: 'Win a party game',                     icon: '👑' },
  detective_solve: { title: 'Case Closed',      desc: 'Solve a detective case',               icon: '🕵️' },
  detective_sharp: { title: 'Sharp Mind',       desc: 'Solve a case using 6 questions or fewer', icon: '🔍' },
  level_5:         { title: 'Rising Star',      desc: 'Reach level 5',                        icon: '⭐' },
  level_10:        { title: 'Veteran',          desc: 'Reach level 10',                       icon: '🌟' },
  registered:      { title: 'Here to Stay',     desc: 'Claim your account',                   icon: '🔐' },
  sun_finder:      { title: 'Sun Seeker',       desc: 'Point straight at the sun in Sky Compass', icon: '🌞' },
  moon_finder:     { title: 'Moon Gazer',       desc: 'Point straight at the moon in Sky Compass', icon: '🌝' },
  bingo_line:      { title: 'Window Watcher',   desc: 'Complete a line in Window Bingo',      icon: '🪟' },
  bingo_full:      { title: 'Eagle Eyes',       desc: 'Fill a whole Window Bingo card',       icon: '🦅' },
  predictor_ace:   { title: 'Human GPS',        desc: 'Score 90+ in Distance Predictor',      icon: '🧭' },
  geo_guru:        { title: 'Local Expert',     desc: 'Score 80+ in Guess Where?',            icon: '🗺️' },
  road_warrior:    { title: 'Road Warrior',     desc: 'Travel 100 km on one trip',            icon: '🛣️' },
  globetrotter:    { title: 'Globetrotter',     desc: 'Travel 500 km on one trip',            icon: '🌍' },
};

/**
 * Record a finished play and apply progression.
 * @param {string} userId
 * @param {object} r
 * @param {string} r.game        e.g. 'lexicon' | 'target' | 'flip' | 'reflex' | 'party_trivia' | 'party_reaction' | 'detective'
 * @param {number} r.score       game score (used by leaderboards)
 * @param {boolean} [r.won]
 * @param {number} r.xp          XP to award
 * @param {object} [r.data]      extra JSON stored with the result
 * @param {string[]} [r.achievements] game-specific achievement codes earned by this play (must be keys of ACHIEVEMENTS)
 * @returns {Promise<{xpGained:number, coinsGained:number, xp:number, level:number, levelUp:boolean,
 *                    streak:{current:number,best:number,extended:boolean}, achievements:Array<{code,title,desc,icon}>}>}
 */
export async function recordResult(userId, r) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const date = today();
    const { rows: [u] } = await client.query(
      'SELECT xp, coins, streak_current, streak_best, last_play_date, is_guest FROM users WHERE id=$1 FOR UPDATE',
      [userId]
    );

    await client.query(
      'INSERT INTO game_results (user_id, game, play_date, score, won, data) VALUES ($1,$2,$3,$4,$5,$6)',
      [userId, r.game, date, Math.round(r.score || 0), !!r.won, r.data || {}]
    );

    // Streak: only daily puzzles count.
    let { streak_current: cur, streak_best: best, last_play_date: last } = u;
    let extended = false;
    if (DAILY_GAMES.includes(r.game) && last !== date) {
      cur = last === addDays(date, -1) ? cur + 1 : 1;
      best = Math.max(best, cur);
      last = date;
      extended = true;
    }

    const streakBonus = extended ? Math.min(cur, 10) * 5 : 0;
    const xpGained = Math.max(0, Math.round(r.xp || 0)) + streakBonus;
    const coinsGained = Math.ceil(xpGained / 10);
    const newXp = u.xp + xpGained;
    const levelBefore = levelForXp(u.xp);
    const level = levelForXp(newXp);

    await client.query(
      `UPDATE users SET xp=$1, coins=coins+$2, streak_current=$3, streak_best=$4, last_play_date=$5 WHERE id=$6`,
      [newXp, coinsGained, cur, best, last, userId]
    );

    // Achievements
    const earned = new Set(r.achievements || []);
    earned.add('first_game');
    if (r.won) earned.add('first_win');
    if (cur >= 3) earned.add('streak_3');
    if (cur >= 7) earned.add('streak_7');
    if (cur >= 30) earned.add('streak_30');
    if (level >= 5) earned.add('level_5');
    if (level >= 10) earned.add('level_10');
    if (DAILY_GAMES.includes(r.game)) {
      const { rows } = await client.query(
        `SELECT count(DISTINCT game)::int AS n FROM daily_progress
         WHERE user_id=$1 AND play_date=$2 AND finished AND game = ANY($3)`,
        [userId, date, DAILY_GAMES]
      );
      if (rows[0].n >= DAILY_GAMES.length) earned.add('daily_sweep');
    }
    const unlocked = await unlock(client, userId, [...earned]);

    await client.query('COMMIT');
    return {
      xpGained, coinsGained, xp: newXp, level, levelUp: level > levelBefore,
      streak: { current: cur, best, extended },
      achievements: unlocked,
    };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/** Unlock achievement codes; returns only the newly unlocked ones (with metadata). */
export async function unlock(db, userId, codes) {
  const valid = codes.filter((c) => ACHIEVEMENTS[c]);
  if (!valid.length) return [];
  const { rows } = await db.query(
    `INSERT INTO achievements (user_id, code) SELECT $1, unnest($2::text[])
     ON CONFLICT DO NOTHING RETURNING code`,
    [userId, valid]
  );
  return rows.map(({ code }) => ({ code, ...ACHIEVEMENTS[code] }));
}
