import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LANES, laneX, PLAYER, VEHICLES, createRng, pickKind, speedAt, spawnGapAt, overlaps, lateralGap,
  findWall, resolveWall, predictWall, wallMembersAt, pickSpawnLane, canChangeLane, pickCoinLane, trackVehicle, registerNearMiss,
  comboMultiplier, nearMissPoints, scoreFor, MAX_SCORE, stepNitro, dayNight, SPAWN_Z, laneClear, kmh, shareText,
} from './logic.js';

const veh = (kind, lane, z, extra = {}) => ({ kind, lane, targetLane: null, x: laneX(lane), z, ...VEHICLES[kind], active: true, close: false, passed: false, ...extra });
const player = (lane = 1) => ({ x: laneX(lane), z: 0, w: PLAYER.w, l: PLAYER.l, lane });

test('lanes are symmetric around the road centre', () => {
  assert.equal(laneX(1), 0);
  assert.equal(laneX(0), -laneX(LANES - 1));
});

test('difficulty ramps up but stays bounded', () => {
  assert.ok(speedAt(0) < speedAt(3000));
  assert.ok(speedAt(1e7) < 60);
  assert.ok(spawnGapAt(0) > spawnGapAt(5000));
  assert.ok(spawnGapAt(1e7) >= 12);
  assert.equal(kmh(25), 90);
});

test('overlap and lateral gap', () => {
  const p = player(1);
  assert.ok(overlaps(veh('car', 1, -1), p));
  assert.ok(!overlaps(veh('car', 0, 0), p));
  assert.ok(lateralGap(veh('car', 0, 0), p) > 1);
});

test('findWall spots three blocked lanes and ignores staggered traffic', () => {
  const wall = [veh('truck', 0, -60), veh('car', 1, -62), veh('bus', 2, -58)];
  assert.ok(findWall(wall));
  const staggered = [veh('truck', 0, -40), veh('car', 1, -80), veh('bus', 2, -130)];
  assert.equal(findWall(staggered), null);
  // a vehicle changing lane occupies both lanes
  const changing = [veh('car', 0, -60, { targetLane: 1 }), veh('truck', 2, -60)];
  assert.ok(findWall(changing));
  // inactive vehicles are ignored
  assert.equal(findWall([veh('truck', 0, -60), veh('car', 1, -60), veh('bus', 2, -60, { active: false })]), null);
});

test('resolveWall removes hidden walls and accelerates visible ones away', () => {
  const far = [veh('truck', 0, -150), veh('car', 1, -152), veh('bus', 2, -149)];
  const r1 = resolveWall(far, findWall(far));
  assert.equal(r1.action, 'despawn');
  assert.equal(r1.vehicle, far[1]);
  const near = [veh('truck', 0, -40), veh('car', 1, -42), veh('bus', 2, -38)];
  assert.equal(resolveWall(near, findWall(near)).action, 'speedup');
});

test('pickSpawnLane never completes a wall and keeps same-lane spacing', () => {
  const two = [veh('truck', 0, SPAWN_Z + 3), veh('car', 1, SPAWN_Z - 2)];
  assert.equal(pickSpawnLane(two, SPAWN_Z, VEHICLES.car.l, () => 0), -1);
  const one = [veh('truck', 0, SPAWN_Z)];
  for (let i = 0; i < 20; i++) {
    const lane = pickSpawnLane(one, SPAWN_Z, 4.2, Math.random);
    assert.notEqual(lane, 0);
  }
});

test('simulated spawning never lets an impassable wall reach the player', () => {
  const rng = createRng(42);
  const vehicles = [];
  const members = [];
  let lastZ = 0;
  for (let step = 0; step < 6000; step++) {
    const dz = 0.6;
    for (const v of vehicles) { v.vz = dz * (1 - v.speedFrac); v.z += v.vz; }
    for (let i = vehicles.length - 1; i >= 0; i--) if (vehicles[i].z > 20) vehicles.splice(i, 1);
    lastZ += dz;
    if (lastZ > spawnGapAt(6000)) {
      const kind = pickKind(rng, 6000);
      const lane = pickSpawnLane(vehicles, SPAWN_Z, VEHICLES[kind].l, rng);
      if (lane >= 0) {
        vehicles.push(veh(kind, lane, SPAWN_Z, { speedFrac: VEHICLES[kind].speed[0] + rng() * 0.15, vz: 0 }));
        lastZ = 0;
      }
    }
    // runtime wall breakers, as in the engine
    const w = findWall(vehicles);
    if (w) {
      const r = resolveWall(vehicles, w);
      if (r.action === 'despawn') r.vehicle.active = false; else r.vehicle.speedFrac = 1.15;
      for (let i = vehicles.length - 1; i >= 0; i--) if (!vehicles[i].active) vehicles.splice(i, 1);
    } else if (step % 5 === 0) {
      const p = predictWall(vehicles, 160, 8);
      if (p) {
        wallMembersAt(vehicles, p.anchor, p.t, members);
        const f = members.reduce((m, v) => Math.max(m, v.speedFrac), 0);
        for (const m of members) m.speedFrac = f;
      }
    }
    assert.equal(findWall(vehicles, null, -8, undefined, -45), null, `wall at step ${step}`);
  }
});

test('predictWall sees converging traffic before the wall forms', () => {
  const vs = [veh('truck', 0, -100, { vz: 10 }), veh('car', 1, -60, { vz: 2 }), veh('bus', 2, -60, { vz: 2 })];
  assert.equal(findWall(vs), null);
  const p = predictWall(vs, 6, 0.5);
  assert.ok(p && p.t <= 5);
  assert.equal(vs[0].z, -100, 'positions restored');
});

test('traffic lane changes are refused when they would cut in or wall the road', () => {
  const v = veh('car', 0, -60);
  assert.ok(canChangeLane([v], v, 1));
  assert.ok(!canChangeLane([v], v, -1));
  const close = veh('car', 0, -20);
  assert.ok(!canChangeLane([close], close, 1), 'too close to the player');
  const blocker = veh('truck', 1, -62);
  assert.ok(!canChangeLane([v, blocker], v, 1), 'target lane busy');
  const other = veh('bus', 2, -60);
  const v2 = veh('car', 0, -60);
  assert.ok(!canChangeLane([v2, other], v2, 1), 'would create a wall');
  assert.ok(!canChangeLane([v], v, 1, { lane: 1 }) || v.z <= -45);
});

test('coins go in a clear lane', () => {
  const vs = [veh('truck', 0, -150), veh('bus', 1, -150)];
  assert.equal(pickCoinLane(vs, -150, 30, () => 0), 2);
  assert.ok(laneClear(vs, 2, -200, 0));
});

test('near miss: dodging a vehicle late counts, passing far away does not', () => {
  const p = player(1);
  const ahead = veh('car', 1, -9); // 9 m nose-to-tail gap less than the near window
  assert.equal(trackVehicle(ahead, p, 15), null);
  assert.ok(ahead.close);
  // the player swerves to lane 0, vehicle passes alongside and behind
  p.x = laneX(0);
  ahead.z = 0; assert.equal(trackVehicle(ahead, p, 15), null);
  ahead.z = 6; assert.equal(trackVehicle(ahead, p, 15), 'near');
  assert.equal(trackVehicle(ahead, p, 15), null, 'only once');

  const far = veh('car', 2, -30);
  const p2 = player(0);
  for (let z = -30; z <= 8; z += 1) { far.z = z; assert.notEqual(trackVehicle(far, p2, 15), 'crash'); }
  assert.equal(far.close, false);
  assert.ok(far.passed);
});

test('near miss: squeezing past a wide truck in the next lane counts', () => {
  const p = player(1);
  p.x = laneX(1) - 0.6; // mid lane-change towards the truck
  const t = veh('truck', 0, 0);
  assert.equal(trackVehicle(t, p, 15), null);
  assert.ok(t.close);
});

test('collision is detected', () => {
  assert.equal(trackVehicle(veh('auto', 1, -1), player(1), 10), 'crash');
});

test('scoring and combos', () => {
  assert.equal(comboMultiplier(0), 1);
  assert.equal(comboMultiplier(9), 5);
  assert.equal(nearMissPoints(1), 50);
  assert.equal(nearMissPoints(3), 150);
  const s = { combo: 0, lastNear: -99, bonus: 0, nearMisses: 0 };
  assert.equal(registerNearMiss(s, 1), 50);
  assert.equal(registerNearMiss(s, 3), 100);
  assert.equal(registerNearMiss(s, 10), 50, 'combo resets after the window');
  assert.equal(s.nearMisses, 3);
  assert.equal(s.bonus, 200);
  assert.equal(scoreFor(1234.9, 200), 1434);
  assert.equal(scoreFor(1e9, 0), MAX_SCORE);
  assert.ok(Number.isInteger(scoreFor(10.5, 0.5)));
});

test('nitro drains while boosting and refills slowly', () => {
  assert.ok(stepNitro(1, true, 1) < 0.7);
  assert.equal(stepNitro(0.01, true, 1), 0);
  assert.ok(stepNitro(0.5, false, 1) < 0.6);
  assert.equal(stepNitro(1, false, 5), 1);
});

test('day turns to dusk then night as distance grows', () => {
  assert.deepEqual(dayNight(0), { dusk: 0, night: 0 });
  assert.equal(dayNight(1500).dusk, 1);
  assert.equal(dayNight(3000).night, 1);
  const mid = dayNight(1100);
  assert.ok(mid.dusk > 0 && mid.dusk < 1);
  assert.equal(dayNight(6000).night, 0);
});

test('pickKind returns known kinds', () => {
  const rng = createRng(7);
  for (let i = 0; i < 200; i++) assert.ok(VEHICLES[pickKind(rng, i * 100)]);
});

test('share text', () => {
  const t = shareText({ score: 12345, distance: 4200, nearMisses: 7 }, 'https://x/arcade/highway');
  assert.match(t, /4\.20 km/);
  assert.match(t, /7 near misses/);
});
