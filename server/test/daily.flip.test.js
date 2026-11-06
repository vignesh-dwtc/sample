import { test } from 'node:test';
import assert from 'node:assert/strict';
import { press, applyMoves, isSolved, generateFlip, allSolutions, minimumMoves, validMoves, flipScore, flipXp } from '../src/games/flip.js';
import { addDays } from '../src/util.js';

test('press toggles the cell and orthogonal neighbours with edge clipping', () => {
  const g = press(Array(25).fill(0), 0);
  assert.deepEqual([0, 1, 5].map((i) => g[i]), [1, 1, 1]);
  assert.equal(g.reduce((a, b) => a + b), 3);
  const c = press(Array(25).fill(0), 12);
  assert.deepEqual([12, 7, 17, 11, 13].map((i) => c[i]), [1, 1, 1, 1, 1]);
  assert.equal(c.reduce((a, b) => a + b), 5);
  const e = press(Array(25).fill(0), 4); // top-right: no wrap to next row
  assert.deepEqual([4, 3, 9].map((i) => e[i]), [1, 1, 1]);
  assert.equal(e[5], 0);
});

test('pressing twice is identity; replay verifies', () => {
  const g = applyMoves(Array(25).fill(0), [3, 8, 3, 8]);
  assert.ok(isSolved(g));
});

test('daily puzzles: N in 7..11, distinct presses, solvable, par is optimal', () => {
  let d = '2026-01-01';
  for (let i = 0; i < 400; i++, d = addDays(d, 1)) {
    const p = generateFlip(d);
    assert.ok(p.par >= 7 && p.par <= 11);
    assert.equal(new Set(p.presses).size, p.par);
    assert.ok(isSolved(applyMoves(p.grid, p.presses)));
    assert.equal(allSolutions(p.grid).length, 4);
    assert.equal(minimumMoves(p.grid), p.par);
  }
  assert.deepEqual(generateFlip('2026-11-06'), generateFlip('2026-11-06'));
});

test('move validation and scoring', () => {
  assert.ok(validMoves([0, 24]));
  for (const bad of [[], [25], [-1], [1.5], ['3'], null, Array(2001).fill(0)]) assert.ok(!validMoves(bad));
  assert.equal(flipScore(7, 7), 10);
  assert.equal(flipScore(6, 7), 10);
  assert.equal(flipScore(10, 7), 7);
  assert.equal(flipScore(40, 7), 1);
  assert.equal(flipXp(10), 80);
});

test('a long, flailing (but valid) solve is still accepted', () => {
  const { grid, presses } = generateFlip('2026-11-06');
  // 400 wasted presses (pairs cancel out) followed by the real solution.
  const moves = [...Array.from({ length: 400 }, (_, k) => k % 25), ...presses];
  assert.ok(validMoves(moves));
  assert.ok(isSolved(applyMoves(grid, moves)));
  assert.equal(flipScore(moves.length, presses.length), 1);
});
