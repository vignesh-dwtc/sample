// Carrom Strike art: the static board (procedural wood, frame, markings, pockets, lighting)
// and pre-rendered coin sprites. Everything is drawn once per resize into offscreen canvases,
// so the per-frame renderer only blits images.
import { SIZE, COIN_R, STRIKER_R, POCKETS, POCKET_R, BASE_X0, BASE_X1, T_STRIKER, T_WHITE, T_BLACK, T_QUEEN } from './engine.js';

export const FRAME = 66; // frame width in world units
export const WORLD = SIZE + FRAME * 2;

const TAU = Math.PI * 2;
const INK = 'rgba(28, 16, 8, 0.9)';
const RED = '#c4212d';

// Deterministic PRNG so the board looks the same every time.
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  return c;
}

function noiseTile(size, seed, alpha) {
  const c = makeCanvas(size, size), g = c.getContext('2d');
  const img = g.createImageData(size, size), d = img.data, r = rng(seed);
  for (let i = 0; i < d.length; i += 4) {
    const v = r() * 255;
    d[i] = v; d[i + 1] = v * 0.8; d[i + 2] = v * 0.55; d[i + 3] = r() * alpha;
  }
  g.putImageData(img, 0, 0);
  return c;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

/** Wavy wood grain lines in the current transform, running along x over [0,len] × [0,thick]. */
function grain(g, len, thick, r, { count, dark, light, amp = 6 }) {
  for (let k = 0; k < count; k++) {
    const y0 = r() * thick, f1 = 0.004 + r() * 0.01, f2 = 0.02 + r() * 0.03, ph = r() * TAU;
    const a1 = amp * (0.4 + r()), a2 = amp * 0.25 * r();
    g.beginPath();
    for (let x = -10; x <= len + 10; x += 14) {
      const y = y0 + Math.sin(x * f1 + ph) * a1 + Math.sin(x * f2 + ph * 2) * a2;
      if (x === -10) g.moveTo(x, y); else g.lineTo(x, y);
    }
    const isLight = r() < 0.25;
    g.strokeStyle = isLight ? light : dark;
    g.globalAlpha = isLight ? 0.05 + r() * 0.08 : 0.04 + r() * 0.12;
    g.lineWidth = 0.6 + r() * (r() < 0.15 ? 5 : 2);
    g.stroke();
  }
  g.globalAlpha = 1;
}

/** Draw the full board into a canvas of `px` device pixels square. */
export function renderBoard(px) {
  const c = makeCanvas(px, px), g = c.getContext('2d');
  const s = px / WORLD;
  g.scale(s, s);
  const r = rng(7);

  // ---- frame: dark polished wood with mitred grain ----
  roundRect(g, 0, 0, WORLD, WORLD, 30);
  const fg = g.createLinearGradient(0, 0, WORLD, WORLD);
  fg.addColorStop(0, '#5a2c14'); fg.addColorStop(0.5, '#3d1b0b'); fg.addColorStop(1, '#2a1107');
  g.fillStyle = fg; g.fill();
  g.save(); roundRect(g, 0, 0, WORLD, WORLD, 30); g.clip();
  const sides = [
    [0, 0, WORLD, 0, WORLD - FRAME, FRAME, FRAME, FRAME, 0],
    [WORLD, 0, WORLD, WORLD, WORLD - FRAME, WORLD - FRAME, WORLD - FRAME, FRAME, Math.PI / 2],
    [WORLD, WORLD, 0, WORLD, FRAME, WORLD - FRAME, WORLD - FRAME, WORLD - FRAME, Math.PI],
    [0, WORLD, 0, 0, FRAME, FRAME, FRAME, WORLD - FRAME, -Math.PI / 2],
  ];
  for (const [ax, ay, bx, by, cx, cy, dx, dy, rot] of sides) {
    g.save();
    g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.lineTo(cx, cy); g.lineTo(dx, dy); g.closePath(); g.clip();
    g.translate(ax, ay); g.rotate(rot);
    grain(g, WORLD, FRAME, r, { count: 46, dark: '#140600', light: '#c27a45', amp: 3 });
    g.restore();
  }
  g.restore();
  // frame bevel: lacquer gloss on top, outer rim light, inner lip
  const gloss = g.createLinearGradient(0, 0, 0, WORLD);
  gloss.addColorStop(0, 'rgba(255,220,180,0.20)'); gloss.addColorStop(0.35, 'rgba(255,220,180,0.03)'); gloss.addColorStop(1, 'rgba(0,0,0,0.18)');
  roundRect(g, 0, 0, WORLD, WORLD, 30); g.fillStyle = gloss; g.fill();
  roundRect(g, 3, 3, WORLD - 6, WORLD - 6, 27);
  g.lineWidth = 4; g.strokeStyle = 'rgba(255,200,150,0.18)'; g.stroke();
  roundRect(g, 14, 14, WORLD - 28, WORLD - 28, 20);
  g.lineWidth = 2; g.strokeStyle = 'rgba(0,0,0,0.25)'; g.stroke();
  // inner lip (cushion edge) — light on the far (top/left) inner edges, dark on the near ones
  const lip = 10;
  g.fillStyle = 'rgba(0,0,0,0.55)';
  g.fillRect(FRAME - lip, FRAME - lip, SIZE + lip * 2, lip); g.fillRect(FRAME - lip, FRAME, lip, SIZE);
  g.fillStyle = 'rgba(255,214,170,0.22)';
  g.fillRect(FRAME - lip, FRAME + SIZE, SIZE + lip * 2, lip); g.fillRect(FRAME + SIZE, FRAME - lip, lip, SIZE + lip);
  g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 2;
  g.strokeRect(FRAME - lip, FRAME - lip, SIZE + lip * 2, SIZE + lip * 2);

  // ---- playing surface: light maple ply with grain + fine noise ----
  g.save();
  g.translate(FRAME, FRAME);
  g.beginPath(); g.rect(0, 0, SIZE, SIZE); g.clip();
  const base = g.createLinearGradient(0, 0, SIZE, SIZE);
  base.addColorStop(0, '#f2d7a2'); base.addColorStop(0.5, '#e9c88c'); base.addColorStop(1, '#dcb376');
  g.fillStyle = base; g.fillRect(0, 0, SIZE, SIZE);
  // broad figure bands
  for (let k = 0; k < 9; k++) {
    const y = r() * SIZE, h = 40 + r() * 120;
    const band = g.createLinearGradient(0, y - h, 0, y + h);
    band.addColorStop(0, 'rgba(160,100,40,0)'); band.addColorStop(0.5, `rgba(160,100,40,${0.05 + r() * 0.07})`); band.addColorStop(1, 'rgba(160,100,40,0)');
    g.fillStyle = band; g.fillRect(0, y - h, SIZE, h * 2);
  }
  grain(g, SIZE, SIZE, r, { count: 260, dark: '#8a5422', light: '#fff1d0', amp: 9 });
  const nt = noiseTile(128, 11, 30);
  g.save(); g.scale(1 / s, 1 / s); // noise at device-pixel scale
  g.fillStyle = g.createPattern(nt, 'repeat'); g.fillRect(0, 0, SIZE * s, SIZE * s);
  g.restore();
  // lacquer sheen
  const sheen = g.createLinearGradient(0, 0, SIZE, SIZE);
  sheen.addColorStop(0, 'rgba(255,255,255,0.10)'); sheen.addColorStop(0.45, 'rgba(255,255,255,0)'); sheen.addColorStop(1, 'rgba(0,0,0,0.05)');
  g.fillStyle = sheen; g.fillRect(0, 0, SIZE, SIZE);

  drawMarkings(g);
  drawPockets(g, r);

  // frame shadow cast onto the surface (light from the top-left)
  const edge = (x0, y0, x1, y1, a, rx, ry, rw, rh) => {
    const lg = g.createLinearGradient(x0, y0, x1, y1);
    lg.addColorStop(0, `rgba(30,12,0,${a})`); lg.addColorStop(1, 'rgba(30,12,0,0)');
    g.fillStyle = lg; g.fillRect(rx, ry, rw, rh);
  };
  edge(0, 0, 0, 26, 0.45, 0, 0, SIZE, 26);
  edge(0, 0, 26, 0, 0.4, 0, 0, 26, SIZE);
  edge(0, SIZE, 0, SIZE - 12, 0.22, 0, SIZE - 12, SIZE, 12);
  edge(SIZE, 0, SIZE - 12, 0, 0.22, SIZE - 12, 0, 12, SIZE);
  g.restore();

  // ---- table lighting: warm hotspot + vignette over everything ----
  const lx = WORLD * 0.46, ly = WORLD * 0.42;
  const hot = g.createRadialGradient(lx, ly, 0, lx, ly, WORLD * 0.55);
  hot.addColorStop(0, 'rgba(255,236,190,0.16)'); hot.addColorStop(1, 'rgba(255,236,190,0)');
  g.fillStyle = hot; g.fillRect(0, 0, WORLD, WORLD);
  const vig = g.createRadialGradient(lx, ly, WORLD * 0.3, WORLD / 2, WORLD / 2, WORLD * 0.78);
  vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(0,0,0,0.42)');
  g.save(); roundRect(g, 0, 0, WORLD, WORLD, 30); g.clip();
  g.fillStyle = vig; g.fillRect(0, 0, WORLD, WORLD);
  g.restore();
  return c;
}

function drawMarkings(g) {
  const c = SIZE / 2;
  g.lineCap = 'round';
  // centre: outer circle, rosette, inner red circle
  g.strokeStyle = INK; g.lineWidth = 2.6;
  g.beginPath(); g.arc(c, c, 128, 0, TAU); g.stroke();
  g.lineWidth = 1.4;
  g.beginPath(); g.arc(c, c, 120, 0, TAU); g.stroke();
  // 8-point rosette (alternating red / ink petals)
  for (let k = 0; k < 16; k++) {
    const a = (k * TAU) / 16, long = k % 2 === 0;
    const R = long ? 114 : 84, w = long ? 0.3 : 0.36;
    g.beginPath();
    g.moveTo(c + Math.cos(a) * 20, c + Math.sin(a) * 20);
    g.lineTo(c + Math.cos(a - w) * 40, c + Math.sin(a - w) * 40);
    g.lineTo(c + Math.cos(a) * R, c + Math.sin(a) * R);
    g.lineTo(c + Math.cos(a + w) * 40, c + Math.sin(a + w) * 40);
    g.closePath();
    g.fillStyle = long ? 'rgba(196,33,45,0.85)' : 'rgba(28,16,8,0.82)';
    g.fill();
  }
  g.beginPath(); g.arc(c, c, 26, 0, TAU); g.fillStyle = '#ecd09a'; g.fill();
  g.lineWidth = 2; g.strokeStyle = INK; g.stroke();
  g.beginPath(); g.arc(c, c, 16, 0, TAU); g.fillStyle = RED; g.fill(); g.stroke();

  // baselines on all four sides: two parallel lines with red end circles
  const len0 = BASE_X0, len1 = BASE_X1, outer = SIZE - 136, inner = SIZE - 180;
  for (let side = 0; side < 4; side++) {
    g.save();
    g.translate(c, c); g.rotate((side * Math.PI) / 2); g.translate(-c, -c);
    g.strokeStyle = INK; g.lineWidth = 2.4;
    g.beginPath(); g.moveTo(len0, outer); g.lineTo(len1, outer); g.stroke();
    g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(len0, inner); g.lineTo(len1, inner); g.stroke();
    const my = (outer + inner) / 2, rr = (outer - inner) / 2;
    for (const ex of [len0, len1]) {
      g.beginPath(); g.arc(ex, my, rr, 0, TAU);
      g.fillStyle = RED; g.fill(); g.lineWidth = 2.2; g.strokeStyle = INK; g.stroke();
      g.beginPath(); g.arc(ex, my, rr * 0.45, 0, TAU); g.fillStyle = 'rgba(255,220,200,0.35)'; g.fill();
    }
    g.restore();
  }

  // diagonal arrows from each pocket towards the centre, with the arc near the baseline ends
  for (let k = 0; k < 4; k++) {
    g.save();
    g.translate(c, c); g.rotate((k * Math.PI) / 2); g.translate(-c, -c);
    const a0 = 92, a1 = 300; // along the diagonal from the top-left corner
    g.strokeStyle = INK; g.lineWidth = 2.2;
    g.beginPath(); g.moveTo(a0, a0); g.lineTo(a1, a1); g.stroke();
    // arrow head pointing to the pocket
    g.beginPath(); g.moveTo(a0 - 4, a0 - 4); g.lineTo(a0 + 20, a0 + 6); g.lineTo(a0 + 6, a0 + 20); g.closePath();
    g.fillStyle = INK; g.fill();
    // arc across the arrow
    g.beginPath(); g.arc(a1 - 32, a1 - 32, 34, Math.PI * 0.03, Math.PI * 0.47); g.lineWidth = 2; g.stroke();
    g.beginPath(); g.arc(a1 + 4, a1 + 4, 7, 0, TAU); g.fillStyle = RED; g.fill(); g.lineWidth = 1.6; g.stroke();
    g.restore();
  }
}

function drawPockets(g, r) {
  for (let p = 0; p < 4; p++) {
    const x = POCKETS[p * 2], y = POCKETS[p * 2 + 1];
    const R = POCKET_R + 9; // visual hole a bit larger than the drop radius
    // outer printed ring
    g.beginPath(); g.arc(x, y, R + 6, 0, TAU); g.lineWidth = 2.4; g.strokeStyle = INK; g.stroke();
    // hole
    const hole = g.createRadialGradient(x - 4, y - 4, 2, x, y, R);
    hole.addColorStop(0, '#000'); hole.addColorStop(0.7, '#0b0603'); hole.addColorStop(1, '#2a160a');
    g.beginPath(); g.arc(x, y, R, 0, TAU); g.fillStyle = hole; g.fill();
    // net mesh, sagging towards the corner
    g.save(); g.beginPath(); g.arc(x, y, R - 2, 0, TAU); g.clip();
    g.strokeStyle = 'rgba(230,220,200,0.16)'; g.lineWidth = 1;
    const sx = p % 2 === 0 ? -1 : 1, sy = p < 2 ? -1 : 1;
    for (let k = -4; k <= 4; k++) {
      g.beginPath(); g.moveTo(x - R + k * 9, y - R); g.quadraticCurveTo(x + sx * 10 + k * 7, y + sy * 10, x + R + k * 9, y + R); g.stroke();
      g.beginPath(); g.moveTo(x - R, y + R + k * 9); g.quadraticCurveTo(x + sx * 10, y + sy * 10 + k * 7, x + R, y - R + k * 9); g.stroke();
    }
    // depth shading: the inner wall towards the light is lit
    const wall = g.createRadialGradient(x + sx * 8, y + sy * 8, R * 0.2, x, y, R);
    wall.addColorStop(0, 'rgba(0,0,0,0.65)'); wall.addColorStop(0.8, 'rgba(0,0,0,0.2)'); wall.addColorStop(1, 'rgba(0,0,0,0.6)');
    g.fillStyle = wall; g.fillRect(x - R, y - R, R * 2, R * 2);
    g.restore();
    // rim highlight
    g.beginPath(); g.arc(x, y, R, Math.PI * 0.1, Math.PI * 0.9); g.lineWidth = 2; g.strokeStyle = 'rgba(255,230,190,0.35)'; g.stroke();
    g.beginPath(); g.arc(x, y, R, Math.PI * 1.1, Math.PI * 1.9); g.lineWidth = 2.5; g.strokeStyle = 'rgba(0,0,0,0.6)'; g.stroke();
    r();
  }
}

const COIN_STYLES = {
  [T_WHITE]: { stops: ['#fffaf0', '#f1e2c2', '#d8bf8f', '#a98c5c'], ring: 'rgba(120,84,40,0.45)', lite: 'rgba(255,255,255,0.7)' },
  [T_BLACK]: { stops: ['#6b625c', '#36302c', '#1c1816', '#090706'], ring: 'rgba(0,0,0,0.6)', lite: 'rgba(255,255,255,0.22)' },
  [T_QUEEN]: { stops: ['#ff8a8f', '#e0303e', '#a8121f', '#5c0710'], ring: 'rgba(70,0,8,0.55)', lite: 'rgba(255,220,220,0.55)' },
  [T_STRIKER]: { stops: ['#ffffff', '#eef1f7', '#cfd6e4', '#8c97ad'], ring: 'rgba(60,70,100,0.45)', lite: 'rgba(255,255,255,0.9)' },
};

/**
 * Pre-render a coin sprite (with soft drop shadow) for a radius in device pixels.
 * Returns { canvas, half } where `half` is the offset from the sprite's top-left to the coin centre.
 */
export function renderCoin(type, rpx) {
  const pad = Math.ceil(rpx * 0.55) + 2;
  const size = Math.ceil(rpx * 2 + pad * 2);
  const c = makeCanvas(size, size), g = c.getContext('2d');
  const cx = size / 2, cy = size / 2, R = rpx;
  const st = COIN_STYLES[type];
  // drop shadow, offset away from the table light
  const sx = cx + R * 0.14, sy = cy + R * 0.22;
  const sh = g.createRadialGradient(sx, sy, R * 0.6, sx, sy, R * 1.3);
  sh.addColorStop(0, 'rgba(20,8,0,0.55)'); sh.addColorStop(1, 'rgba(20,8,0,0)');
  g.fillStyle = sh; g.beginPath(); g.arc(sx, sy, R * 1.3, 0, TAU); g.fill();
  // edge (side of the coin, slightly darker and visible at the bottom-right)
  g.beginPath(); g.arc(cx + R * 0.03, cy + R * 0.05, R, 0, TAU); g.fillStyle = st.stops[3]; g.fill();
  // face
  const face = g.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.05, cx, cy, R);
  face.addColorStop(0, st.stops[0]); face.addColorStop(0.45, st.stops[1]); face.addColorStop(0.85, st.stops[2]); face.addColorStop(1, st.stops[3]);
  g.beginPath(); g.arc(cx, cy, R * 0.97, 0, TAU); g.fillStyle = face; g.fill();
  // turned grooves (embossed: dark line + light line just below-right)
  const grooves = type === T_STRIKER ? [0.86, 0.62] : [0.8, 0.56, 0.3];
  for (const k of grooves) {
    g.beginPath(); g.arc(cx, cy, R * k, 0, TAU); g.lineWidth = Math.max(0.8, R * 0.05); g.strokeStyle = st.ring; g.stroke();
    g.beginPath(); g.arc(cx + R * 0.025, cy + R * 0.035, R * k, Math.PI * 0.05, Math.PI * 0.95);
    g.lineWidth = Math.max(0.6, R * 0.03); g.strokeStyle = st.lite; g.globalAlpha = 0.5; g.stroke(); g.globalAlpha = 1;
  }
  if (type === T_STRIKER) {
    // decorative inlay: an 8-point star in blue and red
    g.save(); g.translate(cx, cy);
    for (let k = 0; k < 8; k++) {
      g.rotate(TAU / 8);
      g.beginPath(); g.moveTo(0, 0); g.lineTo(R * 0.1, R * 0.12); g.lineTo(0, R * 0.52); g.lineTo(-R * 0.1, R * 0.12); g.closePath();
      g.fillStyle = k % 2 ? 'rgba(196,33,45,0.85)' : 'rgba(40,70,160,0.85)'; g.fill();
    }
    g.beginPath(); g.arc(0, 0, R * 0.12, 0, TAU); g.fillStyle = '#f5f0e0'; g.fill();
    g.restore();
  } else {
    g.beginPath(); g.arc(cx, cy, R * 0.1, 0, TAU); g.fillStyle = st.ring; g.fill();
  }
  if (type === T_QUEEN) {
    // tiny gold crown dots for the queen
    for (let k = 0; k < 5; k++) {
      const a = -Math.PI / 2 + ((k - 2) * Math.PI) / 7;
      g.beginPath(); g.arc(cx + Math.cos(a) * R * 0.43, cy + Math.sin(a) * R * 0.43, R * 0.06, 0, TAU);
      g.fillStyle = 'rgba(255,214,120,0.9)'; g.fill();
    }
  }
  // rim bevel
  g.beginPath(); g.arc(cx, cy, R * 0.94, Math.PI * 1.0, Math.PI * 1.75); g.lineWidth = Math.max(1, R * 0.07); g.strokeStyle = st.lite; g.stroke();
  g.beginPath(); g.arc(cx, cy, R * 0.97, 0, TAU); g.lineWidth = Math.max(0.8, R * 0.04); g.strokeStyle = 'rgba(0,0,0,0.35)'; g.stroke();
  // specular highlight (lacquer)
  const hl = g.createRadialGradient(cx - R * 0.38, cy - R * 0.42, 0, cx - R * 0.38, cy - R * 0.42, R * 0.6);
  hl.addColorStop(0, 'rgba(255,255,255,0.75)'); hl.addColorStop(0.35, 'rgba(255,255,255,0.18)'); hl.addColorStop(1, 'rgba(255,255,255,0)');
  g.save(); g.beginPath(); g.arc(cx, cy, R * 0.97, 0, TAU); g.clip();
  g.fillStyle = hl; g.fillRect(cx - R, cy - R, R * 2, R * 2);
  g.restore();
  return { canvas: c, half: size / 2 };
}

export function renderSprites(scale) {
  return {
    [T_WHITE]: renderCoin(T_WHITE, COIN_R * scale),
    [T_BLACK]: renderCoin(T_BLACK, COIN_R * scale),
    [T_QUEEN]: renderCoin(T_QUEEN, COIN_R * scale),
    [T_STRIKER]: renderCoin(T_STRIKER, STRIKER_R * scale),
  };
}
