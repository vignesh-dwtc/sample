import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arcadeReward, ARCADE_GAMES } from '../src/games/arcade.js';

process.env.DATABASE_URL ||= 'postgresql://unused@localhost:1/unused';
const { ACHIEVEMENTS } = await import('../src/progress.js');

test('arcade caps, wins and achievements', () => {
  assert.throws(() => arcadeReward('arcade_cricket', 73));
  assert.throws(() => arcadeReward('arcade_cricket', -1));
  assert.throws(() => arcadeReward('arcade_cricket', 1.5));
  assert.throws(() => arcadeReward('nope', 1));
  assert.deepEqual(arcadeReward('arcade_cricket', 54, { sixes: 4 }).achievements, ['six_machine', 'half_century']);
  assert.equal(arcadeReward('arcade_cricket', 10).won, false);
  assert.deepEqual(arcadeReward('arcade_highway', 12000, { nearMisses: 12 }).achievements, ['highway_hero', 'close_shave']);
  assert.deepEqual(arcadeReward('arcade_carrom', 320, { queen: true }).achievements, ['queen_covered', 'carrom_king']);
  for (const g of Object.keys(ARCADE_GAMES)) assert.ok(arcadeReward(g, ARCADE_GAMES[g].max).xp <= (g === 'arcade_adventure' ? 120 : 80));
});

test('every arcade achievement exists in the catalog', () => {
  const all = [
    ...arcadeReward('arcade_cricket', 72, { sixes: 12 }).achievements,
    ...arcadeReward('arcade_highway', 50000, { nearMisses: 99 }).achievements,
    ...arcadeReward('arcade_carrom', 600, { queen: true }).achievements,
    ...arcadeReward('arcade_adventure', 2500, { relics: 5, flawless: true }).achievements,
  ];
  for (const c of all) assert.ok(ACHIEVEMENTS[c], c);
});
