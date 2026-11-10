// Highway Rush — pure game rules (no three.js, no DOM). Unit-tested in logic.test.js.
//
// World units are metres. The player sits at z = 0 and "drives" toward -z; everything else
// (traffic, road, props) moves toward +z at the closing speed, so numbers stay small forever.

export const LANES = 3;
export const LANE_W = 3.2;
export const ROAD_HALF = (LANES * LANE_W) / 2;
export const PLAYER = { w: 1.86, l: 4.3 };
export const SPAWN_Z = -175;
export const MAX_SCORE = 50000;

/** Centre x of a lane (0 = left lane, India drives on the left; the median is on the right). */
export const laneX = (lane) => (lane - (LANES - 1) / 2) * LANE_W;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);

/**
 * Traffic catalogue. `speed` is a fraction of the player's cruising speed at spawn time,
 * so the closing speed scales with difficulty. `weight` is the spawn probability weight.
 */
export const VEHICLES = {
  car: { w: 1.8, l: 4.2, speed: [0.46, 0.62], weight: 34, canChange: true },
  auto: { w: 1.45, l: 2.8, speed: [0.24, 0.32], weight: 15, canChange: true },
  bike: { w: 0.8, l: 2.0, speed: [0.38, 0.52], weight: 12, canChange: true },
  truck: { w: 2.5, l: 8.4, speed: [0.3, 0.4], weight: 23, canChange: false },
  bus: { w: 2.6, l: 11, speed: [0.36, 0.46], weight: 16, canChange: false },
};
export const VEHICLE_KINDS = Object.keys(VEHICLES);

/** Small seeded PRNG (mulberry32) so tests and the intro scene are reproducible. */
export function createRng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickKind(rng = Math.random, distance = 0) {
  // Heavy vehicles get a little more common as the run goes on.
  const heavy = 1 + clamp(distance / 8000, 0, 0.6);
  let total = 0;
  for (const k of VEHICLE_KINDS) total += VEHICLES[k].weight * (k === 'truck' || k === 'bus' ? heavy : 1);
  let r = rng() * total;
  for (const k of VEHICLE_KINDS) {
    r -= VEHICLES[k].weight * (k === 'truck' || k === 'bus' ? heavy : 1);
    if (r <= 0) return k;
  }
  return 'car';
}

// ---------------------------------------------------------------- difficulty
/** Cruising speed in m/s for the distance driven: 90 km/h at the start → ~200 km/h. */
export const speedAt = (distance) => 25 + 31 * (1 - Math.exp(-Math.max(0, distance) / 5200));
/** Spacing (metres, along z) between traffic spawns: dense traffic later on. */
export const spawnGapAt = (distance) => lerp(30, 12.5, clamp(distance / 7000, 0, 1));
export const NITRO_MULT = 1.45;
export const kmh = (ms) => Math.round(ms * 3.6);

// ---------------------------------------------------------------- geometry helpers
/** Bit mask of lanes a vehicle occupies (both lanes while it is changing lane). */
export const laneMask = (v) => (1 << v.lane) | (v.targetLane != null && v.targetLane !== v.lane ? 1 << v.targetLane : 0);
export const ALL_LANES = (1 << LANES) - 1;

/** Axis-aligned overlap in x/z, shrunk a little so grazes feel fair. */
export function overlaps(a, b, shrink = 0.86) {
  return Math.abs(a.x - b.x) < ((a.w + b.w) / 2) * shrink && Math.abs(a.z - b.z) < ((a.l + b.l) / 2) * 0.94;
}

/** Side-by-side clearance in metres (negative = overlapping in x). */
export const lateralGap = (a, b) => Math.abs(a.x - b.x) - (a.w + b.w) / 2;

/** Is `lane` clear of vehicles between zFrom and zTo (zFrom < zTo)? */
export function laneClear(vehicles, lane, zFrom, zTo, ignore = null) {
  for (const v of vehicles) {
    if (v === ignore || !v.active) continue;
    if (!(laneMask(v) & (1 << lane))) continue;
    if (v.z + v.l / 2 > zFrom && v.z - v.l / 2 < zTo) return false;
  }
  return true;
}

// ---------------------------------------------------------------- spawn fairness
/** Padding around a vehicle within which other lanes count as "blocked" for wall checks. */
export const WALL_PAD = 9;

/**
 * Find a "wall": a stretch of road ahead where every lane is blocked so the player cannot pass.
 * Considers vehicles with z < zMax (ahead of the player). `extra` is an optional hypothetical
 * vehicle. Returns the anchor vehicle (or `extra`) or null.
 */
export function findWall(vehicles, extra = null, zMax = -6, pad = WALL_PAD, zMin = -Infinity) {
  const n = vehicles.length;
  for (let i = -1; i < n; i++) {
    const a = i < 0 ? extra : vehicles[i];
    if (!a || (i >= 0 && !a.active) || a.z > zMax || a.z < zMin) continue;
    const lo = a.z - a.l / 2 - pad, hi = a.z + a.l / 2 + pad;
    let mask = 0;
    for (let j = -1; j < n; j++) {
      const b = j < 0 ? extra : vehicles[j];
      if (!b || (j >= 0 && !b.active) || b.z > zMax || b.z < zMin) continue;
      if (b.z + b.l / 2 > lo && b.z - b.l / 2 < hi) mask |= laneMask(b);
    }
    if ((mask & ALL_LANES) === ALL_LANES) return a;
  }
  return null;
}

/** Collect the members of the wall anchored at `a` into `out` (reused array). */
export function wallMembers(vehicles, a, out = [], pad = WALL_PAD) {
  out.length = 0;
  const lo = a.z - a.l / 2 - pad, hi = a.z + a.l / 2 + pad;
  for (const b of vehicles) if (b.active && b.z + b.l / 2 > lo && b.z - b.l / 2 < hi) out.push(b);
  return out;
}

/**
 * Decide how to break a wall: despawn the farthest member if it is still hidden in the fog,
 * otherwise make the farthest member accelerate away.
 */
export function resolveWall(vehicles, anchor, out = []) {
  const members = wallMembers(vehicles, anchor, out);
  let far = null;
  for (const m of members) if (!far || m.z < far.z) far = m;
  if (!far) return null;
  return { vehicle: far, action: far.z < -70 ? 'despawn' : 'speedup' };
}

/**
 * Look ahead in time for walls that will form as vehicles with different speeds converge.
 * Each vehicle needs `vz` (its current z velocity relative to the player, + toward the player).
 * Positions are restored before returning. Returns { anchor, t } for the first predicted wall.
 */
export function predictWall(vehicles, horizon = 6, step = 0.5, zMax = -6) {
  let found = null;
  for (let t = step; t <= horizon + 1e-9 && !found; t += step) {
    for (const v of vehicles) { v._z = v.z; v.z += (v.vz || 0) * t; }
    const a = findWall(vehicles, null, zMax);
    if (a) found = { anchor: a, t };
    for (const v of vehicles) v.z = v._z;
  }
  return found;
}

/** Freeze a predicted wall: members found at time t get the same speed so they never close up. */
export function wallMembersAt(vehicles, anchor, t, out = []) {
  for (const v of vehicles) { v._z = v.z; v.z += (v.vz || 0) * t; }
  wallMembers(vehicles, anchor, out);
  for (const v of vehicles) v.z = v._z;
  return out;
}

const _probe = { lane: 0, targetLane: null, x: 0, z: 0, w: 2, l: 4, active: true };
export const SAME_LANE_GAP = 10;

/**
 * Pick a lane for a new vehicle of length `len` at `z`, or -1 if no lane is fair right now.
 * A lane is fair if it keeps a safe gap to vehicles in that lane and does not complete a wall.
 */
export function pickSpawnLane(vehicles, z, len, rng = Math.random) {
  const start = Math.floor(rng() * LANES);
  for (let k = 0; k < LANES; k++) {
    const lane = (start + k) % LANES;
    if (!laneClear(vehicles, lane, z - len / 2 - SAME_LANE_GAP, z + len / 2 + SAME_LANE_GAP)) continue;
    _probe.lane = lane; _probe.targetLane = null; _probe.z = z; _probe.l = len; _probe.x = laneX(lane);
    if (findWall(vehicles, _probe, 1e9)) continue;
    return lane;
  }
  return -1;
}

/** Can traffic vehicle `v` start moving into `target` without a cut-in or a wall? */
export function canChangeLane(vehicles, v, target, player = null) {
  if (target < 0 || target >= LANES || target === v.lane || v.z > -32 || v.z < -120) return false;
  if (!laneClear(vehicles, target, v.z - v.l / 2 - 8, v.z + v.l / 2 + 8, v)) return false;
  if (player && player.lane === target && v.z > -45) return false;
  const saved = v.targetLane;
  v.targetLane = target;
  const wall = findWall(vehicles, null, 1e9);
  v.targetLane = saved;
  return !wall;
}

/** Choose a free lane for a row of coins starting at z (extending `len` metres ahead). */
export function pickCoinLane(vehicles, z, len, rng = Math.random) {
  const start = Math.floor(rng() * LANES);
  for (let k = 0; k < LANES; k++) {
    const lane = (start + k) % LANES;
    if (laneClear(vehicles, lane, z - len - 12, z + 12)) return lane;
  }
  return -1;
}

// ---------------------------------------------------------------- near misses & collisions
export const NEAR_SIDE = 0.75; // metres of side clearance that count as a near miss

/** Distance in front of the player that counts as "it was right in front of you". */
export const nearFrontAt = (closing) => 6 + clamp(closing, 0, 60) * 0.3;

/**
 * Update near-miss tracking for traffic vehicle `v` against player `p` (both {x,z,w,l}).
 * Mutates v.close / v.passed. Returns 'crash', 'near' (just passed after a close call) or null.
 */
export function trackVehicle(v, p, closing) {
  if (overlaps(v, p)) return 'crash';
  if (v.passed) return null;
  const halfW = (v.w + p.w) / 2;
  const dx = Math.abs(v.x - p.x);
  const gapFront = (p.z - p.l / 2) - (v.z + v.l / 2); // >0 while v is ahead of the player's nose
  if (gapFront > 0 && gapFront < nearFrontAt(closing) && dx < halfW * 0.95) v.close = true;
  const zOverlap = Math.abs(v.z - p.z) < (v.l + p.l) / 2;
  if (zOverlap && dx - halfW < NEAR_SIDE) v.close = true;
  if (v.z - v.l / 2 > p.z + p.l / 2) {
    v.passed = true;
    return v.close ? 'near' : null;
  }
  return null;
}

// ---------------------------------------------------------------- scoring
export const NEAR_POINTS = 50;
export const COIN_POINTS = 20;
export const COMBO_WINDOW = 4; // seconds between near misses to keep a combo going
export const comboMultiplier = (combo) => clamp(combo, 1, 5);
export const nearMissPoints = (combo) => NEAR_POINTS * comboMultiplier(combo);
export const scoreFor = (distance, bonus) => Math.min(MAX_SCORE, Math.max(0, Math.floor(distance) + Math.floor(bonus)));

/** Register a near miss at time `t` (seconds). Mutates and returns state {combo, lastNear, bonus, nearMisses}. */
export function registerNearMiss(state, t) {
  state.combo = t - state.lastNear <= COMBO_WINDOW ? state.combo + 1 : 1;
  state.lastNear = t;
  state.nearMisses += 1;
  const pts = nearMissPoints(state.combo);
  state.bonus += pts;
  return pts;
}

// ---------------------------------------------------------------- nitro
export const NITRO_MIN = 0.22;
export const NITRO_DRAIN = 0.36; // per second while boosting
export const NITRO_REFILL = 0.045; // per second
export function stepNitro(n, active, dt) {
  return clamp(n + (active ? -NITRO_DRAIN : NITRO_REFILL) * dt, 0, 1);
}

// ---------------------------------------------------------------- day / night
export const CYCLE = 6000;
const SKY_KEYS = [
  // [metres, dusk, night]
  [0, 0, 0], [700, 0, 0], [1500, 1, 0], [2300, 1, 1], [4500, 1, 1], [5200, 1, 0], [5700, 0, 0], [CYCLE, 0, 0],
];
/** Day → dusk → night → dawn as distance grows. Returns weights in 0..1 (out is reused). */
export function dayNight(distance, out = { dusk: 0, night: 0 }) {
  const t = ((distance % CYCLE) + CYCLE) % CYCLE;
  for (let i = 1; i < SKY_KEYS.length; i++) {
    const [b, bd, bn] = SKY_KEYS[i];
    if (t <= b) {
      const [a, ad, an] = SKY_KEYS[i - 1];
      const k = smooth((t - a) / (b - a));
      out.dusk = lerp(ad, bd, k);
      out.night = lerp(an, bn, k);
      return out;
    }
  }
  out.dusk = 0; out.night = 0;
  return out;
}

export const formatKm = (m) => (m / 1000).toFixed(2);

export function shareText({ score, distance, nearMisses }, url) {
  return `🛣️ Highway Rush: ${score.toLocaleString('en-IN')} pts, ${formatKm(distance)} km and ${nearMisses} near misses on PlayNest! Can you beat me? ${url}`;
}
