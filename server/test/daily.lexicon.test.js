import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ANSWERS } from '../src/games/answers.js';
import { markGuess, answerFor, isValidGuess, validWords, lexiconView, lexiconScore, lexiconXp } from '../src/games/lexicon.js';

const m = (g, a) => markGuess(g, a).map((x) => x[0]).join(''); // h/n/m shorthand

test('answer list: ≥300 unique lowercase 5-letter words, all guessable', () => {
  assert.ok(ANSWERS.length >= 300, `only ${ANSWERS.length}`);
  assert.equal(new Set(ANSWERS).size, ANSWERS.length);
  for (const w of ANSWERS) {
    assert.match(w, /^[a-z]{5}$/);
    assert.ok(validWords().has(w), `${w} missing from dictionary`);
  }
});

test('marking basics', () => {
  assert.equal(m('crane', 'crane'), 'hhhhh');
  assert.equal(m('bumpy', 'crane'), 'mmmmm');
  assert.equal(m('nacre', 'crane'), 'nnnnh');
});

test('duplicate letters: extra copies are misses', () => {
  // answer has one L; guess has two
  // label has two Ls (one hit, one near) and one A; the third-position A is the only near A
  assert.equal(m('llama', 'label'), 'hnnmm');
  assert.deepEqual(markGuess('hello', 'world'), ['miss', 'miss', 'miss', 'hit', 'near']);
  // exact hit claims the letter before a near can
  assert.deepEqual(markGuess('eerie', 'there'), ['near', 'miss', 'near', 'miss', 'hit']);
  assert.deepEqual(markGuess('speed', 'abide'), ['miss', 'miss', 'near', 'miss', 'near']);
  assert.deepEqual(markGuess('geese', 'eagle'), ['near', 'near', 'miss', 'miss', 'hit']);
  // answer has two Es: one claimed by the hit, the other still available as a near
  assert.deepEqual(markGuess('allee', 'eagle'), ['near', 'near', 'miss', 'near', 'hit']);
  assert.deepEqual(markGuess('sassy', 'grass'), ['near', 'near', 'miss', 'hit', 'miss']);
  assert.deepEqual(markGuess('apple', 'paper'), ['near', 'near', 'hit', 'miss', 'near']);
});

test('answerFor is deterministic and drawn from the list', () => {
  assert.equal(answerFor('2026-11-06'), answerFor('2026-11-06'));
  assert.ok(ANSWERS.includes(answerFor('2026-01-01')));
  const distinct = new Set(Array.from({ length: 30 }, (_, i) => answerFor(`2026-02-${String(i % 28 + 1).padStart(2, '0')}`)));
  assert.ok(distinct.size > 15);
});

test('guess validation', () => {
  assert.ok(isValidGuess('crane'));
  assert.ok(!isValidGuess('xxxxx'));
  assert.ok(!isValidGuess('cran'));
  assert.ok(!isValidGuess('CRANE')); // callers normalise first
});

test('view, score, xp', () => {
  const v = lexiconView(['crane', 'label'], 'label');
  assert.equal(v.finished, true);
  assert.equal(v.won, true);
  assert.equal(lexiconScore(true, 2), 5);
  assert.equal(lexiconXp(true, 5), 90);
  assert.equal(lexiconXp(false, 0), 15);
  const lost = lexiconView(['crane', 'slate', 'pride', 'mount', 'shiny', 'quick'], 'label');
  assert.deepEqual([lost.finished, lost.won], [true, false]);
  assert.equal(lexiconView(['crane'], 'label').finished, false);
});
