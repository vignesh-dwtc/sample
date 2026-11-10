import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SOUND_DEFS, LOOP_DEFS, ALIASES, LEGACY_NAMES, CATEGORY_VOLUME, soundNames, loopNames, resolveSound, tierFor } from './registry.js';
import { RECIPES, BEDS, renderSound } from './recipes.js';
import { stats } from './analysis.js';

const REQUIRED = ['tap', 'click', 'success', 'error', 'coin', 'levelup', 'whoosh', 'swoosh', 'flip', 'pop', 'type',
  'bat', 'edge', 'bounce', 'stumps', 'catch', 'crowdCheer', 'crowdRoar', 'crowdGroan', 'claps', 'whistle',
  'crash', 'horn', 'hornCar', 'autoHorn', 'passBy', 'tyre', 'nitro', 'coinPickup',
  'woodClick', 'strikerHit', 'cushion', 'pocket', 'slide', 'win', 'lose', 'tick', 'countdown', 'heartbeat'];

test('every legacy name still resolves (backwards compatibility)', () => {
  assert.deepEqual(LEGACY_NAMES.sort(), ['click', 'coin', 'crash', 'crowd', 'engine', 'error', 'hit', 'levelup', 'success', 'swoosh', 'tap', 'whoosh']);
  for (const n of LEGACY_NAMES) { assert.ok(resolveSound(n), n); assert.ok(soundNames().includes(n), n); }
});
test('all required sounds and loops are registered with a recipe', () => {
  for (const n of REQUIRED) { assert.ok(SOUND_DEFS[n], n); assert.equal(typeof RECIPES[n], 'function', n); }
  for (const n of ['crowdAmbience', 'engine', 'road', 'room']) assert.ok(loopNames().includes(n), n);
  assert.ok(loopNames().includes('crickets') || loopNames().includes('rain'));
});
test('registry and recipes agree; metadata is complete', () => {
  assert.deepEqual(Object.keys(SOUND_DEFS).sort(), Object.keys(RECIPES).sort());
  for (const [n, d] of Object.entries(SOUND_DEFS)) { assert.ok(d.desc, n); assert.ok(d.cat in CATEGORY_VOLUME, n); }
  for (const [n, d] of Object.entries(LOOP_DEFS)) { assert.ok(d.desc, n); assert.ok(d.cat in CATEGORY_VOLUME, n); }
  for (const t of Object.values(ALIASES)) assert.ok(SOUND_DEFS[t]);
  for (const n of ['crowdAmbience', 'crickets', 'rain', 'room']) assert.equal(typeof BEDS[n], 'function', n);
  assert.equal(resolveSound('nope'), null);
  assert.ok(CATEGORY_VOLUME.ui < CATEGORY_VOLUME.game, 'ui sits under game sounds');
});
test('intensity tiers follow volume', () => {
  assert.equal(tierFor(SOUND_DEFS.bat, 0.3), 0.5); assert.equal(tierFor(SOUND_DEFS.bat, 0.95), 1); assert.equal(tierFor(SOUND_DEFS.tap, 0.2), 1);
});
test('every sound renders: finite, audible, not clipping', () => {
  for (const n of [...Object.keys(RECIPES), ...Object.keys(BEDS)]) {
    const o = renderSound(n, 16000, 42, { intensity: 1 });
    for (const ch of [o.L, o.R]) {
      const s = stats(ch, 16000);
      assert.equal(s.nan, 0, `${n} NaN`);
      assert.ok(s.peak <= 0.9, `${n} peak ${s.peak}`);
      assert.ok(s.rms > 0.005, `${n} too quiet ${s.rms}`);
    }
  }
});
test('soft bat is duller than a perfect bat', () => {
  const soft = stats(renderSound('bat', 32000, 1, { intensity: 0.5 }).L, 32000), hard = stats(renderSound('bat', 32000, 1, { intensity: 1 }).L, 32000);
  assert.ok(hard.centroid > soft.centroid * 1.2, `${hard.centroid} vs ${soft.centroid}`);
});
