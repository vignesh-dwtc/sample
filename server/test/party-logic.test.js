import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUESTIONS } from '../src/party/questions.js';
import {
  makeCode, normalizeCode, CODE_RE, shuffle, pickQuestions, triviaPoints, reactionPoints,
  goDelay, standings, partyReward,
} from '../src/party/logic.js';
import { seededRandom } from '../src/util.js';

test('question bank: >= 60 well-formed, unique questions across varied categories', () => {
  assert.ok(QUESTIONS.length >= 60, `only ${QUESTIONS.length} questions`);
  const texts = new Set();
  for (const q of QUESTIONS) {
    assert.equal(q.choices.length, 4, q.text);
    assert.equal(new Set(q.choices).size, 4, `duplicate choices: ${q.text}`);
    assert.ok(q.choices.every((c) => typeof c === 'string' && c.length > 0 && c.length <= 40), q.text);
    assert.ok(q.text.length > 10 && q.text.length < 120, q.text);
    assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < 4);
    assert.ok(!texts.has(q.text), `duplicate question: ${q.text}`);
    texts.add(q.text);
  }
  assert.ok(new Set(QUESTIONS.map((q) => q.category)).size >= 8);
});

test('room codes: 4 letters without I or O', () => {
  const rnd = seededRandom('codes');
  for (let i = 0; i < 2000; i++) {
    const c = makeCode(rnd);
    assert.match(c, CODE_RE);
    assert.ok(!/[IO]/.test(c));
  }
  assert.equal(normalizeCode(' abcd '), 'ABCD');
  assert.equal(normalizeCode('ABIO'), null);
  assert.equal(normalizeCode('ABC'), null);
  assert.equal(normalizeCode(null), null);
  assert.equal(normalizeCode({}), null);
});

test('shuffle is a permutation and does not mutate', () => {
  const a = [1, 2, 3, 4, 5, 6];
  const s = shuffle(a, seededRandom('x'));
  assert.deepEqual([...s].sort(), a);
  assert.deepEqual(a, [1, 2, 3, 4, 5, 6]);
});

test('pickQuestions: distinct, correct index tracks the right answer, no repeated adjacent categories', () => {
  const rnd = seededRandom('pick');
  for (let run = 0; run < 50; run++) {
    const qs = pickQuestions(QUESTIONS, 8, rnd);
    assert.equal(qs.length, 8);
    assert.equal(new Set(qs.map((q) => q.id)).size, 8);
    for (let i = 0; i < qs.length; i++) {
      const src = QUESTIONS[qs[i].id];
      assert.equal(qs[i].choices[qs[i].correct], src.choices[src.answer]);
      assert.deepEqual([...qs[i].choices].sort(), [...src.choices].sort());
      if (i) assert.notEqual(qs[i].category, qs[i - 1].category);
    }
  }
  // correct answer position is spread out
  const pos = [0, 0, 0, 0];
  for (let i = 0; i < 200; i++) for (const q of pickQuestions(QUESTIONS, 8, rnd)) pos[q.correct]++;
  assert.ok(pos.every((n) => n > 250), pos.join(','));
});

test('triviaPoints: 500 + speed bonus', () => {
  assert.equal(triviaPoints(false, 0, 0, 12000), 0);
  assert.equal(triviaPoints(true, 0, 0, 12000), 1000);
  assert.equal(triviaPoints(true, 6000, 0, 12000), 750);
  assert.equal(triviaPoints(true, 12000, 0, 12000), 500);
  assert.equal(triviaPoints(true, 99999, 0, 12000), 500);
  assert.equal(triviaPoints(true, -5, 0, 12000), 1000);
});

test('reactionPoints decreases by order with a floor', () => {
  assert.equal(reactionPoints(0), 1000);
  assert.equal(reactionPoints(1), 750);
  assert.equal(reactionPoints(2), 560);
  for (let i = 1; i < 12; i++) assert.ok(reactionPoints(i) <= reactionPoints(i - 1));
  assert.equal(reactionPoints(30), 100);
});

test('goDelay within 1.5–4.5s', () => {
  const rnd = seededRandom('go');
  for (let i = 0; i < 500; i++) {
    const d = goDelay(rnd);
    assert.ok(d >= 1500 && d <= 4500, String(d));
  }
});

test('standings: sorted, ties share rank and keep join order', () => {
  const s = standings([
    { id: 'a', username: 'A', avatar: 'x', score: 100 },
    { id: 'b', username: 'B', avatar: 'x', score: 300 },
    { id: 'c', username: 'C', avatar: 'x', score: 300 },
    { id: 'd', username: 'D', avatar: 'x', score: 0 },
  ]);
  assert.deepEqual(s.map((x) => [x.id, x.rank]), [['b', 1], ['c', 1], ['a', 3], ['d', 4]]);
});

test('partyReward', () => {
  assert.deepEqual(partyReward({ rank: 1, score: 10, isHost: true }), { won: true, xp: 75, achievements: ['party_win', 'party_host'] });
  assert.deepEqual(partyReward({ rank: 1, score: 0, isHost: false }), { won: false, xp: 25, achievements: [] });
  assert.deepEqual(partyReward({ rank: 2, score: 900, isHost: false }), { won: false, xp: 25, achievements: [] });
});
