import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, checkUsage, scoreExpression, generateTarget, tokenize, ExprError, LARGE } from '../src/games/target.js';
import { addDays } from '../src/util.js';

test('precedence, associativity and parentheses', () => {
  assert.equal(evaluate('2 + 3 * 4').value, 14);
  assert.equal(evaluate('(2 + 3) * 4').value, 20);
  assert.equal(evaluate('100 - 25 - 5').value, 70);
  assert.equal(evaluate('100 / 25 / 2').value, 2);
  assert.equal(evaluate('100 - (25 - 5)').value, 80);
  assert.equal(evaluate('75 × 4 − 25 ÷ 5').value, 295);
  assert.equal(evaluate('((((7))))').value, 7);
});

test('records numbers used', () => {
  assert.deepEqual(evaluate('(50 + 3) * 7').used, [50, 3, 7]);
});

test('rejects bad syntax and never evaluates code', () => {
  for (const bad of ['', '2 +', '(2 + 3', '2 + 3)', '2 3', '* 2', 'process.exit()', '2 ** 3', '-5 + 10', '1e3', 'alert(1)', '2;3']) {
    assert.throws(() => evaluate(bad), ExprError, bad);
  }
  assert.throws(() => tokenize('1'.repeat(300)), ExprError);
});

test('division must be exact, no divide by zero', () => {
  assert.throws(() => evaluate('7 / 2'), /exact/);
  assert.throws(() => evaluate('7 / (2 - 2)'), /zero/);
  assert.equal(evaluate('(75 + 25) / 4').value, 25);
});

test('usage check: each tile at most once, only available numbers', () => {
  const nums = [100, 25, 7, 7, 3, 1];
  checkUsage([7, 7, 100], nums);
  assert.throws(() => checkUsage([7, 7, 7], nums), /too many/);
  assert.throws(() => checkUsage([50], nums), /not one of/);
  assert.throws(() => checkUsage([25, 25], nums), /too many/);
});

test('scoring', () => {
  const nums = [100, 25, 7, 7, 3, 1];
  assert.deepEqual(scoreExpression('100 + 25', nums, 125), { value: 125, distance: 0, score: 10 });
  assert.deepEqual(scoreExpression('100 + 25', nums, 128), { value: 125, distance: 3, score: 7 });
  assert.equal(scoreExpression('100', nums, 999).score, 0);
});

test('generated puzzles are valid and reachable across 3 years', () => {
  let d = '2026-01-01';
  for (let i = 0; i < 1100; i++, d = addDays(d, 1)) {
    const p = generateTarget(d);
    assert.equal(p.numbers.length, 6);
    assert.equal(p.numbers.filter((n) => LARGE.includes(n) && n >= 25).length >= 2, true);
    const large = p.numbers.slice(0, 2), small = p.numbers.slice(2);
    assert.ok(large.every((n) => LARGE.includes(n)) && new Set(large).size === 2, d);
    assert.ok(small.every((n) => n >= 1 && n <= 10), d);
    assert.ok(p.target >= 101 && p.target <= 999, `${d} target ${p.target}`);
    assert.equal(scoreExpression(p.solution, p.numbers, p.target).distance, 0, `${d} ${p.solution}`);
  }
  assert.deepEqual(generateTarget('2026-11-06'), generateTarget('2026-11-06'));
});
