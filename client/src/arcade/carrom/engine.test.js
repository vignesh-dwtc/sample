import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createWorld, setBody, setupBoard, step, isMoving, momentum, kineticEnergy, clearEvents, countActive,
  predictContact, nearestFreeBaseX, overlapsAny, placeNear,
  SIZE, COIN_R, STRIKER_R, POCKETS, POCKET_R, T_STRIKER, T_WHITE, T_BLACK, T_QUEEN, BASE_Y, BASE_X0, BASE_X1, MAX_SHOT,
} from './engine.js';

const DT = 1 / 120;
const run = (w, seconds) => { for (let t = 0; t < seconds; t += DT) step(w, DT); };

/** World with only the given bodies active (others parked inactive). */
function world(bodies, opts) {
  const w = createWorld(opts);
  bodies.forEach(([type, x, y, vx = 0, vy = 0], i) => { setBody(w, i, type, x, y); w.vx[i] = vx; w.vy[i] = vy; });
  return w;
}
const frictionless = { friction: 0, damping: 0, stopSpeed: 0 };

test('standard set-up: 9 white, 9 black, 1 queen in the centre, nothing overlapping', () => {
  const w = setupBoard(createWorld());
  assert.equal(countActive(w, T_WHITE), 9);
  assert.equal(countActive(w, T_BLACK), 9);
  assert.equal(countActive(w, T_QUEEN), 1);
  assert.equal(w.type[0], T_STRIKER);
  for (let i = 0; i < w.n; i++) assert.equal(overlapsAny(w, i, w.x[i], w.y[i], 0), false, `body ${i} overlaps`);
  const q = [...w.type].indexOf(T_QUEEN);
  assert.equal(w.x[q], SIZE / 2); assert.equal(w.y[q], SIZE / 2);
  assert.equal(isMoving(w), false);
});

test('head-on collision conserves momentum and (with e=1) energy; heavier striker keeps going', () => {
  const w = world([[T_STRIKER, 300, 500, 1200, 0], [T_WHITE, 500, 500]], { ...frictionless, eCoin: 1 });
  const p0 = momentum(w), e0 = kineticEnergy(w);
  run(w, 0.3);
  const p1 = momentum(w);
  assert.ok(Math.abs(p1[0] - p0[0]) < 1e-6 && Math.abs(p1[1] - p0[1]) < 1e-6, 'momentum conserved');
  assert.ok(Math.abs(kineticEnergy(w) - e0) / e0 < 1e-9, 'energy conserved for e=1');
  // 1-D elastic: v1' = (m1-m2)/(m1+m2)·u, v2' = 2m1/(m1+m2)·u
  const m1 = w.m[0], m2 = w.m[1];
  assert.ok(Math.abs(w.vx[0] - ((m1 - m2) / (m1 + m2)) * 1200) < 1e-6);
  assert.ok(Math.abs(w.vx[1] - ((2 * m1) / (m1 + m2)) * 1200) < 1e-6);
  assert.ok(w.vx[0] > 0, 'striker follows through (it is heavier)');
  assert.ok(w.vx[1] > 1200, 'coin flies off faster than the striker came in');
});

test('oblique collisions conserve momentum in 2-D; restitution < 1 loses energy', () => {
  const w = world([[T_STRIKER, 300, 480, 1500, 300], [T_BLACK, 500, 520], [T_WHITE, 560, 470]], { ...frictionless, eCoin: 0.9 });
  const p0 = momentum(w), e0 = kineticEnergy(w);
  run(w, 0.25);
  const p1 = momentum(w);
  assert.ok(Math.abs(p1[0] - p0[0]) < 1e-6);
  assert.ok(Math.abs(p1[1] - p0[1]) < 1e-6);
  assert.ok(kineticEnergy(w) < e0);
  assert.ok(w.hitCount >= 1);
  assert.equal(w.firstContact > 0, true);
});

test('coin–coin collision of equal masses exchanges velocity (e=1)', () => {
  const w = world([[T_STRIKER, 100, 100], [T_WHITE, 300, 500, 800, 0], [T_BLACK, 400, 500]], { ...frictionless, eCoin: 1 });
  w.active[0] = 0;
  run(w, 0.2);
  assert.ok(Math.abs(w.vx[1]) < 1e-6);
  assert.ok(Math.abs(w.vx[2] - 800) < 1e-6);
});

test('no tunnelling: a full-power (and absurdly fast) striker still hits a coin in its path', () => {
  for (const speed of [MAX_SHOT, 20000, 80000]) {
    const w = world([[T_STRIKER, 100, 500, speed, 0], [T_WHITE, 250, 500]], frictionless);
    step(w, 0.05); // one long frame: the striker would jump far past the coin without substeps
    assert.equal(w.firstContact, 1, `coin hit at speed ${speed}`);
    assert.ok(w.lastSubsteps > 1);
  }
});

test('no tunnelling through cushions: bodies stay on the board', () => {
  const w = world([[T_STRIKER, 500, 500, 30000, -21000], [T_WHITE, 200, 600, -25000, 9000]], { ...frictionless, eWall: 1 });
  for (let k = 0; k < 120; k++) {
    step(w, DT);
    for (let i = 0; i < 2; i++) {
      if (!w.active[i]) continue;
      assert.ok(w.x[i] >= w.r[i] - 1e-9 && w.x[i] <= SIZE - w.r[i] + 1e-9);
      assert.ok(w.y[i] >= w.r[i] - 1e-9 && w.y[i] <= SIZE - w.r[i] + 1e-9);
    }
  }
});

test('cushion rebound reverses the normal velocity with energy loss', () => {
  const w = world([[T_STRIKER, 100, 100], [T_WHITE, 500, 200, 0, -900]], { ...frictionless, eWall: 0.72 });
  w.active[0] = 0;
  run(w, 0.4);
  assert.ok(w.vy[1] > 0, 'bounced');
  assert.ok(Math.abs(w.vy[1] - 900 * 0.72) < 1e-6);
  assert.ok(w.hitCount >= 1 && w.hitB[0] === -1, 'cushion hit event');
});

test('friction brings everything to rest', () => {
  const w = setupBoard(createWorld());
  w.vx[0] = 300; w.vy[0] = -MAX_SHOT;
  let t = 0;
  while (isMoving(w) && t < 20) { step(w, DT); t += DT; clearEvents(w); }
  assert.equal(isMoving(w), false, 'stopped');
  assert.ok(t < 10, `settles in a sensible time (${t.toFixed(2)}s)`);
  for (let i = 0; i < w.n; i++) if (w.active[i]) assert.equal(w.vx[i] + w.vy[i], 0);
});

test('friction: a lone coin decelerates monotonically and stops', () => {
  const w = world([[T_STRIKER, 100, 100], [T_WHITE, 200, 500, 600, 0]]);
  w.active[0] = 0;
  let prev = 600;
  for (let k = 0; k < 600; k++) {
    step(w, DT);
    assert.ok(w.vx[1] <= prev);
    prev = w.vx[1];
  }
  assert.equal(w.vx[1], 0);
  assert.ok(w.x[1] > 300 && w.x[1] < SIZE - COIN_R);
});

test('pocket detection: a coin rolling into a corner drops and records an event', () => {
  const [px, py] = [POCKETS[6], POCKETS[7]]; // bottom-right
  const w = world([[T_STRIKER, 100, 100], [T_BLACK, px - 200, py - 200, 900, 900]]);
  w.active[0] = 0;
  run(w, 1.5);
  assert.equal(w.active[1], 0);
  assert.equal(w.pocketCount, 1);
  assert.equal(w.pocketIdx[0], 1);
  assert.equal(w.pocketHole[0], 3);
});

test('pocket detection: a coin near (but not in) the pocket stays on the board', () => {
  const w = world([[T_STRIKER, 100, 100], [T_WHITE, POCKETS[0] + POCKET_R + 2, POCKETS[1] + 5]]);
  w.active[0] = 0;
  w.vx[1] = 0.0; // at rest just outside
  run(w, 0.2);
  assert.equal(w.active[1], 1);
  assert.equal(w.pocketCount, 0);
});

test('the striker can be pocketed too (foul)', () => {
  const w = world([[T_STRIKER, 200, 200, -800, -800]]);
  run(w, 1);
  assert.equal(w.active[0], 0);
  assert.equal(w.pocketIdx[0], 0);
});

test('predictContact finds the first coin and the target direction', () => {
  const w = world([[T_STRIKER, 500, 800], [T_WHITE, 500, 500], [T_BLACK, 500, 300]]);
  const out = new Float64Array(8);
  predictContact(w, 500, 800, 0, -1, out);
  assert.equal(out[5], 1);
  assert.ok(Math.abs(out[1] - (500 + COIN_R + STRIKER_R)) < 1e-9);
  assert.ok(Math.abs(out[3] + 1) < 1e-9, 'coin pushed straight up');
  predictContact(w, 500, 800, 0, 1, out);
  assert.equal(out[5], -1, 'aiming backwards hits the cushion');
  assert.ok(Math.abs(out[1] - (SIZE - STRIKER_R)) < 1e-9);
});

test('striker placement avoids coins and stays on the baseline', () => {
  const w = world([[T_STRIKER, 500, BASE_Y], [T_WHITE, 500, BASE_Y]]);
  const x = nearestFreeBaseX(w, 500);
  assert.ok(Math.abs(x - 500) >= COIN_R + STRIKER_R);
  assert.equal(overlapsAny(w, 0, x, BASE_Y), false);
  assert.equal(nearestFreeBaseX(w, -50), BASE_X0);
  assert.equal(nearestFreeBaseX(w, 5000), BASE_X1);
});

test('placeNear returns the queen to the centre, or the nearest free spot', () => {
  const w = setupBoard(createWorld());
  const q = [...w.type].indexOf(T_QUEEN);
  w.active[q] = 0;
  assert.equal(placeNear(w, q, SIZE / 2, SIZE / 2), true);
  assert.equal(w.x[q], SIZE / 2);
  // occupy the centre with another coin
  w.active[q] = 0;
  const other = [...w.type].indexOf(T_WHITE);
  w.x[other] = SIZE / 2; w.y[other] = SIZE / 2;
  assert.equal(placeNear(w, q, SIZE / 2, SIZE / 2), true);
  assert.equal(overlapsAny(w, q, w.x[q], w.y[q], 0), false);
});

test('a hard break scatters the formation without NaNs', () => {
  const w = setupBoard(createWorld());
  w.vy[0] = -MAX_SHOT;
  let t = 0;
  while (isMoving(w) && t < 15) { step(w, DT); t += DT; }
  for (let i = 0; i < w.n; i++) assert.ok(Number.isFinite(w.x[i]) && Number.isFinite(w.y[i]));
  const moved = [...w.x].filter((x, i) => i > 0 && Math.abs(x - SIZE / 2) > 120).length;
  assert.ok(moved >= 4, 'coins scattered');
});
