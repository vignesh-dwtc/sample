import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createRules, resolveShot, finalizeRound, pocketedCount,
  MAX_SCORE, UNCAPPED_MAX, POINTS_WHITE, POINTS_BLACK, POINTS_QUEEN, COVER_BONUS, FOUL_PENALTY,
} from './rules.js';

const shot = (o = {}) => ({ white: 0, black: 0, queen: false, striker: false, ...o });
const LEFT = { white: 5, black: 5 };

test('single coins score white 20, black 10; empty shots score 0', () => {
  const st = createRules();
  assert.equal(resolveShot(st, shot({ white: 1 }), LEFT).points, POINTS_WHITE);
  assert.equal(resolveShot(st, shot({ black: 1 }), LEFT).points, POINTS_BLACK);
  assert.equal(resolveShot(st, shot(), LEFT).points, 0);
  assert.equal(st.score, 30);
  assert.equal(st.white, 1); assert.equal(st.black, 1); assert.equal(st.shots, 3);
});

test('combo: two or more coins in one shot double that shot', () => {
  const st = createRules();
  const o = resolveShot(st, shot({ white: 1, black: 1 }), LEFT);
  assert.equal(o.combo, true); assert.equal(o.multiplier, 2);
  assert.equal(o.points, 60);
  const o3 = resolveShot(st, shot({ white: 2, black: 1 }), LEFT);
  assert.equal(o3.points, 100);
  assert.equal(st.bestCombo, 3); assert.equal(st.combos, 2);
});

test('queen covered on the next shot: 50 + 50 bonus, data.queen true', () => {
  const st = createRules();
  const a = resolveShot(st, shot({ queen: true }), LEFT);
  assert.equal(a.points, POINTS_QUEEN); assert.equal(st.queen, 'pending'); assert.equal(st.queenCovered, false);
  const b = resolveShot(st, shot({ black: 1 }), LEFT);
  assert.equal(b.covered, true);
  assert.equal(b.points, POINTS_BLACK + COVER_BONUS);
  assert.equal(st.queen, 'covered'); assert.equal(st.queenCovered, true);
  assert.equal(st.score, 110);
  assert.equal(pocketedCount(st), 2);
});

test('queen not covered: her 50 is taken back and she returns', () => {
  const st = createRules();
  resolveShot(st, shot({ white: 1 }), LEFT);
  resolveShot(st, shot({ queen: true }), LEFT);
  assert.equal(st.score, 70);
  const o = resolveShot(st, shot(), LEFT);
  assert.equal(o.queenReturned, true); assert.equal(o.points, -POINTS_QUEEN);
  assert.equal(st.queen, 'board'); assert.equal(st.score, 20);
  // she can be pocketed and covered again later
  resolveShot(st, shot({ queen: true }), LEFT);
  resolveShot(st, shot({ white: 1 }), LEFT);
  assert.equal(st.queenCovered, true);
  assert.equal(st.score, 20 + 50 + 20 + 50);
});

test('queen with another coin in the same shot is covered at once (and is a combo)', () => {
  const st = createRules();
  const o = resolveShot(st, shot({ queen: true, white: 1 }), LEFT);
  assert.equal(o.covered, true); assert.equal(o.combo, true);
  assert.equal(o.points, POINTS_WHITE * 2 + POINTS_QUEEN + COVER_BONUS);
});

test('queen as the very last coin counts as covered (nothing left to cover with)', () => {
  const st = createRules();
  const o = resolveShot(st, shot({ queen: true }), { white: 0, black: 0 });
  assert.equal(o.covered, true); assert.equal(st.queenCovered, true);
});

test('striker foul costs 10, never below zero; coins still count', () => {
  const st = createRules();
  assert.equal(resolveShot(st, shot({ striker: true }), LEFT).points, 0);
  assert.equal(st.score, 0); assert.equal(st.fouls, 1);
  resolveShot(st, shot({ white: 1 }), LEFT);
  const o = resolveShot(st, shot({ striker: true }), LEFT);
  assert.equal(o.foul, true); assert.equal(o.points, -FOUL_PENALTY); assert.equal(st.score, 10);
  const o2 = resolveShot(st, shot({ white: 1, striker: true }), LEFT);
  assert.equal(o2.points, POINTS_WHITE - FOUL_PENALTY);
});

test('foul on the cover shot still covers when a coin drops; a foul alone returns the queen', () => {
  const st = createRules();
  resolveShot(st, shot({ white: 2 }), LEFT); // 80
  resolveShot(st, shot({ queen: true }), LEFT); // 130
  const o = resolveShot(st, shot({ striker: true }), LEFT);
  assert.equal(o.queenReturned, true); assert.equal(o.foul, true);
  assert.equal(st.score, 130 - 50 - 10);
});

test('round end with the queen pending loses her points', () => {
  const st = createRules();
  resolveShot(st, shot({ queen: true }), LEFT);
  assert.equal(finalizeRound(st), -50);
  assert.equal(st.score, 0); assert.equal(st.queenCovered, false);
  assert.equal(finalizeRound(st), 0);
});

test('score is capped by design under the server cap of 600', () => {
  assert.ok(MAX_SCORE <= 500);
  assert.ok(UNCAPPED_MAX > MAX_SCORE);
  const st = createRules();
  // clear the whole board in combos
  for (let k = 0; k < 9; k++) resolveShot(st, shot({ white: 1, black: 1 }), LEFT);
  resolveShot(st, shot({ queen: true }), { white: 0, black: 0 });
  assert.equal(st.score, MAX_SCORE);
  assert.equal(pocketedCount(st), 19);
});
