import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PartyHub } from '../src/party/engine.js';
import { createFakeClock } from '../src/party/clock.js';
import { seededRandom } from '../src/util.js';
import { QUESTIONS } from '../src/party/questions.js';

function setup({ config = {}, seed = 'engine' } = {}) {
  const clock = createFakeClock();
  const recorded = [];
  const closed = [];
  const hub = new PartyHub({
    clock,
    random: seededRandom(seed),
    send: (conn, msg) => conn.inbox.push(msg),
    close: (conn, code) => closed.push([conn.name, code]),
    recordResult: async (userId, r) => { recorded.push({ userId, ...r }); return { xpGained: r.xp, achievements: [] }; },
    config,
    log: () => {},
  });
  const users = {};
  const client = (name) => {
    const conn = { name, inbox: [] };
    const user = { id: `u-${name}`, username: name, avatar: '🦊' };
    users[name] = user;
    hub.connect(conn, user);
    return {
      conn, user, id: user.id,
      send: (m) => hub.handle(conn, JSON.stringify(m)),
      drop: () => hub.disconnect(conn),
      all: (type) => conn.inbox.filter((m) => m.type === type),
      last: (type) => conn.inbox.filter((m) => !type || m.type === type).at(-1),
      clear: () => { conn.inbox.length = 0; },
    };
  };
  const flush = () => new Promise((r) => setImmediate(r));
  return { hub, clock, client, recorded, closed, flush };
}

function correctIndexFor(question) {
  const src = QUESTIONS.find((q) => q.text === question.text);
  return question.choices.indexOf(src.choices[src.answer]);
}

test('create, join, room state broadcast, code format', () => {
  const { hub, client } = setup();
  const a = client('alice');
  a.send({ type: 'create', game: 'trivia' });
  const room = a.last('room').room;
  assert.match(room.code, /^[A-HJ-NP-Z]{4}$/);
  assert.equal(room.hostId, a.id);
  assert.equal(room.phase, 'lobby');
  assert.equal(room.totalRounds, 8);
  assert.deepEqual(room.players.map((p) => p.username), ['alice']);

  const b = client('bob');
  b.send({ type: 'join', code: room.code.toLowerCase() });
  assert.deepEqual(a.last('room').room.players.map((p) => p.id), [a.id, b.id]);
  assert.deepEqual(b.last('room').room.players.map((p) => p.connected), [true, true]);
  assert.equal(hub.rooms.size, 1);
});

test('join errors: unknown code, invalid game, full room', () => {
  const { client } = setup();
  const a = client('a');
  a.send({ type: 'join', code: 'ZZZZ' });
  assert.equal(a.last('error').code, 'not_found');
  a.send({ type: 'create', game: 'chess' });
  assert.match(a.last('error').message, /trivia or reaction/);
  a.send({ type: 'create', game: 'reaction' });
  const code = a.last('room').room.code;
  for (let i = 0; i < 11; i++) client(`p${i}`).send({ type: 'join', code });
  const late = client('late');
  late.send({ type: 'join', code });
  assert.equal(late.last('error').code, 'full');
  assert.equal(a.last('room').room.players.length, 12);
  a.send('garbage');
  a.send({ nope: 1 });
  a.send({ type: 'explode' });
  assert.equal(a.last('error').message, 'Unknown message type');
});

test('only the host can start; host handoff when host leaves', () => {
  const { client } = setup();
  const a = client('a'); const b = client('b'); const c = client('c');
  a.send({ type: 'create', game: 'trivia' });
  const code = a.last('room').room.code;
  b.send({ type: 'join', code }); c.send({ type: 'join', code });
  b.send({ type: 'start' });
  assert.match(b.last('error').message, /Only the host/);
  assert.equal(a.last('room').room.phase, 'lobby');
  a.send({ type: 'leave' });
  assert.equal(a.last().type, 'left');
  assert.equal(b.last('room').room.hostId, b.id);
  b.send({ type: 'start' });
  assert.equal(c.last('room').room.phase, 'playing');
});

test('trivia full game: never leaks answer, scoring, dedupe, early reveal, final + recordResult', async () => {
  const { client, clock, recorded, flush } = setup();
  const a = client('a'); const b = client('b');
  a.send({ type: 'create', game: 'trivia' });
  const code = a.last('room').room.code;
  b.send({ type: 'join', code });
  a.send({ type: 'start' });
  assert.equal(a.last('countdown').endsAt - clock.now(), 3000);
  a.send({ type: 'answer', choice: 0 }); // during countdown: ignored
  clock.advance(3000);

  let aTotal = 0;
  for (let round = 1; round <= 8; round++) {
    const q = a.last('question');
    assert.equal(q.round, round);
    assert.equal(q.choices.length, 4);
    assert.equal(q.endsAt - q.now, 12000);
    for (const k of Object.keys(q)) assert.ok(!/correct|answer/i.test(k), `leaked key ${k}`);
    assert.ok(!a.conn.inbox.some((m) => m.type === 'reveal' && m.round === round), 'reveal before answers');
    const right = correctIndexFor(q);
    const wrong = (right + 1) % 4;

    clock.advance(3000); // a answers correctly after 3s => 500 + 375
    a.send({ type: 'answer', choice: right });
    a.send({ type: 'answer', choice: wrong }); // duplicate ignored
    assert.equal(a.last('answered').choice, right);
    assert.deepEqual(b.last('answeredCount').ids, [a.id]);
    assert.equal(b.all('reveal').length, round - 1, 'no early reveal while b pending');

    if (round === 1) {
      b.send({ type: 'answer', choice: 7 }); // invalid ignored
      b.send({ type: 'answer', choice: 'x' });
      b.send({ type: 'answer', choice: wrong });
      const r = b.last('reveal'); // everyone answered => immediate reveal
      assert.equal(r.correct, right);
      assert.deepEqual(r.answers, { [a.id]: right, [b.id]: wrong });
      assert.deepEqual(r.gained, { [a.id]: 875, [b.id]: 0 });
    } else {
      clock.advance(9000); // time up for b
      const r = b.last('reveal');
      assert.equal(r.round, round);
      assert.deepEqual(r.answers, { [a.id]: right });
      assert.equal(r.gained[b.id], 0);
    }
    aTotal += 875;
    assert.equal(a.last('room').room.players.find((p) => p.id === a.id).score, aTotal);
    // late answer after reveal ignored
    b.send({ type: 'answer', choice: right });
    clock.advance(3999);
    assert.equal(a.all('question').length, round);
    clock.advance(1);
  }
  const fin = a.last('final');
  assert.deepEqual(fin.standings.map((s) => [s.id, s.score, s.rank]), [[a.id, 7000, 1], [b.id, 0, 2]]);
  assert.equal(a.last('room').room.phase, 'results');
  await flush();
  assert.equal(recorded.length, 2);
  const ra = recorded.find((r) => r.userId === a.id);
  assert.deepEqual(
    { game: ra.game, score: ra.score, won: ra.won, xp: ra.xp, ach: ra.achievements },
    { game: 'party_trivia', score: 7000, won: true, xp: 75, ach: ['party_win', 'party_host'] },
  );
  const rb = recorded.find((r) => r.userId === b.id);
  assert.deepEqual({ won: rb.won, xp: rb.xp, ach: rb.achievements }, { won: false, xp: 25, ach: [] });
  assert.equal(a.last('progress').progress.xpGained, 75);
  assert.equal(b.last('progress').progress.xpGained, 25);

  // again: host only, resets scores, back to lobby
  b.send({ type: 'again' });
  assert.match(b.last('error').message, /Only the host/);
  a.send({ type: 'again' });
  const room = b.last('room').room;
  assert.equal(room.phase, 'lobby');
  assert.equal(room.game, 'trivia');
  assert.ok(room.players.every((p) => p.score === 0));
});

test('reaction: false start, ordering, duplicate taps, early end, results', async () => {
  const { client, clock, recorded, flush } = setup({ seed: 'react' });
  const a = client('a'); const b = client('b'); const c = client('c');
  a.send({ type: 'create', game: 'reaction' });
  const code = a.last('room').room.code;
  b.send({ type: 'join', code }); c.send({ type: 'join', code });
  a.send({ type: 'start' });
  clock.advance(3000);
  assert.equal(a.last('wait').round, 1);

  // round 1: c false-starts, a then b tap after go
  c.send({ type: 'tap' });
  assert.equal(c.last('tapped').falseStart, true);
  c.send({ type: 'tap' }); // ignored
  assert.equal(c.all('tapped').length, 1);
  assert.equal(a.all('go').length, 0);
  clock.advance(1499);
  assert.equal(a.all('go').length, 0, 'go not before 1.5s');
  clock.advance(3001);
  const go = a.last('go');
  assert.ok(go && go.round === 1);
  clock.advance(180);
  a.send({ type: 'tap' });
  clock.advance(70);
  b.send({ type: 'tap' });
  b.send({ type: 'tap' });
  const end = a.last('roundEnd'); // all live players done => immediate end
  assert.equal(end.round, 1);
  const base = clock.now() - go.at - 250;
  assert.deepEqual(end.results.map((r) => [r.id, r.ms, r.points]), [[a.id, base + 180, 1000], [b.id, base + 250, 750], [c.id, null, -250]]);
  assert.equal(end.results[2].falseStart, true);

  // round 2: nobody taps -> ends 3s after go
  clock.advance(3000);
  assert.equal(a.last('wait').round, 2);
  clock.advance(1500);
  assert.equal(a.all('go').length, 1);
  clock.advance(3000);
  const go2 = a.last('go');
  assert.equal(go2.round, 2);
  clock.advance(go2.at + 2999 - clock.now());
  assert.equal(a.last('roundEnd').round, 1);
  clock.advance(1);
  assert.equal(a.last('roundEnd').round, 2);
  assert.ok(a.last('roundEnd').results.every((r) => r.points === 0));

  // round 3: everyone false-starts -> round ends immediately
  clock.advance(3000);
  for (const p of [a, b, c]) p.send({ type: 'tap' });
  assert.equal(a.last('roundEnd').round, 3);
  assert.ok(a.last('roundEnd').results.every((r) => r.points === -250));

  // rounds 4-5: b wins
  for (const round of [4, 5]) {
    clock.advance(3000);
    assert.equal(a.last('wait').round, round);
    clock.advance(4500);
    b.send({ type: 'tap' }); a.send({ type: 'tap' }); c.send({ type: 'tap' });
    assert.equal(a.last('roundEnd').round, round);
  }
  clock.advance(3000);
  const fin = a.last('final');
  // a: 1000 + 0 - 250 + 750 + 750 = 2250; b: 750 - 250 + 2000 = 2500; c: -250 -250 + 560*2 = 620
  assert.deepEqual(fin.standings.map((s) => [s.id, s.score]), [[b.id, 2500], [a.id, 2250], [c.id, 620]]);
  await flush();
  const rb = recorded.find((r) => r.userId === b.id);
  assert.equal(rb.game, 'party_reaction');
  assert.equal(rb.won, true);
  assert.deepEqual(rb.achievements, ['party_win']);
  assert.deepEqual(recorded.find((r) => r.userId === a.id).achievements, ['party_host']);
});

test('reconnect within 30s keeps seat and score and resyncs; after 30s seat is dropped', () => {
  const { client, clock, hub } = setup();
  const a = client('a'); const b = client('b');
  a.send({ type: 'create', game: 'trivia' });
  const code = a.last('room').room.code;
  b.send({ type: 'join', code });
  a.send({ type: 'start' });
  clock.advance(3000);
  const q = a.last('question');
  b.send({ type: 'answer', choice: correctIndexFor(q) });
  b.drop();
  // b's disconnect means everyone *connected* has... only a pending
  const seat = a.last('room').room.players.find((p) => p.id === b.id);
  assert.equal(seat.connected, false);
  assert.equal(a.all('reveal').length, 0);
  a.send({ type: 'answer', choice: 0 });
  assert.equal(a.all('reveal').length, 1);
  const bScore = a.last('room').room.players.find((p) => p.id === b.id).score;
  assert.ok(bScore >= 500);

  clock.advance(10_000);
  // b reconnects with a new socket, same user id
  const conn2 = { name: 'b2', inbox: [] };
  hub.connect(conn2, { id: b.id, username: 'b', avatar: '🐼' });
  hub.handle(conn2, JSON.stringify({ type: 'join', code }));
  const room = conn2.inbox.find((m) => m.type === 'room').room;
  const seat2 = room.players.find((p) => p.id === b.id);
  assert.equal(seat2.connected, true);
  assert.equal(seat2.score, bScore);
  assert.equal(seat2.avatar, '🐼');
  assert.ok(conn2.inbox.some((m) => m.type === 'question'), 'resynced current question');

  // a drops and does not return within 30s => seat removed, host handed to b
  a.drop();
  clock.advance(29_999);
  assert.equal(conn2.inbox.filter((m) => m.type === 'room').at(-1).room.players.length, 2);
  clock.advance(1);
  const after = conn2.inbox.filter((m) => m.type === 'room').at(-1).room;
  assert.deepEqual(after.players.map((p) => p.id), [b.id]);
  assert.equal(after.hostId, b.id);
});

test('new connection for same user replaces the old one', () => {
  const { client, hub, closed } = setup();
  const a = client('a');
  const conn2 = { name: 'a2', inbox: [] };
  hub.connect(conn2, a.user);
  assert.equal(a.last('error').code, 'replaced');
  assert.deepEqual(closed, [['a', 4001]]);
  a.drop(); // late close of the old socket must not affect the new one
  hub.handle(conn2, JSON.stringify({ type: 'create', game: 'reaction' }));
  assert.equal(conn2.inbox.at(-1).type, 'room');
});

test('room is removed when empty and after 30 minutes idle', () => {
  const { client, clock, hub } = setup();
  const a = client('a');
  a.send({ type: 'create', game: 'trivia' });
  a.send({ type: 'leave' });
  assert.equal(hub.rooms.size, 0);

  a.send({ type: 'create', game: 'trivia' });
  const code = a.last('room').room.code;
  clock.advance(29 * 60_000);
  hub.sweep();
  assert.equal(hub.rooms.size, 1);
  a.send({ type: 'join', code }); // real activity resets the idle timer
  clock.advance(29 * 60_000);
  hub.sweep();
  assert.equal(hub.rooms.size, 1);
  // Keep-alive pings alone (an abandoned open tab) must not keep the room alive.
  a.send({ type: 'ping' });
  assert.equal(a.last().type, 'pong');
  hub.sweep();
  assert.equal(hub.rooms.size, 1);
  clock.advance(60_000);
  hub.sweep();
  assert.equal(hub.rooms.size, 0);
  assert.equal(a.last('error').code, 'closed');
  a.send({ type: 'join', code });
  assert.equal(a.last('error').code, 'not_found');
});

test('disconnected room empties after grace and frees timers', () => {
  const { client, clock, hub } = setup();
  const a = client('a');
  a.send({ type: 'create', game: 'reaction' });
  a.send({ type: 'start' });
  clock.advance(3000);
  a.drop();
  clock.advance(30_000);
  assert.equal(hub.rooms.size, 0);
  assert.equal(clock.pending(), 0);
});

test('creating/joining another room leaves the previous one', () => {
  const { client, hub } = setup();
  const a = client('a'); const b = client('b');
  a.send({ type: 'create', game: 'trivia' });
  const code1 = a.last('room').room.code;
  b.send({ type: 'join', code: code1 });
  b.send({ type: 'create', game: 'reaction' });
  assert.deepEqual(a.last('room').room.players.map((p) => p.id), [a.id]);
  assert.equal(hub.rooms.size, 2);
});

test('late joiner mid-game receives the current state', () => {
  const { client, clock } = setup();
  const a = client('a');
  a.send({ type: 'create', game: 'trivia' });
  const code = a.last('room').room.code;
  a.send({ type: 'start' });
  clock.advance(3000 + 2000);
  const b = client('b');
  b.send({ type: 'join', code });
  assert.equal(b.last('room').room.phase, 'playing');
  const q = b.last('question');
  assert.equal(q.round, 1);
  assert.equal(q.endsAt - q.now, 10_000);
});

test('prototype keys are not games and never throw (would crash the ws handler)', () => {
  const { client, hub } = setup();
  const a = client('a');
  for (const game of ['toString', '__proto__', 'constructor', 'hasOwnProperty', 42, null]) {
    assert.doesNotThrow(() => a.send({ type: 'create', game }));
    assert.match(a.last('error').message, /trivia or reaction/);
  }
  assert.equal(hub.rooms.size, 0);
});

test('reaction: a player who tapped then left does not push others down the order', () => {
  const { client, clock } = setup({ seed: 'react' });
  const a = client('a'); const b = client('b'); const c = client('c');
  a.send({ type: 'create', game: 'reaction' });
  const code = a.last('room').room.code;
  b.send({ type: 'join', code }); c.send({ type: 'join', code });
  a.send({ type: 'start' });
  clock.advance(3000 + 4500);
  assert.ok(a.last('go'));
  c.send({ type: 'tap' });
  c.send({ type: 'leave' });
  clock.advance(100);
  a.send({ type: 'tap' });
  b.send({ type: 'tap' });
  const end = a.last('roundEnd');
  assert.deepEqual(end.results.map((r) => [r.id, r.points]), [[a.id, 1000], [b.id, 750]]);
});
