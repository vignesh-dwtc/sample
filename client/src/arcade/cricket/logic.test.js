import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeRng, planDelivery, deliveryPath, ballAt, timingOf, decideShot, launchFor, stepBall, newInnings, applyBall,
  flavour, shareText, strikeRate, oversText, meterPos, BALL_R, CONTACT_Z, ROPE_R, STANDS_R, MAX_BALLS, WINDOWS,
} from './logic.js';

test('rng is deterministic and in range', () => {
  const a = makeRng(42), b = makeRng(42);
  for (let i = 0; i < 100; i++) { const x = a(); assert.equal(x, b()); assert.ok(x >= 0 && x < 1); }
});

test('deliveries are varied and realistic', () => {
  const rng = makeRng(7);
  const kinds = new Set(), lengths = new Set();
  for (let i = 0; i < 300; i++) {
    const d = planDelivery(rng, i % 12);
    kinds.add(d.kind); lengths.add(d.length);
    if (d.kind === 'pace') assert.ok(d.speedKmh >= 120 && d.speedKmh <= 150);
    else assert.ok(d.speedKmh >= 70 && d.speedKmh <= 100);
    const p = deliveryPath(d);
    assert.ok(p.t1 > 0 && p.tc > p.t1 && p.ts > p.tc, 'bounce, then contact, then stumps');
    assert.ok(p.tc > 0.3 && p.tc < 1.2, `contact time ${p.tc}`);
    const o = { x: 0, y: 0, z: 0 };
    ballAt(p, 0, o);
    assert.ok(Math.abs(o.z - d.release.z) < 1e-9 && Math.abs(o.y - d.release.y) < 1e-9);
    ballAt(p, p.t1, o);
    assert.ok(Math.abs(o.y - BALL_R) < 1e-6, 'ball meets the pitch at the bounce point');
    assert.ok(Math.abs(o.x - d.bounce.x) < 1e-6 && Math.abs(o.z - d.bounce.z) < 1e-6);
    ballAt(p, p.tc, o);
    assert.ok(Math.abs(o.z - CONTACT_Z) < 1e-6);
    assert.ok(o.y >= BALL_R && o.y < 2.6, `contact height ${o.y}`);
  }
  assert.deepEqual([...kinds].sort(), ['pace', 'spin']);
  assert.equal(lengths.size, 5);
});

test('bouncers rise higher than yorkers at the batter', () => {
  const base = { kind: 'pace', speedKmh: 140, swing: 0, turn: 0, release: { x: 0.3, y: 2.25, z: -18.8 } };
  const y = deliveryPath({ ...base, length: 'Yorker', bounce: { x: 0, z: -1.8 } });
  const b = deliveryPath({ ...base, length: 'Bouncer', bounce: { x: 0, z: -10.5 } });
  assert.ok(b.contactY > 1.2 && y.contactY < 0.4);
  assert.equal(y.hitsStumps, true, 'straight yorker hits the stumps');
  assert.equal(b.hitsStumps, false, 'bouncer goes over');
});

test('timing grades', () => {
  assert.equal(timingOf(0).grade, 'perfect');
  assert.equal(timingOf(-0.06).grade, 'good');
  assert.equal(timingOf(-0.06).side, 'early');
  assert.equal(timingOf(0.11).grade, 'ok');
  assert.equal(timingOf(0.11).side, 'late');
  assert.equal(timingOf(0.17).grade, 'edge');
  assert.equal(timingOf(0.4).grade, 'miss');
  assert.equal(meterPos(0), 0);
  assert.equal(meterPos(1), 1);
  assert.equal(meterPos(null), null);
});

test('no shot: bowled only when the ball hits the stumps', () => {
  const rng = makeRng(1);
  const d = { kind: 'pace', speedKmh: 140, length: 'Full', swing: 0, turn: 0, release: { x: 0, y: 2.2, z: -18.8 }, bounce: { x: 0, z: -3 } };
  const p = deliveryPath(d);
  assert.equal(p.hitsStumps, true);
  assert.equal(decideShot({ diff: null, delivery: d, path: p }, rng).result, 'bowled');
  const wide = { ...d, bounce: { x: 0.9, z: -3 } };
  assert.equal(decideShot({ diff: null, delivery: wide, path: deliveryPath(wide) }, rng).result, 'beaten');
  assert.equal(decideShot({ diff: 0.5, delivery: d, path: p }, rng).wicket, true);
});

test('perfect timing scores boundaries far more often than poor timing', () => {
  const rng = makeRng(99);
  const tally = (diff, loft) => {
    let runs = 0, wickets = 0, sixes = 0;
    for (let i = 0; i < 2000; i++) {
      const d = planDelivery(rng, i);
      const o = decideShot({ diff, delivery: d, path: deliveryPath(d), aim: { az: 0, loft } }, rng);
      runs += o.wicket ? 0 : o.runs; wickets += o.wicket ? 1 : 0; sixes += o.result === '6' ? 1 : 0;
      assert.ok([0, 1, 2, 4, 6].includes(o.runs));
    }
    return { avg: runs / 2000, wickets, sixes };
  };
  const perfectLoft = tally(0, true), perfectGround = tally(0.01, false), late = tally(0.12, false), edge = tally(-0.17, true);
  assert.ok(perfectLoft.avg > 5, `perfect loft avg ${perfectLoft.avg}`);
  assert.ok(perfectLoft.sixes > perfectGround.sixes);
  assert.ok(perfectGround.avg > 3);
  assert.ok(late.avg < 1.6 && late.avg > 0.3, `late avg ${late.avg}`);
  assert.ok(edge.wickets > perfectLoft.wickets);
  assert.ok(edge.avg < late.avg + 0.8);
});

test('timing pulls the shot direction and edges fly behind', () => {
  const d = { kind: 'pace', speedKmh: 135, length: 'Good length', swing: 0, turn: 0, release: { x: 0.3, y: 2.2, z: -18.8 }, bounce: { x: 0.8, z: -5 } };
  const p = deliveryPath(d);
  let early = 0, late = 0;
  for (let i = 0; i < 200; i++) {
    const a = decideShot({ diff: -WINDOWS.good + 0.001, delivery: d, path: p, aim: { az: 0, loft: false } }, makeRng(i));
    const b = decideShot({ diff: WINDOWS.good - 0.001, delivery: d, path: p, aim: { az: 0, loft: false } }, makeRng(i));
    early += a.az; late += b.az;
    for (const o of [a, b]) if (o.edged) assert.ok(Math.abs(o.az) > 2.5);
  }
  assert.ok(early < 0 && late > 0);
});

test('launch + stepBall: fours cross the rope along the ground, sixes carry into the stands', () => {
  const rng = makeRng(5);
  for (let i = 0; i < 40; i++) {
    for (const res of ['4', '6', '2', '1', 'dot']) {
      const az = (rng() - 0.5) * 2.4;
      const v = launchFor(res, az, rng);
      const b = { x: 0, y: 0.7, z: CONTACT_Z, ...v, rolling: false };
      let maxR = 0, firstLandR = null, maxY = 0;
      for (let t = 0; t < 12; t += 1 / 120) {
        stepBall(b, 1 / 120);
        const r = Math.hypot(b.x, b.z);
        maxR = Math.max(maxR, r); maxY = Math.max(maxY, b.y);
        if (firstLandR == null && b.y <= BALL_R + 1e-9 && t > 0.05) firstLandR = r;
        if (r > STANDS_R + 30) break;
      }
      if (res === '6') { assert.ok(firstLandR == null || firstLandR > ROPE_R + 2, `six landed at ${firstLandR}`); assert.ok(maxY > 10); }
      else if (res === '4') { assert.ok(maxR > ROPE_R, `four reached ${maxR}`); assert.ok(maxY < 6); }
      else assert.ok(maxR < ROPE_R - 5, `${res} rolled to ${maxR}`);
    }
  }
});

test('innings: 12 balls or 3 wickets, chips, stats', () => {
  let s = newInnings();
  const seq = [{ runs: 4 }, { runs: 6 }, { runs: 0, wicket: true }, { runs: 1 }, { runs: 0 }, { runs: 2 }, { runs: 6 }];
  for (const o of seq) s = applyBall(s, { wicket: false, ...o });
  assert.equal(s.runs, 19); assert.equal(s.wickets, 1); assert.equal(s.balls, 7);
  assert.equal(s.fours, 1); assert.equal(s.sixes, 2);
  assert.deepEqual(s.chips, ['6', 'W', '1', '•', '2', '6']);
  assert.equal(s.all.length, 7);
  assert.equal(s.done, false);
  assert.equal(oversText(s.balls), '1.1');
  assert.equal(strikeRate(s), 271.4);
  s = applyBall(s, { runs: 0, wicket: true });
  s = applyBall(s, { runs: 0, wicket: true });
  assert.equal(s.done, true);
  let t = newInnings();
  for (let i = 0; i < MAX_BALLS; i++) t = applyBall(t, { runs: 6, wicket: false });
  assert.equal(t.runs, 72); assert.equal(t.done, true);
  assert.match(shareText(t, 'https://x'), /72\/0 in 2\.0 overs/);
  assert.match(flavour(newInnings(), 30), /31/);
  assert.match(flavour(applyBall(newInnings(), { runs: 4, wicket: false })), /Need/);
});
