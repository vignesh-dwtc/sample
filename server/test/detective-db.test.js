// Integration tests for the detective service against the local Postgres (skipped if unreachable).
// Uses an injected fake AI so no API key / network is needed.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

process.env.DATABASE_URL ||= 'postgresql://playnest:playnest@localhost:5432/playnest';

let db; let progress; let svcMod; let builtin;
let reachable = false;
const users = [];

before(async () => {
  const probe = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 1500 });
  try { await probe.connect(); await probe.end(); reachable = true; } catch { return; }
  db = await import('../src/db.js');
  await db.migrate();
  progress = await import('../src/progress.js');
  svcMod = await import('../src/detective/service.js');
  builtin = await import('../src/detective/builtin.js');
});

after(async () => {
  if (!reachable) return;
  if (users.length) await db.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [users]);
  await db.pool.end();
});

async function newUser() {
  const { rows } = await db.query(
    `INSERT INTO users (username) VALUES ($1) RETURNING id`,
    [`dtest_${Math.random().toString(36).slice(2, 12)}`]
  );
  users.push(rows[0].id);
  return rows[0].id;
}

const noAI = { enabled: false };
const service = (ai = noAI, recordResult) =>
  svcMod.createDetectiveService({ query: db.query, recordResult: recordResult || progress.recordResult, ai });

const FORBIDDEN = ['culpritId', 'motive', 'method', 'explanation', 'secret', 'knowledge', 'builtinKey'];
const assertNoLeak = (obj, c) => {
  const json = JSON.stringify(obj);
  for (const f of FORBIDDEN) assert.ok(!json.includes(`"${f}"`), `leaks ${f}`);
  if (c) for (const t of [c.motive, c.method, c.explanation]) assert.ok(!json.includes(t), 'leaks solution text');
};

test('full built-in game: new → ask → accuse correctly with achievements', async (t) => {
  if (!reachable) return t.skip('Postgres not reachable');
  const uid = await newUser();
  const svc = service();
  assert.equal(await svc.current(uid), null);

  const pub = await svc.newCase(uid);
  assert.equal(pub.source, 'builtin');
  assert.equal(pub.status, 'open');
  assert.equal(pub.questionsLeft, 15);
  assert.equal(pub.suspects.length, 4);
  const c = builtin.BUILTIN_CASES.find((x) => x.title === pub.title);
  assertNoLeak(pub, c);
  assert.deepEqual(await svc.current(uid), pub);

  const sid = pub.suspects[0].id;
  const r1 = await svc.ask(uid, pub.id, { suspectId: sid, question: 'Where were you tonight?' });
  assert.equal(r1.questionsLeft, 14);
  assert.ok(r1.reply.length > 10);
  assertNoLeak(r1, c);
  const r2 = await svc.ask(uid, pub.id, { suspectId: sid, question: '  Who do you think did it?  ' });
  assert.equal(r2.questionsLeft, 13);

  const cur = await svc.current(uid);
  assert.equal(cur.questionsLeft, 13);
  assert.deepEqual(cur.transcripts[sid].map((m) => m.role), ['user', 'assistant', 'user', 'assistant']);
  assert.equal(cur.transcripts[sid][2].content, 'Who do you think did it?');
  assertNoLeak(cur, c);

  const res = await svc.accuse(uid, pub.id, { suspectId: c.culpritId });
  assert.equal(res.correct, true);
  assert.equal(res.solution.culpritId, c.culpritId);
  assert.equal(res.solution.motive, c.motive);
  assert.equal(res.score, 100 + 13 * 10);
  assert.equal(res.progress.xpGained, 80 + 13 * 5);
  const codes = res.progress.achievements.map((a) => a.code);
  assert.ok(codes.includes('detective_solve'));
  assert.ok(codes.includes('detective_sharp'));

  const { rows } = await db.query(`SELECT game, score, won FROM game_results WHERE user_id=$1`, [uid]);
  assert.deepEqual(rows, [{ game: 'detective', score: 230, won: true }]);
  assert.equal(await svc.current(uid), null, 'closed case is no longer current');
  await assert.rejects(svc.ask(uid, pub.id, { suspectId: sid, question: 'Hi' }), { status: 409 });
  await assert.rejects(svc.accuse(uid, pub.id, { suspectId: sid }), { status: 409 });
});

test('wrong accusation, question limit, validation and ownership', async (t) => {
  if (!reachable) return t.skip('Postgres not reachable');
  const uid = await newUser();
  const other = await newUser();
  const svc = service();
  const pub = await svc.newCase(uid);
  const c = builtin.BUILTIN_CASES.find((x) => x.title === pub.title);
  const innocent = c.suspects.find((s) => s.id !== c.culpritId).id;

  await assert.rejects(svc.ask(uid, pub.id, { suspectId: innocent, question: '' }), { status: 400 });
  await assert.rejects(svc.ask(uid, pub.id, { suspectId: innocent, question: 'x'.repeat(301) }), { status: 400 });
  await assert.rejects(svc.ask(uid, pub.id, { suspectId: 'nobody', question: 'Hi' }), { status: 400 });
  await assert.rejects(svc.ask(uid, 'not-a-uuid', { suspectId: innocent, question: 'Hi' }), { status: 404 });
  await assert.rejects(svc.ask(other, pub.id, { suspectId: innocent, question: 'Hi' }), { status: 404 });
  await assert.rejects(svc.accuse(uid, pub.id, { suspectId: 'nobody' }), { status: 400 });

  // Fire 17 questions concurrently: exactly 15 succeed.
  const results = await Promise.allSettled(Array.from({ length: 17 }, (_, i) =>
    svc.ask(uid, pub.id, { suspectId: innocent, question: `Where were you? (${i})` })));
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 15);
  assert.ok(results.filter((r) => r.status === 'rejected').every((r) => r.reason.status === 409));
  const cur = await svc.current(uid);
  assert.equal(cur.questionsLeft, 0);
  assert.equal(cur.transcripts[innocent].length, 30, 'all concurrent transcript appends kept');

  // Concurrent accusations: recordResult runs exactly once.
  let recorded = 0;
  const svc2 = service(noAI, async (...args) => { recorded++; return progress.recordResult(...args); });
  const acc = await Promise.allSettled([1, 2, 3].map(() => svc2.accuse(uid, pub.id, { suspectId: innocent })));
  assert.equal(acc.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(recorded, 1);
  const res = acc.find((r) => r.status === 'fulfilled').value;
  assert.equal(res.correct, false);
  assert.equal(res.score, 0);
  assert.equal(res.progress.xpGained, 20);
  assert.ok(!res.progress.achievements.some((a) => a.code.startsWith('detective')));
});

test('built-in cases rotate and a new case abandons the open one', async (t) => {
  if (!reachable) return t.skip('Postgres not reachable');
  const uid = await newUser();
  const svc = service();
  const titles = [];
  for (let i = 0; i < 3; i++) titles.push((await svc.newCase(uid)).title);
  assert.equal(new Set(titles).size, 3, 'three different built-in cases in a row');
  const { rows } = await db.query(`SELECT status FROM detective_cases WHERE user_id=$1 ORDER BY created_at`, [uid]);
  assert.deepEqual(rows.map((r) => r.status), ['failed', 'failed', 'open']);
});

test('AI cases: generated when enabled, daily limit enforced, roleplay via injected AI', async (t) => {
  if (!reachable) return t.skip('Postgres not reachable');
  const uid = await newUser();
  const aiCase = {
    title: 'AI Case', setting: 'S', victim: 'V', intro: 'I', clues: ['a', 'b', 'c'],
    suspects: ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id.toUpperCase(), role: 'r', emoji: '🙂', description: 'd', personality: 'p', alibi: 'al', secret: 'SECRET-' + id, knowledge: 'k' })),
    culpritId: 'c', motive: 'AI-MOTIVE', method: 'AI-METHOD', explanation: 'AI-EXPLANATION',
  };
  const asked = [];
  const fakeAI = {
    enabled: true,
    generateCase: async () => structuredClone(aiCase),
    askSuspect: async (secret, suspectId, transcript, q) => { asked.push({ suspectId, transcript, q }); return `reply to ${q}`; },
  };
  const saved = process.env.DETECTIVE_DAILY_LIMIT;
  process.env.DETECTIVE_DAILY_LIMIT = '2';
  try {
    const svc = service(fakeAI);
    const a1 = await svc.newCase(uid);
    assert.equal(a1.source, 'ai');
    assert.equal(a1.title, 'AI Case');
    assertNoLeak(a1, aiCase);
    assert.ok(!JSON.stringify(a1).includes('SECRET-'));
    const r = await svc.ask(uid, a1.id, { suspectId: 'b', question: 'Q1' });
    assert.equal(r.reply, 'reply to Q1');
    await svc.ask(uid, a1.id, { suspectId: 'b', question: 'Q2' });
    assert.deepEqual(asked[1].transcript, [{ role: 'user', content: 'Q1' }, { role: 'assistant', content: 'reply to Q1' }]);
    const res = await svc.accuse(uid, a1.id, { suspectId: 'c' });
    assert.equal(res.correct, true);
    assert.equal(res.solution.explanation, 'AI-EXPLANATION');

    assert.equal((await svc.newCase(uid)).source, 'ai');
    assert.equal((await svc.newCase(uid)).source, 'builtin', 'over the daily AI limit → built-in');

    // Generation failure falls back to a built-in case.
    const uid2 = await newUser();
    const failing = service({ ...fakeAI, generateCase: async () => null });
    assert.equal((await failing.newCase(uid2)).source, 'builtin');
  } finally {
    if (saved === undefined) delete process.env.DETECTIVE_DAILY_LIMIT; else process.env.DETECTIVE_DAILY_LIMIT = saved;
  }
});

test('a failed recordResult reopens the case so the accusation can be retried', async (t) => {
  if (!reachable) return t.skip('Postgres not reachable');
  const uid = await newUser();
  let calls = 0;
  const flaky = async (...args) => { calls++; if (calls === 1) throw new Error('db hiccup'); return progress.recordResult(...args); };
  const svc = service(noAI, flaky);
  const c = await svc.newCase(uid);
  const culpritId = builtin.getBuiltin((await db.query('SELECT secret FROM detective_cases WHERE id=$1', [c.id])).rows[0].secret.builtinKey).culpritId;
  await assert.rejects(svc.accuse(uid, c.id, { suspectId: culpritId }), /db hiccup/);
  assert.equal((await svc.current(uid))?.id, c.id, 'case is open again');
  const res = await svc.accuse(uid, c.id, { suspectId: culpritId });
  assert.equal(res.correct, true);
  assert.equal(calls, 2);
  await assert.rejects(svc.accuse(uid, c.id, { suspectId: culpritId }), (e) => e.status === 409);
});
