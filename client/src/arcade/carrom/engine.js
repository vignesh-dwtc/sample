// Carrom Strike physics engine — pure, allocation-free in the hot loop, DOM-free (unit-tested in node).
// World units: the playing surface is SIZE×SIZE (≈ 0.74 mm per unit on a real 74 cm board).
// Bodies live in typed arrays (structure of arrays). Index 0 is always the striker.

export const SIZE = 1000;
export const COIN_R = 21.5; // 31.8 mm coin
export const STRIKER_R = 28; // 41.3 mm striker
export const POCKET_R = 31; // centre-in-hole radius (44.5 mm pocket)
export const POCKET_INSET = 31; // pocket centre distance from each cushion
export const COIN_MASS = 1;
export const STRIKER_MASS = 2.7; // real striker ≈15 g vs coin ≈5.5 g

export const T_STRIKER = 0;
export const T_WHITE = 1;
export const T_BLACK = 2;
export const T_QUEEN = 3;

export const MAX_EVENTS = 128;
export const BODY_COUNT = 20; // striker + 9 white + 9 black + queen

/** Pocket centres (x, y) — top-left, top-right, bottom-left, bottom-right. */
export const POCKETS = new Float64Array([
  POCKET_INSET, POCKET_INSET,
  SIZE - POCKET_INSET, POCKET_INSET,
  POCKET_INSET, SIZE - POCKET_INSET,
  SIZE - POCKET_INSET, SIZE - POCKET_INSET,
]);

/** Default tuning — feel tuned by hand; tests override friction for conservation checks. */
export const DEFAULTS = {
  friction: 820, // Coulomb deceleration, units/s² (board powder)
  damping: 0.55, // linear drag, 1/s
  eCoin: 0.9, // coin–coin / striker–coin restitution
  eWall: 0.72, // cushion restitution (normal)
  wallGrip: 0.96, // tangential speed kept on a cushion hit
  stopSpeed: 6, // below this a body snaps to rest
};

export function createWorld(opts = {}) {
  const n = BODY_COUNT;
  return {
    n,
    x: new Float64Array(n), y: new Float64Array(n),
    vx: new Float64Array(n), vy: new Float64Array(n),
    r: new Float64Array(n), m: new Float64Array(n), inv: new Float64Array(n),
    type: new Uint8Array(n), active: new Uint8Array(n),
    ...DEFAULTS, ...opts,
    // event buffers (cleared by the caller with clearEvents)
    hitCount: 0,
    hitA: new Int16Array(MAX_EVENTS), hitB: new Int16Array(MAX_EVENTS), // B = -1 → cushion
    hitSpeed: new Float64Array(MAX_EVENTS),
    hitX: new Float64Array(MAX_EVENTS), hitY: new Float64Array(MAX_EVENTS),
    pocketCount: 0,
    pocketIdx: new Int16Array(MAX_EVENTS), pocketHole: new Int8Array(MAX_EVENTS),
    pocketX: new Float64Array(MAX_EVENTS), pocketY: new Float64Array(MAX_EVENTS),
    pocketVx: new Float64Array(MAX_EVENTS), pocketVy: new Float64Array(MAX_EVENTS),
    firstContact: -1, // first body the striker touched this shot (-1 none)
    lastSubsteps: 0,
  };
}

export function setBody(w, i, type, x, y) {
  const striker = type === T_STRIKER;
  w.type[i] = type;
  w.r[i] = striker ? STRIKER_R : COIN_R;
  w.m[i] = striker ? STRIKER_MASS : COIN_MASS;
  w.inv[i] = 1 / w.m[i];
  w.x[i] = x; w.y[i] = y; w.vx[i] = 0; w.vy[i] = 0;
  w.active[i] = 1;
}

/** Baseline geometry for the player's (bottom) side. */
export const BASE_Y = SIZE - 158; // striker centre line
export const BASE_X0 = 183; // red end-circle centres
export const BASE_X1 = SIZE - 183;

/**
 * Standard centre formation: queen in the middle, an inner ring of 6 and an outer ring of 12
 * in hexagonal packing (whites forming a "Y" pattern like a real set-up).
 */
export function setupBoard(w) {
  const cx = SIZE / 2, cy = SIZE / 2, d = COIN_R * 2 + 0.6;
  setBody(w, 0, T_STRIKER, SIZE / 2, BASE_Y);
  setBody(w, 1, T_QUEEN, cx, cy);
  let i = 2;
  // inner ring: 6 at distance d, alternating
  for (let k = 0; k < 6; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 3;
    setBody(w, i++, k % 2 === 0 ? T_WHITE : T_BLACK, cx + Math.cos(a) * d, cy + Math.sin(a) * d);
  }
  // outer ring: 6 "corner" spots at 2d and 6 "edge" spots at √3·d
  for (let k = 0; k < 6; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 3;
    setBody(w, i++, k % 2 === 0 ? T_WHITE : T_BLACK, cx + Math.cos(a) * 2 * d, cy + Math.sin(a) * 2 * d);
    const b = a + Math.PI / 6;
    setBody(w, i++, k % 2 === 0 ? T_BLACK : T_WHITE, cx + Math.cos(b) * Math.sqrt(3) * d, cy + Math.sin(b) * Math.sqrt(3) * d);
  }
  w.hitCount = 0; w.pocketCount = 0; w.firstContact = -1;
  return w;
}

export function clearEvents(w) { w.hitCount = 0; w.pocketCount = 0; }

function pushHit(w, a, b, speed, x, y) {
  const k = w.hitCount;
  if (k >= MAX_EVENTS) return;
  w.hitA[k] = a; w.hitB[k] = b; w.hitSpeed[k] = speed; w.hitX[k] = x; w.hitY[k] = y;
  w.hitCount = k + 1;
}

export function isMoving(w) {
  for (let i = 0; i < w.n; i++) if (w.active[i] && (w.vx[i] !== 0 || w.vy[i] !== 0)) return true;
  return false;
}

export function maxSpeed(w) {
  let m = 0;
  for (let i = 0; i < w.n; i++) {
    if (!w.active[i]) continue;
    const s = w.vx[i] * w.vx[i] + w.vy[i] * w.vy[i];
    if (s > m) m = s;
  }
  return Math.sqrt(m);
}

/**
 * Advance the world by dt seconds. Splits into substeps so no body moves more than
 * ~¼ of a coin radius per substep (no tunnelling, even for a full-power striker).
 */
export function step(w, dt) {
  const vmax = maxSpeed(w);
  if (vmax === 0) { w.lastSubsteps = 0; return; }
  let sub = Math.ceil((vmax * dt) / (COIN_R * 0.25));
  if (sub < 1) sub = 1; else if (sub > 400) sub = 400;
  w.lastSubsteps = sub;
  const h = dt / sub;
  for (let s = 0; s < sub; s++) substep(w, h);
}

function substep(w, h) {
  const { n, x, y, vx, vy, r, active } = w;
  const fr = w.friction * h, damp = w.damping * h, stop = w.stopSpeed;
  // 1. friction + integrate
  for (let i = 0; i < n; i++) {
    if (!active[i]) continue;
    let ux = vx[i], uy = vy[i];
    if (ux === 0 && uy === 0) continue;
    const sp = Math.sqrt(ux * ux + uy * uy);
    const dec = fr + damp * sp;
    if (sp - dec <= stop) { vx[i] = 0; vy[i] = 0; continue; }
    const k = (sp - dec) / sp;
    ux *= k; uy *= k; vx[i] = ux; vy[i] = uy;
    x[i] += ux * h; y[i] += uy * h;
  }
  // 2. cushions
  const eW = w.eWall, grip = w.wallGrip;
  for (let i = 0; i < n; i++) {
    if (!active[i]) continue;
    const ri = r[i];
    if (x[i] < ri) { x[i] = ri; if (vx[i] < 0) { pushHit(w, i, -1, -vx[i], x[i] - ri, y[i]); vx[i] = -vx[i] * eW; vy[i] *= grip; } }
    else if (x[i] > SIZE - ri) { x[i] = SIZE - ri; if (vx[i] > 0) { pushHit(w, i, -1, vx[i], x[i] + ri, y[i]); vx[i] = -vx[i] * eW; vy[i] *= grip; } }
    if (y[i] < ri) { y[i] = ri; if (vy[i] < 0) { pushHit(w, i, -1, -vy[i], x[i], y[i] - ri); vy[i] = -vy[i] * eW; vx[i] *= grip; } }
    else if (y[i] > SIZE - ri) { y[i] = SIZE - ri; if (vy[i] > 0) { pushHit(w, i, -1, vy[i], x[i], y[i] + ri); vy[i] = -vy[i] * eW; vx[i] *= grip; } }
  }
  // 3. body–body collisions (impulse + positional correction)
  const { inv } = w, e = w.eCoin;
  for (let i = 0; i < n; i++) {
    if (!active[i]) continue;
    for (let j = i + 1; j < n; j++) {
      if (!active[j]) continue;
      const dx = x[j] - x[i], dy = y[j] - y[i];
      const rr = r[i] + r[j];
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr) continue;
      let d = Math.sqrt(d2), nx, ny;
      if (d > 1e-9) { nx = dx / d; ny = dy / d; } else { nx = 1; ny = 0; d = 0; }
      const wi = inv[i], wj = inv[j], wsum = wi + wj;
      // separate overlap, weighted by inverse mass
      const pen = rr - d;
      x[i] -= nx * pen * (wi / wsum); y[i] -= ny * pen * (wi / wsum);
      x[j] += nx * pen * (wj / wsum); y[j] += ny * pen * (wj / wsum);
      // relative normal velocity (j relative to i)
      const vn = (vx[j] - vx[i]) * nx + (vy[j] - vy[i]) * ny;
      if (vn >= 0) continue; // already separating
      const jImp = (-(1 + e) * vn) / wsum;
      vx[i] -= jImp * wi * nx; vy[i] -= jImp * wi * ny;
      vx[j] += jImp * wj * nx; vy[j] += jImp * wj * ny;
      pushHit(w, i, j, -vn, x[i] + nx * r[i], y[i] + ny * r[i]);
      if (w.firstContact < 0 && (i === 0 || j === 0)) w.firstContact = i === 0 ? j : i;
    }
  }
  // 4. pockets: a body drops when its centre is inside a hole
  const pr2 = POCKET_R * POCKET_R;
  for (let i = 0; i < n; i++) {
    if (!active[i]) continue;
    for (let p = 0; p < 4; p++) {
      const px = POCKETS[p * 2], py = POCKETS[p * 2 + 1];
      const dx = x[i] - px, dy = y[i] - py;
      if (dx * dx + dy * dy < pr2) {
        const k = w.pocketCount;
        if (k < MAX_EVENTS) {
          w.pocketIdx[k] = i; w.pocketHole[k] = p;
          w.pocketX[k] = x[i]; w.pocketY[k] = y[i]; w.pocketVx[k] = vx[i]; w.pocketVy[k] = vy[i];
          w.pocketCount = k + 1;
        }
        active[i] = 0; vx[i] = 0; vy[i] = 0;
        break;
      }
    }
  }
}

/** True when body i at (px, py) would overlap any other active body (with a small margin). */
export function overlapsAny(w, i, px, py, margin = 0.5) {
  const ri = w.r[i];
  for (let j = 0; j < w.n; j++) {
    if (j === i || !w.active[j]) continue;
    const dx = w.x[j] - px, dy = w.y[j] - py, rr = ri + w.r[j] + margin;
    if (dx * dx + dy * dy < rr * rr) return true;
  }
  return false;
}

/** Nearest striker x on the baseline to `want` that doesn't overlap a coin (or `want` if none is free). */
export function nearestFreeBaseX(w, want) {
  const x0 = BASE_X0, x1 = BASE_X1;
  const t = want < x0 ? x0 : want > x1 ? x1 : want;
  for (let off = 0; off <= x1 - x0; off += 1) {
    const a = t - off, b = t + off;
    if (a >= x0 && !overlapsAny(w, 0, a, BASE_Y)) return a;
    if (b <= x1 && !overlapsAny(w, 0, b, BASE_Y)) return b;
  }
  return t;
}

/** Find a free spot for body i nearest to (cx, cy) on a spiral; returns true when placed. */
export function placeNear(w, i, cx, cy) {
  const ri = w.r[i];
  for (let ring = 0; ring < 40; ring++) {
    const rad = ring * ri * 0.5;
    const steps = ring === 0 ? 1 : Math.max(6, Math.round((2 * Math.PI * rad) / (ri * 0.5)));
    for (let k = 0; k < steps; k++) {
      const a = (k / steps) * Math.PI * 2;
      const px = cx + Math.cos(a) * rad, py = cy + Math.sin(a) * rad;
      if (px < ri || py < ri || px > SIZE - ri || py > SIZE - ri) continue;
      if (!overlapsAny(w, i, px, py, 0.3)) {
        w.x[i] = px; w.y[i] = py; w.vx[i] = 0; w.vy[i] = 0; w.active[i] = 1;
        return true;
      }
    }
  }
  return false;
}

/**
 * Predict the striker's first contact when shot from (sx, sy) in unit direction (dx, dy).
 * Writes into `out` (Float64Array(8)): [contactX, contactY, targetDirX, targetDirY, travel, hitIndex, wallNx, wallNy].
 * hitIndex = -1 when the striker reaches a cushion first. Allocation-free.
 */
export function predictContact(w, sx, sy, dx, dy, out) {
  const rs = w.r[0];
  let best = Infinity, hit = -1;
  for (let j = 1; j < w.n; j++) {
    if (!w.active[j]) continue;
    const ox = w.x[j] - sx, oy = w.y[j] - sy;
    const t = ox * dx + oy * dy;
    if (t <= 0) continue;
    const perp2 = ox * ox + oy * oy - t * t;
    const R = rs + w.r[j];
    if (perp2 >= R * R) continue;
    const th = t - Math.sqrt(R * R - perp2);
    if (th < best) { best = th; hit = j; }
  }
  // cushion distance
  let wall = Infinity, wnx = 0, wny = 0;
  if (dx > 1e-9) { const t = (SIZE - rs - sx) / dx; if (t < wall) { wall = t; wnx = -1; wny = 0; } }
  if (dx < -1e-9) { const t = (rs - sx) / dx; if (t < wall) { wall = t; wnx = 1; wny = 0; } }
  if (dy > 1e-9) { const t = (SIZE - rs - sy) / dy; if (t < wall) { wall = t; wnx = 0; wny = -1; } }
  if (dy < -1e-9) { const t = (rs - sy) / dy; if (t < wall) { wall = t; wnx = 0; wny = 1; } }
  if (hit >= 0 && best <= wall) {
    const cx = sx + dx * best, cy = sy + dy * best;
    let nx = w.x[hit] - cx, ny = w.y[hit] - cy;
    const l = Math.sqrt(nx * nx + ny * ny) || 1;
    nx /= l; ny /= l;
    out[0] = cx; out[1] = cy; out[2] = nx; out[3] = ny; out[4] = best; out[5] = hit; out[6] = 0; out[7] = 0;
  } else {
    if (wall < 0) wall = 0;
    out[0] = sx + dx * wall; out[1] = sy + dy * wall; out[2] = 0; out[3] = 0; out[4] = wall; out[5] = -1; out[6] = wnx; out[7] = wny;
  }
  return out;
}

export function kineticEnergy(w) {
  let e = 0;
  for (let i = 0; i < w.n; i++) if (w.active[i]) e += 0.5 * w.m[i] * (w.vx[i] * w.vx[i] + w.vy[i] * w.vy[i]);
  return e;
}

export function momentum(w, out = [0, 0]) {
  out[0] = 0; out[1] = 0;
  for (let i = 0; i < w.n; i++) if (w.active[i]) { out[0] += w.m[i] * w.vx[i]; out[1] += w.m[i] * w.vy[i]; }
  return out;
}

export function countActive(w, type) {
  let c = 0;
  for (let i = 1; i < w.n; i++) if (w.active[i] && (type === undefined || w.type[i] === type)) c++;
  return c;
}

/** Shot speed (units/s) for a pull power in 0..1. */
export const MIN_SHOT = 260;
export const MAX_SHOT = 4600;
export const shotSpeed = (power) => MIN_SHOT + (MAX_SHOT - MIN_SHOT) * Math.min(1, Math.max(0, power)) ** 1.15;
