// End-to-end: real HTTP server + real `ws` clients. DB access is injected away.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import WebSocket from 'ws';

process.env.DATABASE_URL ||= 'postgresql://playnest:playnest@localhost:5432/playnest';
const { attachParty } = await import('../src/party/index.js');
const { signToken } = await import('../src/auth.js');
const { QUESTIONS } = await import('../src/party/questions.js');

const USERS = {};
for (const name of ['ann', 'ben', 'cat', 'dan']) USERS[`id-${name}`] = { id: `id-${name}`, username: name, avatar: '🐸' };
const recorded = [];
let server; let port; let party;

before(async () => {
  server = http.createServer((_q, r) => r.end('ok'));
  party = attachParty(server, {
    getUser: async (id) => USERS[id] || null,
    recordResult: async (userId, r) => { recorded.push({ userId, ...r }); return { xpGained: r.xp, coinsGained: 1, achievements: [] }; },
    heartbeatMs: 150,
    config: { startDelayMs: 50, questionMs: 800, revealMs: 100, triviaRounds: 3, reactionRounds: 2, goMinMs: 100, goMaxMs: 200, reactionWindowMs: 400, reactionPauseMs: 100 },
  });
  await new Promise((r) => server.listen(0, r));
  port = server.address().port;
});

after(async () => {
  server.closeAllConnections?.();
  await new Promise((r) => server.close(r));
});

/** Connect a client; resolves once the server says hello. */
function connect(userId, { token = signToken({ id: userId }), path = '/ws', opts } = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}${path}?token=${encodeURIComponent(token)}`, opts);
    const c = { ws, msgs: [], waiters: [] };
    c.send = (m) => ws.send(JSON.stringify(m));
    c.next = (type, pred = () => true, timeout = 3000) => {
      const idx = c.msgs.findIndex((m) => m.type === type && pred(m));
      if (idx >= 0) return Promise.resolve(c.msgs.splice(idx, 1)[0]);
      return new Promise((res, rej) => {
        const w = { type, pred, res };
        c.waiters.push(w);
        setTimeout(() => { c.waiters = c.waiters.filter((x) => x !== w); rej(new Error(`timeout waiting for ${type}`)); }, timeout);
      });
    };
    ws.on('message', (d) => {
      const m = JSON.parse(d.toString());
      const w = c.waiters.find((x) => x.type === m.type && x.pred(m));
      if (w) { c.waiters = c.waiters.filter((x) => x !== w); w.res(m); } else c.msgs.push(m);
    });
    ws.on('unexpected-response', (_req, res) => reject(new Error(`HTTP ${res.statusCode}`)));
    ws.on('error', reject);
    c.next('hello').then(() => resolve(c), reject);
  });
}

test('rejects bad tokens, unknown users and other paths', async () => {
  await assert.rejects(connect('id-ann', { token: 'nope' }), /401/);
  await assert.rejects(connect('id-ghost'), /401/);
  await assert.rejects(connect('id-ann', { path: '/other' }), /404/);
});

test('trivia over real sockets with three players', async () => {
  const [a, b, c] = await Promise.all(['id-ann', 'id-ben', 'id-cat'].map((id) => connect(id)));
  a.send({ type: 'create', game: 'trivia' });
  const { room } = await a.next('room');
  b.send({ type: 'join', code: room.code });
  c.send({ type: 'join', code: room.code });
  await a.next('room', (m) => m.room.players.length === 3);
  b.send({ type: 'start' });
  assert.match((await b.next('error')).message, /Only the host/);
  a.send({ type: 'start' });
  for (let round = 1; round <= 3; round++) {
    const qs = await Promise.all([a, b, c].map((x) => x.next('question', (m) => m.round === round)));
    const q = qs[0];
    assert.ok(!('correct' in q) && !('answer' in q));
    const src = QUESTIONS.find((x) => x.text === q.text);
    const right = q.choices.indexOf(src.choices[src.answer]);
    a.send({ type: 'answer', choice: right });
    a.send({ type: 'answer', choice: (right + 1) % 4 });
    b.send({ type: 'answer', choice: (right + 2) % 4 });
    if (round < 3) c.send({ type: 'answer', choice: right }); // round 3: c times out
    const r = await a.next('reveal', (m) => m.round === round);
    assert.equal(r.correct, right);
    assert.equal(r.answers['id-ann'], right);
    assert.ok(r.gained['id-ann'] > 500);
    assert.equal(r.gained['id-ben'], 0);
  }
  const fin = await b.next('final');
  assert.equal(fin.standings[0].id, 'id-ann');
  assert.equal(fin.standings.length, 3);
  const prog = await a.next('progress');
  assert.equal(prog.progress.xpGained, 75);
  await b.next('progress');
  const ann = recorded.find((r) => r.userId === 'id-ann' && r.game === 'party_trivia');
  assert.ok(ann.won && ann.achievements.includes('party_win') && ann.achievements.includes('party_host'));
  for (const x of [a, b, c]) x.ws.close();
});

test('reaction over real sockets, false start and reconnect keeps score', async () => {
  const a = await connect('id-ann');
  let d = await connect('id-dan');
  a.send({ type: 'create', game: 'reaction' });
  const { room } = await a.next('room');
  d.send({ type: 'join', code: room.code });
  await a.next('room', (m) => m.room.players.length === 2);
  a.send({ type: 'start' });

  await d.next('wait', (m) => m.round === 1);
  d.send({ type: 'tap' }); // false start
  assert.equal((await d.next('tapped')).falseStart, true);
  const go = await a.next('go', (m) => m.round === 1);
  assert.ok(go.at > 0);
  a.send({ type: 'tap' });
  const end = await a.next('roundEnd', (m) => m.round === 1);
  assert.deepEqual(end.results.map((r) => [r.id, r.points]), [['id-ann', 1000], ['id-dan', -250]]);

  // dan drops and reconnects during round 2; score is kept
  d.ws.terminate();
  await a.next('room', (m) => m.room.players.some((p) => p.id === 'id-dan' && !p.connected));
  d = await connect('id-dan');
  d.send({ type: 'join', code: room.code });
  const back = await d.next('room', (m) => m.room.players.find((p) => p.id === 'id-dan').connected);
  assert.equal(back.room.players.find((p) => p.id === 'id-dan').score, -250);

  const fin = await a.next('final', () => true, 5000);
  assert.equal(fin.standings[0].id, 'id-ann');
  a.ws.close(); d.ws.close();
});

test('heartbeat terminates sockets that stop answering pings', async () => {
  const z = await connect('id-cat', { opts: { autoPong: false } });
  z.send({ type: 'create', game: 'trivia' });
  await z.next('room');
  const closed = await new Promise((r) => z.ws.on('close', (code) => r(code)));
  assert.equal(closed, 1006); // terminated by server
  const room = [...party.hub.rooms.values()].find((x) => x.players.has('id-cat'));
  for (let i = 0; i < 50 && room.players.get('id-cat').connected; i++) await new Promise((r) => setTimeout(r, 10));
  assert.equal(room.players.get('id-cat').connected, false, 'seat enters reconnect grace');
});

test('client ping gets pong', async () => {
  const a = await connect('id-ben');
  a.send({ type: 'ping' });
  const p = await a.next('pong');
  assert.ok(Math.abs(p.now - Date.now()) < 1000);
  a.ws.close();
});
