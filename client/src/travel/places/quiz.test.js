import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildQuiz, scoreAnswer, totalScore, annotate, bandsFor, bandIndex, bandLabel, rng, QUESTION_COUNT } from './quiz.js';
import { CITIES } from './cities.js';
import { distanceKm, bearing, compassPoint } from '../geo.js';

const BLR = { lat: 12.97, lon: 77.59 };
const nearby = (n, from = BLR) => Array.from({ length: n }, (_, i) => {
  const r = 0.3 + i * 0.45, a = (i * 137) % 360;
  return { id: `wp:${i}`, title: `Place ${i}`, kind: 'wiki', url: `https://en.wikipedia.org/?curid=${i}`,
    lat: from.lat + (r / 111) * Math.cos((a * Math.PI) / 180), lon: from.lon + (r / 108) * Math.sin((a * Math.PI) / 180) };
});

function checkQuiz(qs, from) {
  assert.equal(qs.length, QUESTION_COUNT);
  const types = new Set(qs.map((q) => q.type));
  for (const t of ['closest', 'farthest', 'direction', 'distance']) assert.ok(types.has(t), `has ${t}`);
  for (const q of qs) {
    assert.ok(q.prompt && q.explain, 'prompt + explanation');
    assert.ok(q.options.length >= 4, 'at least 4 options');
    assert.equal(new Set(q.options.map((o) => o.id)).size, q.options.length, 'unique options');
    assert.ok(q.options.some((o) => o.id === q.answer), 'answer among options');
    assert.equal(scoreAnswer(q, q.answer), 1);
    if (q.type === 'closest') {
      const d = q.places.map((p) => distanceKm(from, p));
      assert.equal(q.answer, q.places[d.indexOf(Math.min(...d))].id);
    }
    if (q.type === 'farthest') {
      const d = q.places.map((p) => distanceKm(from, p));
      assert.equal(q.answer, q.places[d.indexOf(Math.max(...d))].id);
    }
    if (q.type === 'direction' && q.compass === 8) assert.equal(q.answer, compassPoint(bearing(from, q.subject)));
    if (q.type === 'distance') assert.equal(Number(q.answer), bandIndex(bandsFor(q.subject.kind), distanceKm(from, q.subject)));
  }
}

test('builds 6 varied, correct questions from nearby places', () => {
  for (let seed = 1; seed <= 40; seed++) checkQuiz(buildQuiz(nearby(30), BLR, seed), BLR);
});

test('works with exactly 6 places', () => {
  for (let seed = 1; seed <= 20; seed++) checkQuiz(buildQuiz(nearby(6), BLR, seed), BLR);
});

test('fallback city quiz always works, from anywhere', () => {
  assert.ok(CITIES.length >= 40);
  for (const from of [BLR, { lat: 28.6, lon: 77.2 }, { lat: 51.5, lon: -0.1 }, { lat: -33.9, lon: 151.2 }, { lat: 0, lon: 0 }]) {
    for (let seed = 1; seed <= 15; seed++) checkQuiz(buildQuiz(CITIES, from, seed), from);
  }
});

test('same seed → same quiz; too few places → empty', () => {
  assert.deepEqual(buildQuiz(nearby(20), BLR, 7).map((q) => q.prompt), buildQuiz(nearby(20), BLR, 7).map((q) => q.prompt));
  assert.deepEqual(buildQuiz(nearby(3), BLR, 1), []);
  assert.deepEqual(buildQuiz([], BLR, 1), []);
});

test('annotate de-duplicates and skips bad rows', () => {
  const a = annotate([{ id: 1, title: 'A', lat: 13, lon: 77 }, { id: 1, title: 'A', lat: 13, lon: 77 }, { id: 2, title: 'B', lat: NaN, lon: 1 }, null], BLR);
  assert.equal(a.length, 1);
});

test('scoring: partial credit and 0–100 total', () => {
  const dir = { type: 'direction', answer: 'NE', compass: 8 };
  assert.equal(scoreAnswer(dir, 'N'), 0.5);
  assert.equal(scoreAnswer(dir, 'S'), 0);
  assert.equal(scoreAnswer({ type: 'direction', answer: 'N', compass: 4 }, 'E'), 0);
  assert.equal(scoreAnswer({ type: 'distance', answer: '3' }, '2'), 0.5);
  assert.equal(scoreAnswer({ type: 'closest', answer: 'x' }, 'y'), 0);
  assert.equal(totalScore([1, 1, 1, 1, 1, 1]), 100);
  assert.equal(totalScore([1, 0.5, 0, 0, 0, 0]), 25);
  assert.equal(totalScore([]), 0);
});

test('band labels read naturally', () => {
  const b = bandsFor('wiki');
  assert.equal(bandLabel(b, 0), 'Under 500 m');
  assert.equal(bandLabel(b, 2), '1 km – 2 km');
  assert.equal(bandLabel(b, b.length - 1), 'Over 20 km');
  assert.equal(bandLabel(bandsFor('city'), 4), '1,000 km – 2,000 km');
});

test('rng is deterministic and in [0,1)', () => {
  const r1 = rng(5), r2 = rng(5);
  for (let i = 0; i < 100; i++) { const v = r1(); assert.equal(v, r2()); assert.ok(v >= 0 && v < 1); }
});
