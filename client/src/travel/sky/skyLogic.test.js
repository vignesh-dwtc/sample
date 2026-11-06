// Run: node --test client/src/travel/sky/skyLogic.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  norm360, signedDiff, absDiff, unwrapAngle, roundScore, finalScore, bestTarget, verdict, directionName, directionShort,
  heightWord, describeBody, countdownText, dayLengthText, moonLitPath, nextMoonEvents, SYNODIC_DAYS, upBands,
  pointToBearing, polar, warmth, nearestPlace, shareTextFor,
} from './skyLogic.js';

test('angle normalisation and differences wrap correctly', () => {
  assert.equal(norm360(-10), 350);
  assert.equal(norm360(725), 5);
  assert.equal(signedDiff(350, 10), 20);
  assert.equal(signedDiff(10, 350), -20);
  assert.equal(signedDiff(0, 180), 180);
  assert.equal(absDiff(359, 1), 2);
  assert.equal(absDiff(90, 270), 180);
});

test('unwrapAngle keeps rotation continuous across 0/360', () => {
  assert.equal(unwrapAngle(null, 370), 10);
  assert.equal(unwrapAngle(359, 1), 361);
  assert.equal(unwrapAngle(-358, 359), -361);
  assert.equal(unwrapAngle(720, 90), 810);
});

test('roundScore is 100 - 2×error, clamped and integer', () => {
  assert.equal(roundScore(0), 100);
  assert.equal(roundScore(4), 92);
  assert.equal(roundScore(-4), 92);
  assert.equal(roundScore(12.3), 75);
  assert.equal(roundScore(50), 0);
  assert.equal(roundScore(170), 0);
  assert.equal(roundScore(NaN), 0);
  assert.equal(roundScore(undefined), 0);
});

test('finalScore averages, bestTarget picks the best round', () => {
  const rounds = [{ body: 'sun', score: 80 }, { body: 'moon', score: 95 }, { body: 'sun', score: 60 }];
  assert.equal(finalScore(rounds), 78);
  assert.equal(finalScore([]), 0);
  assert.equal(bestTarget(rounds), 'moon');
  assert.equal(bestTarget([{ body: 'sun', score: 50 }, { body: 'moon', score: 50 }]), 'sun');
  assert.equal(bestTarget([]), 'sun');
  assert.ok(verdict(100).text && verdict(0).text);
});

test('direction words', () => {
  assert.equal(directionName(0), 'north');
  assert.equal(directionName(359), 'north');
  assert.equal(directionName(247.5), 'west-south-west');
  assert.equal(directionName(90), 'east');
  assert.equal(directionShort(202.5), 'SSW');
  assert.equal(heightWord(5), 'low');
  assert.equal(heightWord(-5), 'below the horizon');
  assert.equal(describeBody('Sun', 250, 8), 'Sun is low in the west-south-west');
  assert.match(describeBody('Moon', 90, -30), /under your feet towards the east/);
  assert.equal(describeBody('Sun', 0, 85), 'Sun is almost straight overhead');
});

test('countdown and day length text', () => {
  assert.equal(countdownText(35000), '35 s');
  assert.equal(countdownText(4 * 60000 + 5000), '4 min 05 s');
  assert.equal(countdownText(65 * 60000), '1 h 05 min');
  assert.equal(countdownText(-5), '0 s');
  assert.equal(countdownText(null), '—');
  assert.equal(dayLengthText(new Date(0), new Date(12 * 3600000 + 7 * 60000)), '12 h 07 min');
  assert.equal(dayLengthText(null, new Date()), '—');
});

test('moonLitPath shapes', () => {
  assert.equal(moonLitPath(0, true), '');
  assert.match(moonLitPath(1, true), /A 50 50 0 1 1/);
  // waxing crescent: limb via right (sweep 1), terminator bulges right (sweep 0)
  assert.equal(moonLitPath(0.25, true), 'M 50 0 A 50 50 0 0 1 50 100 A 25 50 0 0 0 50 0 Z');
  // waxing gibbous: terminator bulges left (sweep 1)
  assert.equal(moonLitPath(0.75, true), 'M 50 0 A 50 50 0 0 1 50 100 A 25 50 0 0 1 50 0 Z');
  // waning mirror images
  assert.equal(moonLitPath(0.25, false), 'M 50 0 A 50 50 0 0 0 50 100 A 25 50 0 0 1 50 0 Z');
  assert.equal(moonLitPath(0.75, false), 'M 50 0 A 50 50 0 0 0 50 100 A 25 50 0 0 0 50 0 Z');
  // half moon: straight terminator
  assert.match(moonLitPath(0.5, true), /A 0 50/);
});

test('nextMoonEvents estimates and refines', () => {
  const now = new Date(Date.UTC(2026, 0, 1));
  const day = 86400000;
  const e = nextMoonEvents(now, 0.25);
  assert.ok(Math.abs((e.full - now) / day - SYNODIC_DAYS / 4) < 0.01);
  assert.ok(Math.abs((e.new - now) / day - (SYNODIC_DAYS * 3) / 4) < 0.01);
  // at exactly full moon, next full is a month away
  const f = nextMoonEvents(now, 0.5);
  assert.ok((f.full - now) / day > 29);
  // refinement moves towards the true peak
  const peak = now.getTime() + 8 * day;
  const illum = (d) => 1 - Math.abs(d.getTime() - peak) / (20 * day);
  const r = nextMoonEvents(now, 0.25, illum);
  assert.ok(Math.abs(r.full.getTime() - peak) <= 3600000);
});

test('upBands finds intervals above the threshold', () => {
  const s = [-10, -5, 5, 10, 5, -5, -10].map((alt, i) => ({ t: i * 10, alt }));
  const b = upBands(s);
  assert.equal(b.length, 1);
  assert.ok(Math.abs(b[0].from - 15 / 60) < 1e-9);
  assert.ok(Math.abs(b[0].to - 45 / 60) < 1e-9);
  const all = upBands([{ t: 0, alt: 5 }, { t: 10, alt: 6 }]);
  assert.deepEqual(all, [{ from: 0, to: 1 }]);
  assert.deepEqual(upBands([]), []);
});

test('pointToBearing / polar are inverses on the dial', () => {
  assert.equal(pointToBearing(50, 0, 50, 50), 0);
  assert.equal(pointToBearing(100, 50, 50, 50), 90);
  assert.equal(pointToBearing(50, 100, 50, 50), 180);
  assert.equal(pointToBearing(0, 50, 50, 50), 270);
  const p = polar(50, 50, 40, 135);
  assert.ok(Math.abs(pointToBearing(p.x, p.y, 50, 50) - 135) < 0.1);
});

test('warmth levels', () => {
  assert.equal(warmth(5).key, 'hot');
  assert.equal(warmth(-20).key, 'warm');
  assert.equal(warmth(170).key, 'freezing');
  assert.ok(warmth(0).level === 1 && warmth(180).level === 0);
});

test('share text has a place name but never coordinates', () => {
  assert.equal(nearestPlace(12.97, 77.59), 'Bengaluru');
  assert.equal(nearestPlace(13.0, 80.2), 'Chennai');
  assert.equal(nearestPlace(0, -140), null);
  const t = shareTextFor(92, [{ body: 'sun', score: 92 }, { body: 'moon', score: 40 }], 'Bengaluru', 'https://x.app');
  assert.match(t, /^PlayNest Sky Compass 🌞 92\/100 near Bengaluru/);
  assert.ok(!/\d+\.\d+/.test(t));
  assert.match(shareTextFor(50, [{ body: 'moon', score: 50 }], null), /🌙 50\/100 on the move/);
});

test('goldenStatus picks the current or next golden hour', async () => {
  const { goldenStatus, firstAfter } = await import('./skyLogic.js');
  const H = (h) => new Date(Date.UTC(2026, 10, 6, h));
  const today = { sunrise: H(1), goldenHourEnd: H(2), goldenHourStart: H(11), sunset: H(12) };
  const tomorrow = { sunrise: H(25), goldenHourEnd: H(26), goldenHourStart: H(35), sunset: H(36) };
  assert.deepEqual(goldenStatus(H(0), today, tomorrow), { which: 'morning', start: H(1), end: H(2), active: false });
  assert.equal(goldenStatus(new Date(H(1).getTime() + 60000), today, tomorrow).active, true);
  const ev = goldenStatus(H(5), today, tomorrow);
  assert.equal(ev.which, 'evening'); assert.equal(ev.active, false);
  const night = goldenStatus(H(13), today, tomorrow);
  assert.equal(night.which, 'morning'); assert.equal(night.start.getTime(), H(25).getTime());
  assert.equal(goldenStatus(H(40), today, tomorrow), null);
  assert.equal(goldenStatus(H(0), { sunrise: null, sunset: null }, null), null);
  assert.equal(firstAfter(H(5), [H(3), null, H(9), H(7)]).getTime(), H(7).getTime());
  assert.equal(firstAfter(H(50), [H(3)]), null);
});
