import { test } from 'node:test';
import assert from 'node:assert/strict';
import { thinRoute, tripStats } from './route.js';

test('thinRoute keeps endpoints, drops collinear points, respects max', () => {
  const line = Array.from({ length: 1000 }, (_, i) => [12.97 + i * 0.001, 77.59, i * 1000]);
  const t = thinRoute(line);
  assert.deepEqual(t[0], [12.97, 77.59]);
  assert.equal(t.length, 2);
  const zig = Array.from({ length: 4000 }, (_, i) => [12.97 + i * 0.001, 77.59 + (i % 2) * 0.01, i]);
  const z = thinRoute(zig, { max: 500 });
  assert.ok(z.length <= 500 && z.length >= 2);
  assert.deepEqual(thinRoute([]), []);
  assert.deepEqual(thinRoute([[1, 2, 3]]), [[1, 2]]);
});

test('tripStats: speed from GPS, ETA to destination', () => {
  const now = 1_000_000_000;
  const trip = { mode: 'road', startedAt: now - 3600000, distanceKm: 60, destination: { name: 'Chennai', lat: 13.08, lon: 80.27 }, points: [] };
  const s = tripStats(trip, { lat: 12.97, lon: 77.59, speed: 25 }, now);
  assert.equal(Math.round(s.speedKmh), 90);
  assert.ok(s.toGoKm > 280 && s.toGoKm < 300);
  assert.ok(s.etaMs > 3 * 3600000 && s.etaMs < 6 * 3600000);
  const none = tripStats(null, null, now);
  assert.equal(none.travelledKm, 0); assert.equal(none.etaMs, null); assert.equal(none.speedKmh, null);
});

test('tripStats derives speed from recent points when GPS speed is missing', () => {
  const now = 10 * 60000;
  const pts = Array.from({ length: 6 }, (_, i) => [12.97 + i * 0.01, 77.59, now - (5 - i) * 60000]);
  const s = tripStats({ startedAt: 0, distanceKm: 5, points: pts }, { lat: 13.02, lon: 77.59, speed: null }, now);
  assert.ok(s.speedKmh > 60 && s.speedKmh < 72, String(s.speedKmh));
});
