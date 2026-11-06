import { test } from 'node:test';
import assert from 'node:assert/strict';
import { travelReward, TRAVEL_GAMES, TRIP_MILESTONES } from '../src/games/travel.js';
// progress.js loads db.js, which requires DATABASE_URL (the pool never connects in this test).
process.env.DATABASE_URL ||= 'postgresql://unused@localhost:1/unused';
const { ACHIEVEMENTS } = await import('../src/progress.js');

test('travel rewards: XP caps, wins and achievements', () => {
  assert.deepEqual(travelReward('travel_sky', 85, { target: 'sun' }).achievements, ['sun_finder']);
  assert.deepEqual(travelReward('travel_sky', 85, { target: 'moon' }).achievements, ['moon_finder']);
  assert.deepEqual(travelReward('travel_sky', 50, {}).achievements, []);
  assert.equal(travelReward('travel_quiz', 100).xp, 60);
  assert.equal(travelReward('travel_quiz', 0).won, false);
  assert.deepEqual(travelReward('travel_bingo', 70, { lines: 2, full: true }).achievements, ['bingo_line', 'bingo_full']);
  assert.deepEqual(travelReward('travel_trip', 500).achievements, ['road_warrior', 'globetrotter']);
  assert.throws(() => travelReward('travel_trip', 42));
  assert.throws(() => travelReward('travel_predict', 101));
  assert.throws(() => travelReward('travel_predict', 5.5));
});

test('every achievement a travel game can award exists in the catalog', () => {
  const codes = new Set();
  for (const g of TRAVEL_GAMES) {
    for (const s of g === 'travel_trip' ? TRIP_MILESTONES : [0, 80, 90, 100]) {
      for (const d of [{}, { target: 'moon' }, { lines: 1, full: true }]) travelReward(g, s, d).achievements.forEach((c) => codes.add(c));
    }
  }
  for (const c of codes) assert.ok(ACHIEVEMENTS[c], `missing achievement ${c}`);
});
