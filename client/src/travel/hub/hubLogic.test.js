// Run: node --test client/src/travel/hub/hubLogic.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  weatherInfo, gpsKmh, derivedKmh, averageKmh, etaMs, tripProgress, nextMilestone, shouldReverse,
  placeFromNominatim, searchHit, countdownText, buildEvents, differentClock, localMatches,
} from './hubLogic.js';

test('weather codes map to emoji + words', () => {
  assert.deepEqual(weatherInfo(0, 1), { emoji: '☀️', words: 'Clear sky' });
  assert.equal(weatherInfo(0, 0).emoji, '🌙');
  assert.equal(weatherInfo(95).words, 'Thunderstorm');
  assert.equal(weatherInfo(1234).words, 'Weather');
});

test('speed from GPS or recent fixes', () => {
  assert.equal(gpsKmh({ speed: 10 }), 36);
  assert.equal(gpsKmh({ speed: null }), null);
  const t = 1_000_000;
  // ~1.11 km per 0.01° latitude in 60 s → ~66.7 km/h
  const kmh = derivedKmh([[12, 77, t], [12.01, 77, t + 60000]], t + 60000);
  assert.ok(kmh > 60 && kmh < 72, String(kmh));
  assert.equal(derivedKmh([[12, 77, t]], t), null);
});

test('average speed and ETA', () => {
  const now = 10_000_000;
  const trip = { startedAt: now - 3600000, distanceKm: 60, points: [[12, 77, now - 600000], [12.1, 77, now]] };
  const avg = averageKmh(trip, now);
  assert.ok(avg > 60 && avg < 70, String(avg));
  assert.equal(etaMs(100, 0), null);
  assert.equal(etaMs(100, 100, 'flight'), 1.03 * 3600000);
});

test('progress, milestones, reverse-geocode throttle', () => {
  const o = { lat: 12, lon: 77 }, d = { lat: 12, lon: 78 };
  assert.equal(tripProgress(o, o, d), 0);
  assert.ok(Math.abs(tripProgress(o, { lat: 12, lon: 77.5 }, d) - 0.5) < 0.01);
  assert.deepEqual(nextMilestone(30, [25, 50, 100]), { km: 50, inKm: 20 });
  assert.equal(nextMilestone(2000, [25, 50]), null);
  const now = 1e9;
  assert.equal(shouldReverse(null, o, now), true);
  assert.equal(shouldReverse({ ...o, at: now - 60000 }, { lat: 12.1, lon: 77 }, now), false); // < 2 min
  assert.equal(shouldReverse({ ...o, at: now - 130000 }, { lat: 12.1, lon: 77 }, now), true); // ≥ 2 km
  assert.equal(shouldReverse({ ...o, at: now - 130000 }, { lat: 12.001, lon: 77 }, now), false);
});

test('place labels and countdowns', () => {
  assert.deepEqual(placeFromNominatim({ address: { town: 'Hosur', state: 'Tamil Nadu', country: 'India', country_code: 'in' } }),
    { name: 'Hosur', state: 'Tamil Nadu', country: 'India', countryCode: 'in' });
  assert.equal(searchHit({ name: 'Chennai', display_name: 'Chennai, Tamil Nadu, 600001, India', lat: '13', lon: '80' }).detail, 'Tamil Nadu, India');
  assert.equal(countdownText(3725000), '1h 02m 05s');
  assert.equal(countdownText(65000), '1m 05s');
  assert.equal(countdownText(-5), '0s');
  assert.equal(differentClock('Asia/Kolkata', 'Asia/Dubai'), true);
  assert.equal(differentClock('Asia/Kolkata', 'Asia/Calcutta'), false);
  assert.equal(localMatches('chen')[0].name, 'Chennai');
});

test('events feed: trip events sorted, unknown ETAs last', () => {
  const now = new Date(1e12);
  const trip = { mode: 'road', distanceKm: 10, origin: { lat: 12, lon: 77 }, destination: { name: 'X', lat: 12, lon: 79 } };
  const ev = buildEvents({ now, sky: [], trip, here: { lat: 12, lon: 77.1 }, kmh: 60, milestones: [25, 50], progress: 0.05 });
  assert.deepEqual(ev.map((e) => e.kind), ['milestone', 'halfway', 'arrive']);
  const still = buildEvents({ now, sky: [{ at: new Date(1e12 + 1000), kind: 'sunset', icon: '🌇', title: 'Sunset' }], trip, here: { lat: 12, lon: 77.1 }, kmh: 0, milestones: [25], progress: 0.05 });
  assert.equal(still[0].kind, 'sunset');
  assert.equal(still[1].at, null);
});
