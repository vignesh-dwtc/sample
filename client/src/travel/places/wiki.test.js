import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGeosearch, mergePlaces, offsetPoint, geosearchUrl } from './wiki.js';
import { distanceKm, bearing } from '../geo.js';

test('geosearch URL uses 10 km radius, 50 results and CORS origin', () => {
  const u = geosearchUrl({ lat: 12.97, lon: 77.59 });
  assert.match(u, /gsradius=10000/); assert.match(u, /gslimit=50/); assert.match(u, /origin=\*/); assert.match(u, /gscoord=12\.97000%7C77\.59000/);
});

test('parseGeosearch maps rows, drops junk and boring titles', () => {
  const json = { query: { geosearch: [
    { pageid: 1, title: 'Lalbagh', lat: 12.95, lon: 77.58 },
    { pageid: 2, title: 'List of parks in Bengaluru', lat: 12.9, lon: 77.5 },
    { pageid: 3, title: 'Bad', lat: null, lon: 77 },
  ] } };
  const p = parseGeosearch(json);
  assert.equal(p.length, 1);
  assert.deepEqual(p[0], { id: 'wp:1', title: 'Lalbagh', lat: 12.95, lon: 77.58, kind: 'wiki', url: 'https://en.wikipedia.org/?curid=1' });
  assert.deepEqual(parseGeosearch({}), []);
  assert.deepEqual(parseGeosearch(null), []);
});

test('mergePlaces de-duplicates by id', () => {
  const a = [{ id: 'wp:1' }, { id: 'wp:2' }], b = [{ id: 'wp:2' }, { id: 'wp:3' }];
  assert.deepEqual(mergePlaces(a, b, undefined).map((x) => x.id), ['wp:1', 'wp:2', 'wp:3']);
});

test('offsetPoint moves ~8 km in the right direction', () => {
  const p = { lat: 12.97, lon: 77.59 };
  for (const [d, deg] of [['N', 0], ['E', 90], ['S', 180], ['W', 270]]) {
    const q = offsetPoint(p, d);
    assert.ok(Math.abs(distanceKm(p, q) - 8) < 0.1, d);
    assert.ok(Math.abs(((bearing(p, q) - deg + 540) % 360) - 180) < 1, d);
  }
  assert.ok(Math.abs(offsetPoint({ lat: 0, lon: 179.99 }, 'E').lon) <= 180);
});
