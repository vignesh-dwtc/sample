import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateReflex, reflexXp } from '../src/games/reflex.js';

test('accepts plausible runs', () => {
  assert.equal(validateReflex({ score: 42, hits: 30, misses: 4, durationMs: 60000 }), null);
  assert.equal(validateReflex({ score: 0, hits: 0, misses: 0, durationMs: 64999 }), null);
  assert.equal(validateReflex({ score: 150, hits: 60, misses: 0, durationMs: 55000 }), null);
});

test('rejects implausible runs', () => {
  const bad = [
    { score: 151, hits: 100, misses: 0, durationMs: 60000 },
    { score: 10, hits: 10, misses: 0, durationMs: 30000 },
    { score: 10, hits: 10, misses: 0, durationMs: 66000 },
    { score: 40, hits: 5, misses: 0, durationMs: 60000 },
    { score: -1, hits: 0, misses: 0, durationMs: 60000 },
    { score: 1.5, hits: 1, misses: 0, durationMs: 60000 },
    { score: '10', hits: 10, misses: 0, durationMs: 60000 },
    { score: 10, hits: 10, misses: 0 },
    null,
  ];
  for (const b of bad) assert.notEqual(validateReflex(b), null, JSON.stringify(b));
});

test('xp is capped at 60', () => {
  assert.equal(reflexXp(0), 10);
  assert.equal(reflexXp(30), 40);
  assert.equal(reflexXp(120), 60);
});

test('min gap between counted runs follows the real playing time', async () => {
  const { reflexMinGapMs, REFLEX_MIN_GAP_MS, REFLEX_MIN_GAP_FLOOR_MS } = await import('../src/games/reflex.js');
  // A clean 60s run keeps the full gap.
  assert.equal(reflexMinGapMs({ durationMs: 60000, misses: 0 }), REFLEX_MIN_GAP_MS);
  // 12 misses = 24s of penalties: the run really lasted ~36s, so a 45s gap would reject a legit replay.
  const gap = reflexMinGapMs({ durationMs: 60000, misses: 12 });
  assert.ok(gap <= 36000 - 5000, `gap ${gap}`);
  // Never below the floor, even for a run that was all misses.
  assert.equal(reflexMinGapMs({ durationMs: 60000, misses: 30 }), REFLEX_MIN_GAP_FLOOR_MS);
});
