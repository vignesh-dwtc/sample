// Detective case lifecycle. Dependencies are injected so the logic is testable without a DB or API key.
import { BUILTIN_CASES, builtinSecret, getBuiltin } from './builtin.js';
import { respond } from './responder.js';
import { deflection } from './ai.js';
import { HttpError, today } from '../util.js';

export const MAX_QUESTIONS = 15;
export const MAX_QUESTION_LENGTH = 300;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const dailyAiLimit = () => {
  const n = Number(process.env.DETECTIVE_DAILY_LIMIT);
  return Number.isFinite(n) && n >= 0 ? n : 3;
};

export const scoreFor = (correct, questionsLeft) => (correct ? 100 + questionsLeft * 10 : 0);
export const xpFor = (correct, questionsLeft) => (correct ? 80 + questionsLeft * 5 : 20);
export function achievementsFor(correct, questionsUsed) {
  if (!correct) return [];
  return questionsUsed <= 6 ? ['detective_solve', 'detective_sharp'] : ['detective_solve'];
}

/** The only shape of a case that ever leaves the server while it is open. Allow-list, never spread. */
export function toPublicCase(row) {
  const s = row.secret;
  return {
    id: row.id,
    source: row.source,
    title: s.title,
    setting: s.setting,
    victim: s.victim,
    intro: s.intro,
    clues: [...s.clues],
    suspects: s.suspects.map(({ id, name, role, emoji, description }) => ({ id, name, role, emoji, description })),
    questionsLeft: Math.max(0, MAX_QUESTIONS - row.questions_used),
    transcripts: row.transcripts || {},
    status: row.status,
  };
}

/** Choose the built-in case this user has seen least (ties: least recently), so all three rotate. */
export function pickBuiltinKey(history) {
  const stats = new Map(BUILTIN_CASES.map((c, i) => [c.key, { count: 0, last: -1, order: i }]));
  history.forEach((key, idx) => { // history: newest first
    const st = stats.get(key);
    if (st) { st.count++; if (st.last === -1) st.last = idx; }
  });
  const ranked = [...stats.entries()].sort(([, a], [, b]) =>
    a.count - b.count || (b.last === -1 ? Infinity : b.last) - (a.last === -1 ? Infinity : a.last) || a.order - b.order);
  return ranked[0][0];
}

/**
 * @param {object} deps
 * @param {(text:string, params?:any[]) => Promise<{rows:any[]}>} deps.query
 * @param {(userId:string, r:object) => Promise<object>} deps.recordResult
 * @param {ReturnType<import('./ai.js').createDetectiveAI>} deps.ai
 */
export function createDetectiveService({ query, recordResult, ai }) {
  async function loadOpen(userId, caseId) {
    if (!UUID_RE.test(String(caseId))) throw new HttpError(404, 'Case not found');
    const { rows } = await query('SELECT * FROM detective_cases WHERE id=$1 AND user_id=$2', [caseId, userId]);
    const row = rows[0];
    if (!row) throw new HttpError(404, 'Case not found');
    if (row.status !== 'open') throw new HttpError(409, 'This case is already closed');
    return row;
  }

  async function aiCasesToday(userId) {
    const { rows } = await query(
      `SELECT count(*)::int AS n FROM detective_cases
       WHERE user_id=$1 AND source='ai' AND (created_at AT TIME ZONE 'UTC')::date = $2::date`,
      [userId, today()]
    );
    return rows[0].n;
  }

  return {
    async newCase(userId) {
      let source = 'builtin';
      let secret = null;
      if (ai?.enabled && (await aiCasesToday(userId)) < dailyAiLimit()) {
        secret = await ai.generateCase();
        if (secret) source = 'ai';
      }
      if (!secret) {
        const { rows } = await query(
          `SELECT secret->>'builtinKey' AS key FROM detective_cases
           WHERE user_id=$1 AND source='builtin' ORDER BY created_at DESC LIMIT 20`,
          [userId]
        );
        secret = builtinSecret(getBuiltin(pickBuiltinKey(rows.map((r) => r.key))));
      }
      // Starting a new case abandons any case still open (counts as unsolved, no reward).
      await query(`UPDATE detective_cases SET status='failed' WHERE user_id=$1 AND status='open'`, [userId]);
      const { rows } = await query(
        `INSERT INTO detective_cases (user_id, source, secret) VALUES ($1, $2, $3) RETURNING *`,
        [userId, source, secret]
      );
      return toPublicCase(rows[0]);
    },

    async current(userId) {
      const { rows } = await query(
        `SELECT * FROM detective_cases WHERE user_id=$1 AND status='open' ORDER BY created_at DESC LIMIT 1`,
        [userId]
      );
      return rows[0] ? toPublicCase(rows[0]) : null;
    },

    async ask(userId, caseId, { suspectId, question } = {}) {
      const q = typeof question === 'string' ? question.trim() : '';
      if (!q) throw new HttpError(400, 'Ask a question');
      if (q.length > MAX_QUESTION_LENGTH) throw new HttpError(400, `Questions are limited to ${MAX_QUESTION_LENGTH} characters`);
      const row = await loadOpen(userId, caseId);
      const suspect = row.secret.suspects.find((s) => s.id === suspectId);
      if (!suspect) throw new HttpError(400, 'Unknown suspect');

      // Reserve a question atomically so concurrent requests can't exceed the limit.
      const { rows: reserved } = await query(
        `UPDATE detective_cases SET questions_used = questions_used + 1
         WHERE id=$1 AND user_id=$2 AND status='open' AND questions_used < $3
         RETURNING questions_used, transcripts`,
        [row.id, userId, MAX_QUESTIONS]
      );
      if (!reserved[0]) throw new HttpError(409, 'No questions left — time to make your accusation');
      const transcript = reserved[0].transcripts?.[suspectId] || [];

      let reply;
      if (row.source === 'builtin') {
        const data = getBuiltin(row.secret.builtinKey);
        reply = data ? respond(data, suspectId, q, transcript) : deflection(transcript.length);
      } else {
        reply = ai ? await ai.askSuspect(row.secret, suspectId, transcript, q) : deflection(transcript.length);
      }

      const entries = [{ role: 'user', content: q }, { role: 'assistant', content: reply }];
      await query(
        `UPDATE detective_cases
         SET transcripts = jsonb_set(transcripts, ARRAY[$2::text], COALESCE(transcripts->$2, '[]'::jsonb) || $3::jsonb)
         WHERE id=$1`,
        [row.id, suspectId, JSON.stringify(entries)]
      );
      return { reply, questionsLeft: Math.max(0, MAX_QUESTIONS - reserved[0].questions_used) };
    },

    async accuse(userId, caseId, { suspectId } = {}) {
      const row = await loadOpen(userId, caseId);
      if (!row.secret.suspects.some((s) => s.id === suspectId)) throw new HttpError(400, 'Unknown suspect');
      // Close atomically: only one request can win, so recordResult runs exactly once.
      const { rows } = await query(
        `UPDATE detective_cases
         SET status = CASE WHEN secret->>'culpritId' = $3 THEN 'solved' ELSE 'failed' END
         WHERE id=$1 AND user_id=$2 AND status='open'
         RETURNING status, questions_used, secret`,
        [row.id, userId, suspectId]
      );
      if (!rows[0]) throw new HttpError(409, 'This case is already closed');
      const { status, questions_used: used, secret } = rows[0];
      const correct = status === 'solved';
      const questionsLeft = Math.max(0, MAX_QUESTIONS - used);
      let progress;
      try {
        progress = await recordResult(userId, {
          game: 'detective',
          score: scoreFor(correct, questionsLeft),
          won: correct,
          xp: xpFor(correct, questionsLeft),
          data: { caseId: row.id, source: row.source, title: secret.title, accused: suspectId, questionsUsed: used },
          achievements: achievementsFor(correct, used),
        });
      } catch (err) {
        // recordResult rolled back: reopen the case so the player can retry instead of losing it unrewarded.
        await query(`UPDATE detective_cases SET status='open' WHERE id=$1 AND user_id=$2 AND status=$3`, [row.id, userId, status])
          .catch(() => {});
        throw err;
      }
      return {
        correct,
        solution: {
          culpritId: secret.culpritId,
          motive: secret.motive,
          method: secret.method,
          explanation: secret.explanation,
        },
        score: scoreFor(correct, questionsLeft),
        questionsLeft,
        progress,
      };
    },
  };
}
