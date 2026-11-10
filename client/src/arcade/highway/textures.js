// Canvas-generated textures for Highway Rush (no image files).
import * as THREE from 'three';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
function tex(c, { repeat = false, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping; }
  t.needsUpdate = true;
  return t;
}
const rand = (r) => r();

/** Road segment texture. Covers x = X0..X1 metres across and SEG_LEN metres along. */
export const ROAD_X0 = -30, ROAD_X1 = 40;
export function roadTexture(seg, rng) {
  const W = 1024, H = 512;
  const [c, g] = canvas(W, H);
  const px = (x) => ((x - ROAD_X0) / (ROAD_X1 - ROAD_X0)) * W;
  const py = (z) => (z / seg) * H; // z metres from segment start
  // verges: dry grass / earth
  const verge = g.createLinearGradient(0, 0, W, 0);
  verge.addColorStop(0, '#6f7a3a'); verge.addColorStop(0.3, '#8a7c4a'); verge.addColorStop(0.7, '#86784a'); verge.addColorStop(1, '#69743a');
  g.fillStyle = verge; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = `rgba(${rand(rng) < 0.5 ? '60,80,30' : '150,130,80'},${0.15 + rand(rng) * 0.25})`;
    g.fillRect(rand(rng) * W, rand(rng) * H, 2 + rand(rng) * 5, 2 + rand(rng) * 5);
  }
  // paved shoulders
  const shoulder = (a, b) => { g.fillStyle = '#7d7768'; g.fillRect(px(a), 0, px(b) - px(a), H); };
  shoulder(-6.3, -4.8); shoulder(16.8, 18.3);
  // carriageways
  const asphalt = (a, b) => {
    g.fillStyle = '#3c3e44'; g.fillRect(px(a), 0, px(b) - px(a), H);
    for (let i = 0; i < 5000; i++) {
      const x = px(a) + rand(rng) * (px(b) - px(a)), y = rand(rng) * H, l = 50 + rand(rng) * 70;
      g.fillStyle = `rgba(${l},${l},${l + 4},${0.25 + rand(rng) * 0.3})`;
      g.fillRect(x, y, 1.5, 1.5);
    }
    // tyre tracks (darker, polished)
    for (const lx of [-1, 0, 1]) for (const o of [-0.8, 0.8]) {
      const x = px(a + (b - a) / 2 + lx * 3.2 + o);
      g.fillStyle = 'rgba(20,20,26,0.18)'; g.fillRect(x - 6, 0, 12, H);
    }
  };
  asphalt(-4.8, 4.8); asphalt(7.2, 16.8);
  // median (earth + kerb shadow)
  g.fillStyle = '#6b5a3c'; g.fillRect(px(4.8), 0, px(7.2) - px(4.8), H);
  // lines
  const line = (x, color, w = 0.16) => { g.fillStyle = color; g.fillRect(px(x) - (w / (ROAD_X1 - ROAD_X0)) * W / 2, 0, (w / (ROAD_X1 - ROAD_X0)) * W, H); };
  line(-4.65, '#f2f2ea'); line(4.65, '#f3c43a'); line(7.35, '#f3c43a'); line(16.65, '#f2f2ea');
  const dash = (x) => {
    for (let k = 0; k < 3; k++) {
      g.fillStyle = '#ededea';
      const w = (0.15 / (ROAD_X1 - ROAD_X0)) * W;
      g.fillRect(px(x) - w / 2, py(k * 10), w, py(3.2));
    }
  };
  dash(-1.6); dash(1.6); dash(10.4); dash(13.6);
  // cat's eyes (reflectors) along edges
  for (let k = 0; k < 6; k++) { g.fillStyle = '#ffcf6a'; g.fillRect(px(4.4) - 2, py(k * 5), 4, 4); g.fillRect(px(-4.4) - 2, py(k * 5), 4, 4); }
  const t = tex(c, { repeat: false });
  t.anisotropy = 4;
  return t;
}

/** Soft round glow sprite (white, use vertex colour / material colour to tint). */
export function glowTexture() {
  const [c, g] = canvas(64, 64);
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.18, 'rgba(255,255,255,0.85)');
  gr.addColorStop(0.45, 'rgba(255,255,255,0.25)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return tex(c, { srgb: false });
}

/** Soft puff for smoke. */
export function smokeTexture() {
  const [c, g] = canvas(64, 64);
  for (let i = 0; i < 7; i++) {
    const x = 20 + Math.random() * 24, y = 20 + Math.random() * 24, r = 12 + Math.random() * 14;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  }
  return tex(c, { srgb: false });
}

/** Blob shadow under vehicles. */
export function shadowTexture() {
  const [c, g] = canvas(64, 128);
  const gr = g.createRadialGradient(32, 64, 4, 32, 64, 62);
  gr.addColorStop(0, 'rgba(0,0,0,0.75)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.save(); g.scale(1, 1); g.fillStyle = gr; g.fillRect(0, 0, 64, 128); g.restore();
  return tex(c, { srgb: false });
}

/** Headlight pool on the road: bright near the car, fading forward. */
export function beamTexture() {
  const [c, g] = canvas(128, 256);
  g.translate(64, 252); g.scale(1, 3.6);
  const gr = g.createRadialGradient(0, 0, 3, 0, 0, 62);
  gr.addColorStop(0, 'rgba(255,244,214,0.95)');
  gr.addColorStop(0.45, 'rgba(255,236,190,0.4)');
  gr.addColorStop(1, 'rgba(255,230,180,0)');
  g.fillStyle = gr; g.fillRect(-64, -70, 128, 70);
  return tex(c, { srgb: false });
}

const TRUCK_BG = [['#ffcc33', '#e8551e'], ['#2fb7a3', '#f6d93b'], ['#e2336b', '#ffd23f'], ['#3a6fd8', '#ff9f1c']];
/** Painted back of an Indian lorry: original folk-art style. */
export function truckBackTexture(i) {
  const [c, g] = canvas(256, 256);
  const [a, b] = TRUCK_BG[i % TRUCK_BG.length];
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, a); gr.addColorStop(1, b);
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  // decorative border with dots
  g.strokeStyle = '#1b1b4a'; g.lineWidth = 10; g.strokeRect(8, 8, 240, 240);
  g.fillStyle = '#fff';
  for (let k = 0; k < 20; k++) { g.beginPath(); g.arc(14 + k * 12.3, 14, 3, 0, 7); g.fill(); g.beginPath(); g.arc(14 + k * 12.3, 242, 3, 0, 7); g.fill(); }
  // flowers / lotus
  const flower = (x, y, r, col) => {
    g.fillStyle = col;
    for (let p = 0; p < 6; p++) { g.beginPath(); g.ellipse(x + Math.cos(p) * r, y + Math.sin(p) * r, r * 0.8, r * 0.45, p, 0, 7); g.fill(); }
    g.fillStyle = '#ffe14d'; g.beginPath(); g.arc(x, y, r * 0.5, 0, 7); g.fill();
  };
  flower(46, 62, 14, '#d81b60'); flower(210, 62, 14, '#d81b60'); flower(128, 50, 18, '#7b1fa2');
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#b71c1c'; g.font = '900 44px "Baloo 2", Arial Black, sans-serif';
  g.fillText('HORN', 128, 112);
  g.fillStyle = '#0d47a1'; g.font = '900 34px "Baloo 2", Arial Black, sans-serif';
  g.fillText('OK', 128, 150);
  g.fillStyle = '#1b5e20'; g.font = '800 30px "Baloo 2", Arial Black, sans-serif';
  g.fillText('PLEASE', 128, 186);
  g.fillStyle = '#1b1b4a'; g.font = '700 15px "Baloo 2", Arial, sans-serif';
  g.fillText('USE DIPPER AT NIGHT', 128, 222);
  return tex(c);
}

const BOARDS = [
  { bg: ['#ff6b35', '#f7c548'], title: 'RAAHI DHABA', sub: 'Hot parathas • Chai 24 hrs', fg: '#3b0d0d' },
  { bg: ['#7c5cff', '#22d3a6'], title: 'PLAYNEST', sub: 'Daily puzzles • Play free', fg: '#ffffff' },
  { bg: ['#0f9d58', '#c6f432'], title: 'DRIVE SAFE', sub: 'Seatbelt lagao, safe pahuncho', fg: '#ffffff' },
  { bg: ['#d7263d', '#ff9f1c'], title: 'MASALA MILES', sub: 'Pure veg thali • 2 km ahead', fg: '#fff7e0' },
];
export const BOARD_COUNT = BOARDS.length;
export function boardTexture(i) {
  const b = BOARDS[i % BOARDS.length];
  const [c, g] = canvas(512, 256);
  const gr = g.createLinearGradient(0, 0, 512, 256);
  gr.addColorStop(0, b.bg[0]); gr.addColorStop(1, b.bg[1]);
  g.fillStyle = gr; g.fillRect(0, 0, 512, 256);
  g.fillStyle = 'rgba(255,255,255,0.14)';
  for (let k = 0; k < 6; k++) { g.beginPath(); g.arc(440 - k * 30, 40 + k * 10, 60 - k * 6, 0, 7); g.fill(); }
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = b.fg;
  g.font = '900 78px "Baloo 2", Arial Black, sans-serif'; g.fillText(b.title, 256, 104, 480);
  g.font = '700 34px "Baloo 2", Arial, sans-serif'; g.fillText(b.sub, 256, 186, 480);
  g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 10; g.strokeRect(5, 5, 502, 246);
  return tex(c);
}

/** Night city skyline: dark silhouette with lit windows (alpha used for the top edge). */
export function skylineTexture() {
  const W = 1024, H = 256;
  const [c, g] = canvas(W, H);
  g.clearRect(0, 0, W, H);
  let x = 0;
  while (x < W) {
    const w = 18 + Math.random() * 46, h = 50 + Math.random() * 170;
    g.fillStyle = '#ffffff'; g.fillRect(x, H - h, w, h);
    if (Math.random() < 0.2) g.fillRect(x + w / 2 - 1.5, H - h - 24, 3, 24);
    x += w + Math.random() * 4;
  }
  return tex(c, { srgb: false });
}
export function windowsTexture(skyline) {
  const W = 1024, H = 256;
  const [c, g] = canvas(W, H);
  const src = skyline.image.getContext('2d').getImageData(0, 0, W, H).data;
  for (let y = 4; y < H; y += 7) for (let x = 2; x < W; x += 6) {
    if (src[(y * W + x) * 4 + 3] > 0 && src[((y - 4) * W + x) * 4 + 3] > 0 && Math.random() < 0.3) {
      g.fillStyle = Math.random() < 0.8 ? '#ffd27a' : '#bfe6ff'; g.fillRect(x, y, 3, 3);
    }
  }
  return tex(c);
}
