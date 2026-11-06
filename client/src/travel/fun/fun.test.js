// Run: node --test client/src/travel/fun/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  POOLS, BINGO_MODES, generateCard, findLines, newLines, bingoScore, toggleMark, markedCount, isFull, FREE_INDEX, LINES, seededRandom,
} from './bingoLogic.js';
import {
  predictScore, finalPredictScore, windowDistance, predictFeedback, recentSpeedKmh, countdownLabel, nextClockTime, arrivalScore,
  arrivalTimeFromPoints, sliderMaxKm, positionAtOrBefore,
} from './predictLogic.js';
import { enqueueItem, nextToSend, waitFor, GAP_MS } from './scoreQueue.js';

test('pools: ≥40 unique, short, emoji-labelled items per mode', () => {
  for (const m of BINGO_MODES) {
    const pool = POOLS[m];
    assert.ok(pool.length >= 40, `${m} has ${pool.length}`);
    assert.equal(new Set(pool.map((x) => x.id)).size, pool.length, `${m} ids unique`);
    assert.equal(new Set(pool.map((x) => x.t.toLowerCase())).size, pool.length, `${m} labels unique`);
    for (const x of pool) { assert.ok(x.e && x.t.length <= 22, `${m}:${x.t}`); }
  }
});

test('card: deterministic per seed, FREE centre, 24 distinct items', () => {
  const a = generateCard('train', 'trip1#1'), b = generateCard('train', 'trip1#1'), c = generateCard('train', 'trip1#2');
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.map((x) => x.id), c.map((x) => x.id));
  assert.equal(a.length, 25);
  assert.equal(a[FREE_INDEX].free, true);
  assert.equal(new Set(a.map((x) => x.id)).size, 25);
  assert.ok(a.filter((x) => !x.free).every((x) => x.id.startsWith('train.')));
  assert.ok(generateCard('nope', 's').every((x) => x.free || x.id.startsWith('road.')));
  const r = seededRandom('x'); const v = r(); assert.ok(v >= 0 && v < 1);
});

test('lines: rows, columns, diagonals; FREE counts', () => {
  assert.equal(LINES.length, 12);
  assert.deepEqual(findLines([]), []);
  assert.deepEqual(findLines([0, 1, 2, 3, 4]), [0]);
  assert.deepEqual(findLines([10, 11, 13, 14]), [2]); // middle row via FREE
  assert.deepEqual(findLines([2, 7, 17, 22]), [7]); // middle column via FREE
  assert.deepEqual(findLines([0, 6, 18, 24]), [10]);
  assert.deepEqual(findLines([4, 8, 16, 20]), [11]);
  const all = [...Array(25).keys()].filter((i) => i !== 12);
  assert.equal(findLines(all).length, 12);
  assert.ok(isFull(all));
  assert.deepEqual(newLines([0], [0, 5]), [5]);
});

test('marking and score', () => {
  let m = toggleMark([], 3); assert.deepEqual(m, [3]);
  m = toggleMark(m, 3); assert.deepEqual(m, []);
  assert.deepEqual(toggleMark([], FREE_INDEX), []);
  assert.equal(markedCount([1, 1, 12, 30]), 1);
  assert.equal(bingoScore([0, 1, 2, 3, 4], 1), 30);
  const all = [...Array(25).keys()];
  assert.equal(bingoScore(all, 12), 100);
});

test('predict score formula and expert bonus', () => {
  assert.equal(predictScore(10, 10), 100);
  assert.equal(predictScore(9, 10), 90);
  assert.equal(predictScore(30, 10), 0);
  assert.equal(predictScore(0.2, 0), 60); // max(actual, 0.5)
  assert.equal(predictScore(0, 0), 100);
  assert.equal(finalPredictScore(9, 10, true), 100);
  assert.equal(finalPredictScore(8, 10, true), 90);
  assert.equal(finalPredictScore(30, 10, true), 0);
  assert.equal(finalPredictScore(8, 10, false), 80);
});

test('window distance: track, straight-line fallback, none', () => {
  const t0 = 1_000_000;
  const pts = [[12.97, 77.59, t0 - 60000], [12.97, 77.6, t0 + 60000], [12.97, 77.61, t0 + 120000], [12.97, 77.7, t0 + 900000]];
  const r = windowDistance({ points: pts, startAt: t0, endAt: t0 + 300000, startPos: { lat: 12.97, lon: 77.59 } });
  assert.equal(r.method, 'track');
  assert.ok(Math.abs(r.km - 2.17) < 0.05, String(r.km));
  const s = windowDistance({ points: [], startAt: t0, endAt: t0 + 1, startPos: { lat: 12.97, lon: 77.59 }, endPos: { lat: 12.97, lon: 77.6 } });
  assert.equal(s.method, 'straight');
  assert.ok(Math.abs(s.km - 1.085) < 0.02);
  assert.equal(windowDistance({ points: [], startAt: 0, endAt: 1 }).method, 'none');
  assert.deepEqual(positionAtOrBefore(pts, t0 + 100000), { lat: 12.97, lon: 77.6, at: t0 + 60000 });
});

test('feedback, speed, labels', () => {
  assert.match(predictFeedback(10.8, 10).line, /Off by 800 m — Human GPS!/);
  assert.equal(predictFeedback(5, 5).title, 'Bullseye!');
  assert.equal(predictFeedback(50, 5).title, 'Way off!');
  const now = 10_000_000;
  const v = recentSpeedKmh([[12.97, 77.59, now - 60000], [12.97, 77.6, now]], now);
  assert.ok(v > 60 && v < 70, String(v));
  assert.equal(recentSpeedKmh([], now), null);
  assert.equal(countdownLabel(65000), '01:05');
  assert.equal(countdownLabel(3_725_000), '1:02:05');
  assert.equal(countdownLabel(-5), '00:00');
  assert.ok(sliderMaxKm(10, 60) >= 20);
  assert.ok(sliderMaxKm(30, 900) >= 450);
});

test('arrival guess', () => {
  const now = new Date(2026, 10, 6, 21, 0).getTime();
  assert.equal(nextClockTime('21:30', now), new Date(2026, 10, 6, 21, 30).getTime());
  assert.equal(nextClockTime('06:15', now), new Date(2026, 10, 7, 6, 15).getTime());
  assert.equal(nextClockTime('x', now), null);
  const hr = 3600000;
  assert.equal(arrivalScore(now + 10 * hr, now + 10 * hr, now), 100);
  assert.equal(arrivalScore(now + 10 * hr + 60 * 60000, now + 10 * hr, now), 90);
  assert.equal(arrivalScore(now + 5 * 60000, now + 20 * 60000, now), 25);
  const dest = { lat: 13.08, lon: 80.27 };
  assert.equal(arrivalTimeFromPoints([[12.9, 80.0, now + 1], [13.081, 80.271, now + 5]], dest, now), now + 5);
  assert.equal(arrivalTimeFromPoints([[13.081, 80.271, now - 5]], dest, now), null);
});

test('score queue planning respects the 15 s gap and collapses by key', () => {
  let q = enqueueItem([], { id: 'a', game: 'travel_bingo', key: 'card1' });
  q = enqueueItem(q, { id: 'b', game: 'travel_bingo', key: 'card1' });
  assert.deepEqual(q.map((x) => x.id), ['b']);
  q = enqueueItem(q, { id: 'c', game: 'travel_predict', key: 'r1' });
  assert.equal(q.length, 2);
  const now = 100000;
  assert.equal(waitFor({ travel_bingo: now - 5000 }, 'travel_bingo', now), GAP_MS - 5000);
  const n = nextToSend(q, { travel_bingo: now - 1000 }, now);
  assert.equal(n.item.id, 'c'); assert.equal(n.wait, 0);
  const n2 = nextToSend(q, { travel_bingo: now - 1000, travel_predict: now - 500 }, now);
  assert.equal(n2.item.id, 'b'); assert.equal(n2.wait, GAP_MS - 1000);
});
