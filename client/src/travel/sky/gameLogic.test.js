// Run: node --test client/src/travel/sky/gameLogic.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roundTargets, HOLD_MS, ZONE_DEG } from './gameLogic.js';
import { roundScore, finalScore, bestTarget, shareTextFor } from './skyLogic.js';

test('rounds alternate sun and moon starting with the chosen one', () => {
  assert.deepEqual(roundTargets('sun', 3), ['sun', 'moon', 'sun']);
  assert.deepEqual(roundTargets('moon', 3), ['moon', 'sun', 'moon']);
});

test('hold rules match the spec (3 s steady in the zone)', () => {
  assert.equal(HOLD_MS, 3000);
  assert.ok(ZONE_DEG > 0 && ZONE_DEG <= 20);
});

test('a full game scores as the average and reports the best target', () => {
  const rounds = [{ body: 'sun', score: roundScore(4) }, { body: 'moon', score: roundScore(1) }, { body: 'sun', score: roundScore(60) }];
  assert.deepEqual(rounds.map((r) => r.score), [92, 98, 0]);
  assert.equal(finalScore(rounds), 63);
  assert.equal(bestTarget(rounds), 'moon');
  const share = shareTextFor(63, rounds, 'Bengaluru', 'https://x.test');
  assert.match(share, /^PlayNest Sky Compass 🌙 63\/100/);
  assert.doesNotMatch(share, /\d+\.\d+/); // no coordinates
});
