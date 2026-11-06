// Daily puzzles: Lexicon, Target, Flip (once per UTC day) and Reflex (unlimited arcade runs).
//
// Exactly-once rewards: every state change on daily_progress happens in a transaction that
// holds the row lock (SELECT … FOR UPDATE), so a double-submit can't apply twice. When a play
// finishes we commit finished=true with state.record='pending' FIRST (the daily-sweep
// achievement reads it), then claim the reward with a conditional UPDATE (pending → recording)
// so only one request ever calls recordResult. If recordResult fails the claim is released and
// the next GET retries it.
import { Router } from 'express';
import { pool, query } from '../db.js';
import { requireAuth } from '../auth.js';
import { recordResult, DAILY_GAMES } from '../progress.js';
import { ah, today, HttpError } from '../util.js';
import {
  answerFor, isValidGuess, normalizeWord, lexiconView, hintsFor, clueFor, lexiconScore, lexiconXp, MAX_GUESSES, WORD_LENGTH,
} from '../games/lexicon.js';
import { generateTarget, scoreExpression, targetXp, ExprError, MAX_EXPRESSION_LENGTH } from '../games/target.js';
import { generateFlip, applyMoves, isSolved, validMoves, flipScore, flipXp } from '../games/flip.js';
import { validateReflex, reflexXp, reflexMinGapMs } from '../games/reflex.js';

export const dailyRouter = Router();
dailyRouter.use(requireAuth);

// Puzzles are deterministic per date; memoise the last few days.
const memo = new Map();
function cached(key, fn) {
  if (!memo.has(key)) {
    if (memo.size > 30) memo.delete(memo.keys().next().value);
    memo.set(key, fn());
  }
  return memo.get(key);
}
const targetFor = (date) => cached(`target:${date}`, () => generateTarget(date));
const flipFor = (date) => cached(`flip:${date}`, () => generateFlip(date));

/** Run fn(client, row) holding the user's daily_progress row lock (row created on demand). */
async function withDailyRow(userId, game, date, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO daily_progress (user_id, game, play_date) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
      [userId, game, date]);
    const { rows: [row] } = await client.query(
      `SELECT state, finished FROM daily_progress WHERE user_id=$1 AND game=$2 AND play_date=$3 FOR UPDATE`,
      [userId, game, date]);
    const save = (state, finished) => client.query(
      `UPDATE daily_progress SET state=$4, finished=$5, updated_at=now() WHERE user_id=$1 AND game=$2 AND play_date=$3`,
      [userId, game, date, state, finished]);
    const out = await fn(row, save);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

async function readRow(userId, game, date) {
  const { rows } = await query(
    'SELECT state, finished FROM daily_progress WHERE user_id=$1 AND game=$2 AND play_date=$3',
    [userId, game, date]);
  return rows[0] || null;
}

/**
 * Award a finished daily play exactly once. `state.record` must be 'pending'.
 * Returns the progress object (or the stored one when it was already recorded).
 */
async function settle(userId, game, date, result) {
  const { rows } = await query(
    `UPDATE daily_progress SET state = jsonb_set(state, '{record}', '"recording"')
     WHERE user_id=$1 AND game=$2 AND play_date=$3 AND finished AND state->>'record' = 'pending'
     RETURNING state`, [userId, game, date]);
  if (!rows[0]) return (await readRow(userId, game, date))?.state?.progress || null;
  try {
    const progress = await recordResult(userId, { game, ...result });
    await query(
      `UPDATE daily_progress SET state = state || jsonb_build_object('record','done','progress',$4::jsonb)
       WHERE user_id=$1 AND game=$2 AND play_date=$3`, [userId, game, date, JSON.stringify(progress)]);
    return progress;
  } catch (e) {
    await query(
      `UPDATE daily_progress SET state = jsonb_set(state, '{record}', '"pending"')
       WHERE user_id=$1 AND game=$2 AND play_date=$3`, [userId, game, date]).catch(() => {});
    throw e;
  }
}

// ---------- Overview ----------

dailyRouter.get('/', ah(async (req, res) => {
  const date = today();
  const { rows } = await query(
    'SELECT game, finished FROM daily_progress WHERE user_id=$1 AND play_date=$2 AND game = ANY($3)',
    [req.user.id, date, DAILY_GAMES]);
  const games = {};
  for (const g of DAILY_GAMES) {
    const row = rows.find((r) => r.game === g);
    games[g] = !row ? 'new' : row.finished ? 'done' : 'in_progress';
  }
  res.json({ date, games });
}));

// ---------- Lexicon ----------

function lexiconResult(guesses, answer) {
  const view = lexiconView(guesses, answer);
  const score = lexiconScore(view.won, guesses.length);
  return {
    game: 'lexicon', score, won: view.won, xp: lexiconXp(view.won, score),
    data: { guesses: guesses.length, marks: view.guesses.map((g) => g.marks) },
    achievements: view.won && guesses.length <= 2 ? ['lexicon_genius'] : [],
  };
}

function lexiconPayload(date, state, progress) {
  const guesses = state?.guesses || [];
  const answer = answerFor(date);
  const view = lexiconView(guesses, answer);
  return {
    date, length: WORD_LENGTH, maxGuesses: MAX_GUESSES, ...view,
    hints: hintsFor(answer, guesses),
    ...(view.finished ? { answer, score: lexiconScore(view.won, guesses.length), clue: clueFor(answer) } : {}),
    ...(progress ? { progress } : {}),
  };
}

dailyRouter.get('/lexicon', ah(async (req, res) => {
  const date = today();
  const row = await readRow(req.user.id, 'lexicon', date);
  let progress = row?.state?.progress;
  if (row?.finished && row.state.record === 'pending') {
    progress = await settle(req.user.id, 'lexicon', date, lexiconResult(row.state.guesses, answerFor(date)));
  }
  res.json(lexiconPayload(date, row?.state, progress));
}));

dailyRouter.post('/lexicon/guess', ah(async (req, res) => {
  const date = today();
  const word = normalizeWord(req.body?.word);
  if (!/^[a-z]{5}$/.test(word)) throw new HttpError(400, 'Guess must be 5 letters');
  if (!isValidGuess(word)) throw new HttpError(400, 'Not in word list');
  const answer = answerFor(date);

  const { state, finishedNow } = await withDailyRow(req.user.id, 'lexicon', date, async (row, save) => {
    if (row.finished) throw new HttpError(409, "You've already finished today's Lexicon");
    const guesses = [...(row.state.guesses || [])];
    if (guesses.includes(word)) throw new HttpError(400, 'Already guessed');
    guesses.push(word);
    const { finished } = lexiconView(guesses, answer);
    const next = { ...row.state, guesses, ...(finished ? { record: 'pending' } : {}) };
    await save(next, finished);
    return { state: next, finishedNow: finished };
  });

  const progress = finishedNow
    ? await settle(req.user.id, 'lexicon', date, lexiconResult(state.guesses, answer))
    : undefined;
  res.json(lexiconPayload(date, state, progress));
}));

// ---------- Target ----------

function targetPayload(date, row, progress) {
  const { numbers, target, solution } = targetFor(date);
  const finished = !!row?.finished;
  return {
    date, numbers, target, finished,
    ...(finished ? { result: row.state.result, solution } : {}),
    ...(progress ? { progress } : {}),
  };
}

const targetResult = (result) => ({
  game: 'target', score: result.score, won: result.distance === 0, xp: targetXp(result.score),
  data: result, achievements: result.distance === 0 ? ['target_exact'] : [],
});

dailyRouter.get('/target', ah(async (req, res) => {
  const date = today();
  const row = await readRow(req.user.id, 'target', date);
  let progress = row?.state?.progress;
  if (row?.finished && row.state.record === 'pending') {
    progress = await settle(req.user.id, 'target', date, targetResult(row.state.result));
  }
  res.json(targetPayload(date, row, progress));
}));

dailyRouter.post('/target/submit', ah(async (req, res) => {
  const date = today();
  const expression = req.body?.expression;
  if (typeof expression !== 'string' || !expression.trim()) throw new HttpError(400, 'Expression required');
  if (expression.length > MAX_EXPRESSION_LENGTH) throw new HttpError(400, 'Expression is too long');
  // One submission per day: report that before judging a (possibly malformed) second attempt.
  if ((await readRow(req.user.id, 'target', date))?.finished) {
    throw new HttpError(409, "You've already submitted today's Target");
  }
  const { numbers, target } = targetFor(date);
  let scored;
  try {
    scored = scoreExpression(expression, numbers, target);
  } catch (e) {
    if (e instanceof ExprError) throw new HttpError(400, e.message);
    throw e;
  }
  const result = { expression: expression.trim(), ...scored };

  const row = await withDailyRow(req.user.id, 'target', date, async (r, save) => {
    if (r.finished) throw new HttpError(409, "You've already submitted today's Target");
    const state = { ...r.state, result, record: 'pending' };
    await save(state, true);
    return { state, finished: true };
  });
  const progress = await settle(req.user.id, 'target', date, targetResult(result));
  res.json(targetPayload(date, row, progress));
}));

// ---------- Flip ----------

function flipPayload(date, row, progress) {
  const { grid, par } = flipFor(date);
  const finished = !!row?.finished;
  return {
    date, grid, par, finished,
    ...(finished ? { result: row.state.result } : {}),
    ...(progress ? { progress } : {}),
  };
}

const flipResult = (result) => ({
  game: 'flip', score: result.score, won: true, xp: flipXp(result.score),
  data: result, achievements: result.moves <= result.par ? ['flip_par'] : [],
});

dailyRouter.get('/flip', ah(async (req, res) => {
  const date = today();
  const row = await readRow(req.user.id, 'flip', date);
  let progress = row?.state?.progress;
  if (row?.finished && row.state.record === 'pending') {
    progress = await settle(req.user.id, 'flip', date, flipResult(row.state.result));
  }
  res.json(flipPayload(date, row, progress));
}));

dailyRouter.post('/flip/submit', ah(async (req, res) => {
  const date = today();
  const moves = req.body?.moves;
  if (!validMoves(moves)) throw new HttpError(400, 'moves must be a non-empty list of cell indexes 0–24');
  const { grid, par } = flipFor(date);
  if (!isSolved(applyMoves(grid, moves))) throw new HttpError(400, "Those moves don't solve the board");
  const result = { moves: moves.length, par, score: flipScore(moves.length, par) };

  const row = await withDailyRow(req.user.id, 'flip', date, async (r, save) => {
    if (r.finished) throw new HttpError(409, "You've already solved today's Flip");
    const state = { ...r.state, result, record: 'pending' };
    await save(state, true);
    return { state, finished: true };
  });
  const progress = await settle(req.user.id, 'flip', date, flipResult(result));
  res.json(flipPayload(date, row, progress));
}));

// ---------- Reflex ----------

const locks = new Map();
/** Minimal in-process mutex keyed by string. */
async function withUserLock(key, fn) {
  const prev = locks.get(key) || Promise.resolve();
  let release;
  const mine = new Promise((r) => { release = r; });
  const chain = prev.then(() => mine);
  locks.set(key, chain);
  await prev;
  try { return await fn(); } finally {
    release();
    if (locks.get(key) === chain) locks.delete(key);
  }
}

async function reflexStats(userId, date) {
  const { rows: [r] } = await query(
    `SELECT coalesce(max(score),0)::int AS best, count(*)::int AS plays,
            extract(epoch FROM now() - max(created_at)) * 1000 AS since_ms
     FROM game_results WHERE user_id=$1 AND game='reflex' AND play_date=$2`, [userId, date]);
  return r;
}

dailyRouter.get('/reflex', ah(async (req, res) => {
  const date = today();
  const { best, plays } = await reflexStats(req.user.id, date);
  res.json({ date, best, plays });
}));

dailyRouter.post('/reflex/submit', ah(async (req, res) => {
  const err = validateReflex(req.body);
  if (err) throw new HttpError(400, err);
  const { score, hits, misses, durationMs } = req.body;
  const userId = req.user.id;
  const date = today();

  // Serialise a user's submissions (single instance) so simultaneous duplicates can't slip
  // past the rate check, without holding a DB connection while recordResult runs.
  const progress = await withUserLock(`reflex:${userId}`, async () => {
    const { rows: [last] } = await query(
      `SELECT extract(epoch FROM now() - max(created_at)) * 1000 AS since_ms
       FROM game_results WHERE user_id=$1 AND game='reflex'`, [userId]);
    if (last.since_ms != null && Number(last.since_ms) < reflexMinGapMs({ durationMs, misses })) {
      throw new HttpError(429, 'Your previous run was submitted moments ago, so this one was not counted');
    }
    return recordResult(userId, {
      game: 'reflex', score, won: score >= 40, xp: reflexXp(score),
      data: { hits, misses, durationMs: Math.round(durationMs) },
      achievements: score >= 40 ? ['reflex_40'] : [],
    });
  });
  const { best, plays } = await reflexStats(userId, date);
  res.json({ progress, best, plays, score });
}));
