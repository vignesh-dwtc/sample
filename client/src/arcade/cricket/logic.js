// Cricket Blitz: pure game rules and physics helpers (no DOM, no three.js).
// World units are metres. The striker's stumps are at z = 0, the bowler's end is at z = -20.12,
// +x is screen-right when seen from behind the batter, +y is up.

export const G = 9.81;
export const BALL_R = 0.036;
export const PITCH_LEN = 20.12;
export const CONTACT_Z = -0.9; // where bat meets ball (just in front of the popping crease)
export const STUMP_HALF_W = 0.13; // stumps (0.23 m) plus ball radius
export const STUMP_H = 0.74;
export const ROPE_R = 64;
export const STANDS_R = 70;
export const ROLL_DECEL = 7.5; // m/s² on the outfield
export const SIM_SLOW = 0.8; // deliveries play at 80% of real time so they are hittable on a phone
export const MAX_BALLS = 12;
export const MAX_WICKETS = 3;

/** Small deterministic PRNG (mulberry32). Returns () => [0, 1). */
export function makeRng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** Pick from [{w, v}] weights. */
export function weighted(rng, table) {
  let total = 0;
  for (const e of table) total += e.w;
  let r = rng() * total;
  for (const e of table) { r -= e.w; if (r <= 0) return e.v; }
  return table[table.length - 1].v;
}

export const LENGTHS = [
  { name: 'Yorker', z: [-2.2, -1.6], w: 1.2 },
  { name: 'Full', z: [-4.2, -2.6], w: 2 },
  { name: 'Good length', z: [-7.0, -4.6], w: 3 },
  { name: 'Short', z: [-9.2, -7.4], w: 1.6 },
  { name: 'Bouncer', z: [-11, -9.6], w: 0.8 },
];

/**
 * Plan one delivery. ballNo (0-based) nudges variety: spinners bowl the middle overs' odd balls.
 * Returns plain data: speedKmh, kind ('pace'|'spin'), length name, bounce point, swing, turn, release.
 */
export function planDelivery(rng, ballNo = 0) {
  const spin = ballNo % 6 >= 3 ? rng() < 0.75 : rng() < 0.12;
  const len = weighted(rng, LENGTHS.map((l) => ({ w: spin && l.name === 'Bouncer' ? 0 : l.w, v: l })));
  const speedKmh = Math.round(spin ? lerp(76, 96, rng()) : lerp(124, 149, rng()));
  const bz = lerp(len.z[0], len.z[1], rng()) * (spin ? 0.8 : 1);
  // Line at the bounce: mostly at the stumps or just outside off (+x).
  const bx = lerp(-0.22, 0.42, rng());
  const swing = spin ? 0 : (rng() - 0.5) * 2 * lerp(0.6, 2.4, rng()); // lateral accel m/s² in the air
  const turn = spin ? (rng() < 0.5 ? -1 : 1) * lerp(0.4, 1.6, rng()) : (rng() - 0.5) * 0.5; // lateral m/s after bounce
  const relX = spin ? 0.25 : lerp(0.15, 0.55, rng()) * (rng() < 0.8 ? 1 : -1);
  return {
    kind: spin ? 'spin' : 'pace', speedKmh, length: len.name, bounce: { x: bx, z: bz }, swing, turn,
    release: { x: relX, y: spin ? 2.05 : 2.25, z: -PITCH_LEN + 1.3 },
    swingLabel: spin ? (turn > 0 ? 'Turning away' : 'Turning in') : Math.abs(swing) > 1.1 ? (swing > 0 ? 'Out-swinger' : 'In-swinger') : 'Seam up',
  };
}

/** Pre-compute the analytic flight of a delivery (real-time seconds, t = 0 at release). */
export function deliveryPath(d) {
  const v = d.speedKmh / 3.6;
  const { x: x0, y: y0, z: z0 } = d.release;
  const vz = v * 0.985;
  const t1 = (d.bounce.z - z0) / vz;
  const ax = d.swing;
  const vx = (d.bounce.x - x0 - 0.5 * ax * t1 * t1) / t1;
  const vy = (BALL_R - y0 + 0.5 * G * t1 * t1) / t1;
  const e = d.kind === 'spin' ? 0.52 : 0.6;
  const vyb = vy - G * t1;
  const p = {
    x0, y0, z0, vx, vy, vz, ax, t1,
    bx: d.bounce.x, bz: d.bounce.z,
    vx2: vx + ax * t1 + d.turn, vy2: -vyb * e, vz2: vz * (d.kind === 'spin' ? 0.86 : 0.9),
  };
  p.tc = t1 + (CONTACT_Z - p.bz) / p.vz2;
  p.ts = t1 + (0 - p.bz) / p.vz2;
  const at = ballAt(p, p.ts, { x: 0, y: 0, z: 0 });
  p.stumpX = at.x; p.stumpY = at.y;
  p.hitsStumps = Math.abs(at.x) < STUMP_HALF_W && at.y < STUMP_H + BALL_R;
  const c = ballAt(p, p.tc, { x: 0, y: 0, z: 0 });
  p.contactX = c.x; p.contactY = c.y;
  return p;
}

/** Ball position at time t on a delivery path; writes into `out` ({x,y,z}) and returns it. */
export function ballAt(p, t, out) {
  if (t <= p.t1) {
    out.x = p.x0 + p.vx * t + 0.5 * p.ax * t * t;
    out.y = p.y0 + p.vy * t - 0.5 * G * t * t;
    out.z = p.z0 + p.vz * t;
  } else {
    const s = t - p.t1;
    out.x = p.bx + p.vx2 * s;
    out.y = Math.max(BALL_R, BALL_R + p.vy2 * s - 0.5 * G * s * s);
    out.z = p.bz + p.vz2 * s;
  }
  return out;
}

/** Timing windows (real seconds between tap and the ideal contact moment). */
export const WINDOWS = { perfect: 0.04, good: 0.085, ok: 0.135, edge: 0.19 };

/** Classify a tap. diff < 0 means early. */
export function timingOf(diff) {
  const a = Math.abs(diff);
  const side = diff < 0 ? 'early' : 'late';
  if (a <= WINDOWS.perfect) return { grade: 'perfect', side, label: 'Perfect!', quality: 1 - a / WINDOWS.perfect * 0.15 };
  if (a <= WINDOWS.good) return { grade: 'good', side, label: `Good, ${side === 'early' ? 'a bit early' : 'a bit late'}`, quality: 0.85 - (a - WINDOWS.perfect) / (WINDOWS.good - WINDOWS.perfect) * 0.25 };
  if (a <= WINDOWS.ok) return { grade: 'ok', side, label: side === 'early' ? 'Early' : 'Late', quality: 0.6 - (a - WINDOWS.good) / (WINDOWS.ok - WINDOWS.good) * 0.25 };
  if (a <= WINDOWS.edge) return { grade: 'edge', side, label: side === 'early' ? 'Too early' : 'Too late', quality: 0.3 };
  return { grade: 'miss', side, label: side === 'early' ? 'Way too early' : 'Way too late', quality: 0 };
}

/** Position on the -1..1 timing meter (0 = perfect). */
export const meterPos = (diff) => (diff == null ? null : clamp(diff / WINDOWS.edge, -1, 1));

const DEG = Math.PI / 180;
/**
 * Decide a shot. All randomness comes from rng so it is testable.
 * @param {object} a
 * @param {number|null} a.diff  tap time minus ideal contact time (s), null = no shot played
 * @param {object} a.delivery   from planDelivery
 * @param {object} a.path       from deliveryPath
 * @param {{az:number, loft:boolean}} a.aim  az in radians, 0 = straight back past the bowler, + = screen-right (off side)
 * @returns {{result:string, runs:number, wicket:boolean, timing, az:number, how:string}}
 *   result: 'bowled'|'beaten'|'caught'|'edge'|'dot'|'1'|'2'|'4'|'6'
 */
export function decideShot({ diff, delivery, path, aim = { az: 0, loft: false } }, rng) {
  const timing = diff == null ? null : timingOf(diff);
  if (!timing || timing.grade === 'miss') {
    if (path.hitsStumps) return { result: 'bowled', runs: 0, wicket: true, timing, az: 0, how: 'Bowled!' };
    return { result: 'beaten', runs: 0, wicket: false, timing, az: 0, how: timing ? 'Swing and a miss' : 'Left alone' };
  }
  const short = delivery.length === 'Short' || delivery.length === 'Bouncer';
  const yorker = delivery.length === 'Yorker';
  const wide = Math.abs(path.contactX) > 0.55;
  const moving = Math.abs(delivery.swing) > 1.4 || Math.abs(delivery.turn) > 1.1;
  const loft = !!aim.loft || (short && timing.grade === 'perfect');
  let table;
  switch (timing.grade) {
    case 'perfect':
      table = loft
        ? [{ w: yorker ? 3 : 9, v: '6' }, { w: yorker ? 5 : 1, v: '4' }, { w: yorker ? 2 : 0, v: '2' }]
        : [{ w: 7, v: '4' }, { w: short ? 2.5 : 1, v: '6' }, { w: yorker ? 3 : 1.2, v: '2' }, { w: 0.6, v: '1' }];
      break;
    case 'good':
      table = loft
        ? [{ w: 3.5, v: '6' }, { w: 2.5, v: 'caught' }, { w: 2, v: '4' }, { w: 2, v: '2' }]
        : [{ w: 4.2, v: '4' }, { w: 3, v: '2' }, { w: 2.6, v: '1' }, { w: 0.6, v: 'dot' }];
      break;
    case 'ok':
      table = loft
        ? [{ w: 3.5, v: 'caught' }, { w: 2.5, v: '1' }, { w: 2, v: '2' }, { w: 2, v: 'dot' }]
        : [{ w: 3.8, v: '1' }, { w: 1.6, v: '2' }, { w: 3, v: 'dot' }, { w: (wide || moving) ? 2.5 : 1.2, v: 'edge' }];
      break;
    default: // edge zone
      table = [{ w: 5 + (wide || moving ? 2 : 0), v: 'edge' }, { w: 2.5, v: 'dot' }, { w: path.hitsStumps ? 0 : 1.5, v: 'beaten' }];
      if (path.hitsStumps) table.push({ w: 2.2, v: 'bowled' });
  }
  let result = weighted(rng, table);
  // Timing pulls the ball: early → leg side (screen-left), late → off side (screen-right).
  const pull = timing.side === 'early' ? -1 : 1;
  const off = Math.abs(diff) / WINDOWS.edge;
  let az = clamp(aim.az + pull * off * 55 * DEG + (rng() - 0.5) * 16 * DEG, -150 * DEG, 150 * DEG);
  if (result === 'edge') {
    // Thick or thin edge flies behind: caught behind / slips, or runs to third man / fine leg.
    result = weighted(rng, [{ w: 3.4, v: 'caught' }, { w: 3.5, v: '1' }, { w: 2.2, v: '4' }, { w: 1.6, v: 'dot' }]);
    az = (pull > 0 ? 1 : -1) * lerp(150, 172, rng()) * DEG;
    const how = { caught: 'Edged and taken!', 1: 'Edged for a single', 4: 'Edged... and four!', dot: 'Thick edge, no run' }[result];
    return { result, runs: RUNS[result], wicket: result === 'caught', timing, az, how, edged: true };
  }
  if (result === 'bowled') return { result, runs: 0, wicket: true, timing, az: 0, how: 'Bowled through the gate!' };
  if (result === 'beaten') return { result, runs: 0, wicket: false, timing, az: 0, how: 'Beaten!' };
  return { result, runs: RUNS[result], wicket: result === 'caught', timing, az, how: HOW[result], lofted: loft || result === '6' || result === 'caught' };
}
export const RUNS = { bowled: 0, beaten: 0, caught: 0, dot: 0, edge: 0, 1: 1, 2: 2, 4: 4, 6: 6 };
const HOW = { 6: 'SIX!', 4: 'FOUR!', 2: 'Two runs', 1: 'Quick single', dot: 'Straight to the fielder', caught: 'Caught!' };

/**
 * Launch velocity for a struck ball. Returns {vx, vy, vz, dist} (dist = intended carry / roll distance).
 * az: 0 = straight down the ground (-z), + = screen-right.
 */
export function launchFor(result, az, rng, target, elevDeg = 0) {
  const dirX = Math.sin(az), dirZ = -Math.cos(az);
  let speed, elev, dist;
  if (result === '6') {
    dist = lerp(STANDS_R + 6, STANDS_R + 24, rng());
    elev = lerp(34, 42, rng()) * DEG;
    speed = Math.sqrt((dist * G) / Math.sin(2 * elev));
  } else if (result === 'caught' && target) {
    dist = target;
    elev = (elevDeg || (target < 12 ? 22 : 48)) * DEG;
    speed = Math.sqrt((dist * G) / Math.sin(2 * elev)) * 1.01;
  } else {
    dist = result === '4' ? ROPE_R + 18 : result === '2' ? lerp(38, 50, rng()) : result === '1' ? lerp(20, 30, rng()) : lerp(9, 16, rng());
    elev = (result === '4' ? lerp(3, 8, rng()) : lerp(2, 6, rng())) * DEG;
    speed = Math.sqrt(2 * ROLL_DECEL * dist);
  }
  return { vx: dirX * Math.cos(elev) * speed, vy: Math.sin(elev) * speed, vz: dirZ * Math.cos(elev) * speed, dist, speed };
}

/**
 * Advance a struck ball by dt (mutates b: {x,y,z,vx,vy,vz,rolling}). Gravity in the air,
 * lossy bounces, rolling friction on the ground. Allocation-free.
 */
export function stepBall(b, dt) {
  if (!b.rolling) {
    b.vy -= G * dt;
    b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    if (b.y <= BALL_R) {
      b.y = BALL_R;
      if (b.vy < -2.2) { b.vy = -b.vy * 0.38; b.vx *= 0.82; b.vz *= 0.82; } else { b.vy = 0; b.rolling = true; }
    }
    return b;
  }
  const sp = Math.hypot(b.vx, b.vz);
  if (sp < 0.05) { b.vx = 0; b.vz = 0; return b; }
  const ns = Math.max(0, sp - ROLL_DECEL * dt);
  const k = ns / sp;
  b.vx *= k; b.vz *= k;
  b.x += b.vx * dt; b.z += b.vz * dt;
  return b;
}

// ---------------- innings ----------------
export function newInnings() {
  return { runs: 0, wickets: 0, balls: 0, fours: 0, sixes: 0, dots: 0, chips: [], all: [], done: false };
}
export const chipFor = (o) => (o.wicket ? 'W' : o.runs === 0 ? '•' : String(o.runs));

/** Pure reducer: apply one ball's outcome ({runs, wicket}) to the innings. */
export function applyBall(s, o) {
  const runs = s.runs + (o.wicket ? 0 : o.runs);
  const wickets = s.wickets + (o.wicket ? 1 : 0);
  const balls = s.balls + 1;
  return {
    runs, wickets, balls,
    fours: s.fours + (!o.wicket && o.runs === 4 ? 1 : 0),
    sixes: s.sixes + (!o.wicket && o.runs === 6 ? 1 : 0),
    dots: s.dots + (!o.wicket && o.runs === 0 ? 1 : 0),
    chips: [...s.chips, chipFor(o)].slice(-6),
    all: [...(s.all || []), chipFor(o)],
    done: balls >= MAX_BALLS || wickets >= MAX_WICKETS,
  };
}
export const ballsLeft = (s) => MAX_BALLS - s.balls;
export const oversText = (balls) => `${Math.floor(balls / 6)}.${balls % 6}`;
export const strikeRate = (s) => (s.balls ? Math.round((s.runs / s.balls) * 1000) / 10 : 0);

/** Required-rate style flavour line for the HUD. */
export function flavour(s, best = 0) {
  const left = ballsLeft(s);
  if (s.done) return 'Innings over';
  if (s.balls === 0) return best > 0 ? `Beat your best: ${best + 1} off 12 balls` : '2 overs, 3 wickets. Go big!';
  const chips = s.chips;
  const last3 = chips.slice(-3);
  if (last3.length === 3 && last3.every((c) => c === '4' || c === '6')) return 'On fire! Three boundaries in a row 🔥';
  if (s.wickets === MAX_WICKETS - 1) return 'Last wicket. Careful now!';
  const goals = [best > s.runs ? best + 1 : 0, 50, 30].filter((g) => g > s.runs);
  const goal = goals.find((g) => g - s.runs <= left * 3.6);
  if (goal) {
    const need = goal - s.runs;
    const rr = ((need / left) * 6).toFixed(1);
    const name = goal === 50 ? 'a fifty' : goal === best + 1 ? 'a new best' : `${goal}`;
    return `Need ${need} off ${left} for ${name} · RRR ${rr}`;
  }
  return `Run rate ${((s.runs / s.balls) * 6).toFixed(1)} · ${left} ball${left === 1 ? '' : 's'} left`;
}

export function shareText(s, url = '') {
  const chips = s.all || s.chips;
  return `🏏 PlayNest Cricket Blitz\n${s.runs}/${s.wickets} in ${oversText(s.balls)} overs · SR ${strikeRate(s)}\n${s.fours}×4 · ${s.sixes}×6\n${chips.map((c) => ({ W: '🟥', '•': '⬛', 4: '🟦', 6: '🟪' }[c] || '🟩')).join('')}\n${url}/arcade/cricket`;
}

export function resultTitle(s) {
  if (s.runs >= 50) return 'Half-century hero!';
  if (s.runs >= 36) return 'Blistering knock!';
  if (s.runs >= 24) return 'Solid innings';
  if (s.runs >= 12) return 'Got a start';
  return 'Tough day at the crease';
}
