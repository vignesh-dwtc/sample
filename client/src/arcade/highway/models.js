// Procedural low-poly models for Highway Rush. Everything is merged into a few vertex-coloured
// geometries so each object costs only a handful of draw calls.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ROAD_X0, ROAD_X1 } from './textures.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color();

const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 10);
const CYL6 = new THREE.CylinderGeometry(1, 1, 1, 6);
const ICO = new THREE.IcosahedronGeometry(1, 0);
const ICO1 = new THREE.IcosahedronGeometry(1, 1);
const CONE4 = new THREE.ConeGeometry(1, 1, 4);
const PLANE = new THREE.PlaneGeometry(1, 1);

/** Collects transformed, vertex-coloured parts and merges them. */
export class Builder {
  constructor() { this.parts = []; }
  add(geom, color, pos, size, rot, shade = 0) {
    const [x = 0, y = 0, z = 0] = pos || [], [sx = 1, sy = 1, sz = 1] = size || [], [rx = 0, ry = 0, rz = 0] = rot || [];
    const g = geom.index ? geom.toNonIndexed() : geom.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
    g.applyMatrix4(_m);
    const n = g.attributes.position.count, arr = new Float32Array(n * 3);
    _c.set(color);
    for (let i = 0; i < n; i++) {
      // tiny per-vertex variation so flat surfaces don't look plastic
      const f = shade ? 1 - shade * Math.random() : 1;
      arr[i * 3] = _c.r * f; arr[i * 3 + 1] = _c.g * f; arr[i * 3 + 2] = _c.b * f;
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    this.parts.push(g);
    return this;
  }
  box(color, pos, size, rot, shade) { return this.add(BOX, color, pos, size, rot, shade); }
  build() {
    if (!this.parts.length) return new THREE.BufferGeometry();
    const g = mergeGeometries(this.parts);
    this.parts.forEach((p) => p.dispose());
    this.parts = [];
    g.computeBoundingSphere();
    return g;
  }
}

const wheel = (b, x, y, z, r, w) => {
  b.add(CYL, '#141416', [x, y, z], [r, w, r], [0, 0, Math.PI / 2]);
  b.add(CYL6, '#9aa0a8', [x + Math.sign(x) * (w / 2 + 0.005), y, z], [r * 0.55, 0.02, r * 0.55], [0, 0, Math.PI / 2]);
};

// ------------------------------------------------------------------ traffic
// Each spec: paint (tinted per vehicle), fixed, lights (unlit), blinkers, tail/head light points,
// truck back panel. Vehicles face -z; the rear is at +z.
function carSpec() {
  const p = new Builder(), f = new Builder(), l = new Builder();
  p.box('#ffffff', [0, 0.62, 0], [1.8, 0.6, 4.2]);
  p.box('#e6e6e6', [0, 0.95, -1.3], [1.74, 0.1, 1.5], [0.08, 0, 0]);
  p.box('#ffffff', [0, 1.47, 0.35], [1.48, 0.07, 1.6]);
  f.box('#1d2633', [0, 1.18, 0.3], [1.56, 0.5, 2.0]);
  f.box('#2c3a4c', [0, 1.18, -0.75], [1.5, 0.46, 0.3], [-0.6, 0, 0]);
  f.box('#20232a', [0, 0.38, 2.11], [1.84, 0.2, 0.12]);
  f.box('#20232a', [0, 0.38, -2.11], [1.84, 0.2, 0.12]);
  f.box('#f4f4f0', [0, 0.62, 2.12], [0.5, 0.14, 0.04]);
  for (const x of [-0.82, 0.82]) for (const z of [-1.35, 1.35]) wheel(f, x, 0.34, z, 0.34, 0.26);
  l.box('#ff2a2a', [-0.62, 0.82, 2.11], [0.42, 0.13, 0.05]);
  l.box('#ff2a2a', [0.62, 0.82, 2.11], [0.42, 0.13, 0.05]);
  l.box('#fff6d8', [-0.6, 0.75, -2.11], [0.38, 0.13, 0.05]);
  l.box('#fff6d8', [0.6, 0.75, -2.11], [0.38, 0.13, 0.05]);
  return { p, f, l, blink: [[-0.88, 0.82, 2.1], [0.88, 0.82, 2.1]], tails: [[-0.62, 0.82, 2.2], [0.62, 0.82, 2.2]], heads: [[-0.6, 0.75, -2.2], [0.6, 0.75, -2.2]] };
}

function autoSpec() {
  const p = new Builder(), f = new Builder(), l = new Builder();
  p.box('#ffffff', [0, 1.78, 0.25], [1.44, 0.12, 2.2]); // canopy
  p.box('#ffffff', [0, 1.6, 0.25], [1.46, 0.26, 2.18]); // canopy skirt
  p.box('#ffffff', [0, 1.1, 1.3], [1.4, 1.0, 0.1]); // rear panel
  f.box('#2e8b3e', [0, 0.58, 0.35], [1.38, 0.5, 1.9]); // green body
  f.box('#2e8b3e', [0, 0.8, -1.0], [0.85, 0.8, 0.55]); // nose
  f.box('#f2c81a', [0, 0.85, 0.35], [1.4, 0.06, 1.92]);
  f.box('#2a2a2e', [0, 1.0, 0.55], [1.2, 0.35, 0.9]); // seat
  f.box('#1d2633', [0, 1.35, -0.78], [1.0, 0.62, 0.05], [-0.25, 0, 0]); // windscreen
  for (const x of [-0.68, 0.68]) f.box('#2a2a2e', [x, 1.28, -0.7], [0.06, 0.8, 0.06]);
  wheel(f, 0, 0.25, -1.05, 0.25, 0.16);
  wheel(f, -0.62, 0.25, 0.9, 0.25, 0.16);
  wheel(f, 0.62, 0.25, 0.9, 0.25, 0.16);
  l.box('#ff2a2a', [-0.5, 0.62, 1.37], [0.18, 0.12, 0.04]);
  l.box('#ff2a2a', [0.5, 0.62, 1.37], [0.18, 0.12, 0.04]);
  l.box('#fff6d8', [0, 0.95, -1.29], [0.22, 0.16, 0.04]);
  return { p, f, l, blink: [[-0.66, 0.78, 1.37], [0.66, 0.78, 1.37]], tails: [[-0.5, 0.62, 1.45], [0.5, 0.62, 1.45]], heads: [[0, 0.95, -1.4]] };
}

function bikeSpec() {
  const p = new Builder(), f = new Builder(), l = new Builder();
  f.box('#2a2a2e', [0, 0.55, 0], [0.28, 0.32, 1.35]);
  p.box('#ffffff', [0, 0.82, -0.25], [0.36, 0.24, 0.55]); // tank
  f.box('#1a1a1c', [0, 0.82, 0.35], [0.32, 0.1, 0.7]); // seat
  wheel(f, 0, 0.32, -0.68, 0.32, 0.1);
  wheel(f, 0, 0.32, 0.68, 0.32, 0.1);
  f.box('#9aa0a8', [0, 1.0, -0.62], [0.7, 0.04, 0.04]); // handlebar
  p.box('#ffffff', [0, 1.28, 0.12], [0.46, 0.62, 0.32], [-0.25, 0, 0]); // rider shirt
  f.box('#2b3a55', [0, 0.9, 0.2], [0.42, 0.25, 0.5]); // legs
  f.add(ICO1, '#111318', [0, 1.72, -0.02], [0.17, 0.18, 0.19]); // helmet
  l.box('#ff2a2a', [0, 0.78, 0.92], [0.14, 0.1, 0.04]);
  l.box('#fff6d8', [0, 1.02, -0.86], [0.16, 0.14, 0.04]);
  return { p, f, l, blink: [[-0.16, 0.76, 0.9], [0.16, 0.76, 0.9]], tails: [[0, 0.78, 1.0]], heads: [[0, 1.02, -0.95]] };
}

function truckSpec() {
  const p = new Builder(), f = new Builder(), l = new Builder();
  f.box('#2a2a2e', [0, 0.62, 0], [2.0, 0.38, 8.3]); // chassis
  p.box('#ffffff', [0, 1.72, -3.25], [2.4, 1.9, 1.8], null, 0.05); // cab
  p.box('#f0f0f0', [0, 2.95, -3.3], [2.5, 0.45, 2.0], [0.12, 0, 0]); // crown over the cab
  f.box('#1d2633', [0, 2.15, -4.16], [2.15, 0.85, 0.05]); // windscreen
  f.box('#e9e9e9', [0, 1.05, -4.17], [2.0, 0.35, 0.06]); // grille
  f.box('#b07a3a', [0, 2.0, 1.05], [2.5, 2.25, 6.15], null, 0.08); // cargo (wooden)
  p.box('#ffffff', [0, 2.98, 1.05], [2.54, 0.22, 6.2]); // painted top rail
  p.box('#ffffff', [0, 0.98, 1.05], [2.54, 0.22, 6.2]); // painted bottom rail
  for (const z of [-1.5, 0, 1.5, 3.0]) f.box('#8b5a2b', [0, 2.0, z], [2.56, 2.2, 0.08]); // ribs
  f.box('#cfcfcf', [0, 0.72, 4.18], [2.4, 0.18, 0.1]); // bumper
  for (let i = 0; i < 6; i++) f.box(i % 2 ? '#d32f2f' : '#ffffff', [-1.0 + i * 0.4, 0.72, 4.24], [0.4, 0.17, 0.03]);
  f.box('#151515', [-1.0, 0.75, 3.6], [0.35, 0.5, 0.04]); // mud flaps
  f.box('#151515', [1.0, 0.75, 3.6], [0.35, 0.5, 0.04]);
  for (const z of [-3.0, 1.7, 2.9]) for (const x of [-1.02, 1.02]) wheel(f, x, 0.5, z, 0.5, 0.42);
  l.box('#ff2a2a', [-1.05, 0.95, 4.2], [0.3, 0.16, 0.05]);
  l.box('#ff2a2a', [1.05, 0.95, 4.2], [0.3, 0.16, 0.05]);
  l.box('#fff6d8', [-0.9, 1.05, -4.18], [0.32, 0.18, 0.05]);
  l.box('#fff6d8', [0.9, 1.05, -4.18], [0.32, 0.18, 0.05]);
  return { p, f, l, blink: [[-1.12, 1.18, 4.2], [1.12, 1.18, 4.2]], tails: [[-1.05, 0.95, 4.3], [1.05, 0.95, 4.3]], heads: [[-0.9, 1.05, -4.3], [0.9, 1.05, -4.3]], back: { w: 2.38, h: 1.9, y: 2.0, z: 4.14 } };
}

function busSpec() {
  const p = new Builder(), f = new Builder(), l = new Builder();
  p.box('#ffffff', [0, 1.78, 0], [2.6, 2.6, 11], null, 0.04);
  f.box('#1d2633', [0, 2.3, 0.3], [2.63, 0.85, 9.6]); // windows band
  f.box('#f5f5f0', [0, 1.45, 0], [2.63, 0.22, 11.03]); // stripe
  f.box('#d9d9d9', [0, 3.12, 0], [2.3, 0.16, 10]); // roof
  f.box('#1d2633', [0, 2.35, 5.51], [2.2, 0.8, 0.05]); // rear window
  f.box('#1d2633', [0, 2.2, -5.51], [2.35, 1.1, 0.05]); // windscreen
  f.box('#f2c81a', [0, 3.0, 5.52], [1.4, 0.25, 0.04]); // route board
  f.box('#20232a', [0, 0.55, 5.52], [2.62, 0.25, 0.08]);
  for (const z of [-3.6, 3.4]) for (const x of [-1.08, 1.08]) wheel(f, x, 0.5, z, 0.5, 0.36);
  l.box('#ff2a2a', [-1.05, 0.95, 5.52], [0.32, 0.2, 0.05]);
  l.box('#ff2a2a', [1.05, 0.95, 5.52], [0.32, 0.2, 0.05]);
  l.box('#fff6d8', [-0.95, 0.95, -5.52], [0.36, 0.2, 0.05]);
  l.box('#fff6d8', [0.95, 0.95, -5.52], [0.36, 0.2, 0.05]);
  return { p, f, l, blink: [[-1.2, 1.22, 5.52], [1.2, 1.22, 5.52]], tails: [[-1.05, 0.95, 5.62], [1.05, 0.95, 5.62]], heads: [[-0.95, 0.95, -5.62], [0.95, 0.95, -5.62]] };
}

export const PAINTS = {
  car: ['#e8eaee', '#c0c4cc', '#d9302c', '#1f5fbf', '#2b2d33', '#f2f2f2', '#8b1e3f', '#2f8f6b', '#e07b22'],
  auto: ['#f2c81a', '#f2c81a', '#1d1d1f'],
  bike: ['#d93a3a', '#3a7bd9', '#f0c419', '#ffffff', '#47a447'],
  truck: ['#f28c28', '#d93a3a', '#2f7fd8', '#2a9d5a', '#e5b81c'],
  bus: ['#c7352f', '#2462b8', '#e8e3d0', '#2d8a5b'],
};

const SPECS = { car: carSpec, auto: autoSpec, bike: bikeSpec, truck: truckSpec, bus: busSpec };
/** Build geometry sets for every traffic kind once. */
export function buildTrafficKits() {
  const kits = {};
  for (const [k, fn] of Object.entries(SPECS)) {
    const s = fn();
    kits[k] = { paint: s.p.build(), fixed: s.f.build(), lights: s.l.build(), blink: s.blink, tails: s.tails, heads: s.heads, back: s.back || null };
  }
  return kits;
}

// ------------------------------------------------------------------ player car
export function buildPlayerCar(envMap) {
  const group = new THREE.Group();
  // side profile (z, y), extruded across x. Front at -z.
  const prof = new THREE.Shape();
  const pts = [[-2.2, 0.32], [-2.28, 0.5], [-2.15, 0.66], [-1.2, 0.8], [1.6, 0.86], [2.18, 0.9], [2.22, 0.62], [2.12, 0.32]];
  prof.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) prof.lineTo(pts[i][0], pts[i][1]);
  prof.closePath();
  const bodyG = new THREE.ExtrudeGeometry(prof, { depth: 1.86, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.08, bevelSegments: 2, steps: 1 });
  bodyG.translate(0, 0, -0.93); bodyG.rotateY(Math.PI / 2);
  const paint = new THREE.MeshStandardMaterial({ color: '#c80c22', metalness: 0.6, roughness: 0.3, envMap, envMapIntensity: 0.75 });
  const body = new THREE.Mesh(bodyG, paint);
  group.add(body);

  const cab = new THREE.Shape();
  const cp = [[-1.05, 0.78], [-0.1, 1.3], [0.9, 1.3], [1.75, 0.86]];
  cab.moveTo(cp[0][0], cp[0][1]);
  for (let i = 1; i < cp.length; i++) cab.lineTo(cp[i][0], cp[i][1]);
  cab.closePath();
  const cabG = new THREE.ExtrudeGeometry(cab, { depth: 1.5, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.06, bevelSegments: 2 });
  cabG.translate(0, 0, -0.75); cabG.rotateY(Math.PI / 2);
  const glass = new THREE.MeshStandardMaterial({ color: '#0d1420', metalness: 0.9, roughness: 0.12, envMap, envMapIntensity: 1.5 });
  group.add(new THREE.Mesh(cabG, glass));
  // roof stripe in paint colour
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.05, 0.95), paint);
  roof.position.set(0, 1.35, 0.4); group.add(roof);

  const f = new Builder();
  // racing stripes, spoiler, skirts, diffuser
  f.box('#f5f5f5', [-0.22, 0.915, -1.0], [0.16, 0.02, 2.3], [-0.03, 0, 0]);
  f.box('#f5f5f5', [0.22, 0.915, -1.0], [0.16, 0.02, 2.3], [-0.03, 0, 0]);
  f.box('#111216', [0, 1.12, 2.02], [1.9, 0.06, 0.38]); // wing
  f.box('#111216', [-0.7, 1.0, 2.02], [0.07, 0.22, 0.2]);
  f.box('#111216', [0.7, 1.0, 2.02], [0.07, 0.22, 0.2]);
  f.box('#16171c', [0, 0.36, 2.2], [1.7, 0.16, 0.2]);
  f.box('#16171c', [-0.97, 0.36, 0], [0.08, 0.14, 3.0]);
  f.box('#16171c', [0.97, 0.36, 0], [0.08, 0.14, 3.0]);
  f.box('#16171c', [0, 0.42, -2.28], [1.4, 0.12, 0.1]);
  f.add(CYL, '#888c94', [-0.45, 0.38, 2.27], [0.07, 0.12, 0.07], [Math.PI / 2, 0, 0]); // exhausts
  f.add(CYL, '#888c94', [0.45, 0.38, 2.27], [0.07, 0.12, 0.07], [Math.PI / 2, 0, 0]);
  f.box('#151515', [0, 0.25, 0], [1.6, 0.12, 3.9]);
  const trim = new THREE.Mesh(f.build(), new THREE.MeshLambertMaterial({ vertexColors: true }));
  group.add(trim);

  const lights = new Builder();
  lights.box('#ff1a3a', [0, 0.78, 2.235], [1.7, 0.08, 0.04]); // full-width tail-light bar
  lights.box('#ff3355', [-0.72, 0.74, 2.23], [0.3, 0.14, 0.05]);
  lights.box('#ff3355', [0.72, 0.74, 2.23], [0.3, 0.14, 0.05]);
  lights.box('#eaf6ff', [-0.66, 0.66, -2.2], [0.42, 0.08, 0.08], [0, 0.25, 0]);
  lights.box('#eaf6ff', [0.66, 0.66, -2.2], [0.42, 0.08, 0.08], [0, -0.25, 0]);
  group.add(new THREE.Mesh(lights.build(), new THREE.MeshBasicMaterial({ vertexColors: true })));

  // wheels (separate so they can spin)
  const wheels = [];
  const tyre = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 16); tyre.rotateZ(Math.PI / 2);
  const rim = new THREE.CylinderGeometry(0.24, 0.24, 0.32, 5); rim.rotateZ(Math.PI / 2);
  const tyreM = new THREE.MeshLambertMaterial({ color: '#141416' });
  const rimM = new THREE.MeshStandardMaterial({ color: '#c9ced6', metalness: 0.9, roughness: 0.3, envMap });
  for (const x of [-0.86, 0.86]) for (const z of [-1.38, 1.4]) {
    const w = new THREE.Group();
    w.add(new THREE.Mesh(tyre, tyreM), new THREE.Mesh(rim, rimM));
    w.position.set(x, 0.36, z);
    group.add(w); wheels.push(w);
  }
  return { group, wheels, paint, tails: [[-0.72, 0.76, 2.3], [0.72, 0.76, 2.3]], heads: [[-0.66, 0.66, -2.3], [0.66, 0.66, -2.3]], exhausts: [[-0.45, 0.38, 2.4], [0.45, 0.38, 2.4]] };
}

// ------------------------------------------------------------------ roadside
function palm(b, x, z, h, lean, rng) {
  const segs = 5;
  let px = x, pz = z, py = 0;
  for (let i = 0; i < segs; i++) {
    const r = 0.2 - i * 0.02;
    const nx = px + lean * 0.25, ny = py + h / segs;
    b.add(CYL6, i % 2 ? '#7d5c3c' : '#6b4d31', [(px + nx) / 2, (py + ny) / 2, pz], [r, h / segs + 0.05, r], [0, 0, -Math.atan2(nx - px, h / segs)]);
    px = nx; py = ny;
  }
  const fronds = 8;
  for (let i = 0; i < fronds; i++) {
    const a = (i / fronds) * Math.PI * 2 + rng() * 0.4;
    const len = 2.6 + rng() * 0.8;
    b.add(CONE4, i % 2 ? '#2f7d32' : '#3f9a3a', [0, len / 2, 0], [0.45, len, 0.1], null, 0.1);
    const g = b.parts[b.parts.length - 1];
    g.applyMatrix4(_m.makeRotationZ(-(Math.PI / 2 + 0.3 + rng() * 0.3)));
    g.applyMatrix4(_m.makeRotationY(-a));
    g.translate(px, py, pz);
  }
  b.add(ICO, '#5a3d1e', [px, py - 0.25, pz], [0.32, 0.32, 0.32]);
}

function tree(b, x, z, s, rng) {
  b.add(CYL6, '#5b4029', [x, 1.4 * s, z], [0.22 * s, 2.8 * s, 0.22 * s]);
  const greens = ['#3f7a2b', '#4f8f35', '#2f6624', '#5c9a3a'];
  const n = 3 + Math.floor(rng() * 2);
  for (let i = 0; i < n; i++) {
    b.add(ICO, greens[Math.floor(rng() * greens.length)], [x + (rng() - 0.5) * 1.8 * s, (3.1 + rng() * 1.3) * s, z + (rng() - 0.5) * 1.8 * s], [(1.3 + rng() * 0.6) * s, (1.0 + rng() * 0.4) * s, (1.3 + rng() * 0.6) * s], [rng(), rng(), 0], 0.12);
  }
}

function shrub(b, x, z, rng) {
  b.add(ICO, rng() < 0.5 ? '#2e7a34' : '#3d8a3a', [x, 0.55, z], [0.62, 0.5, 0.62], [rng(), rng(), 0], 0.15);
  for (let i = 0; i < 3; i++) b.add(ICO, rng() < 0.6 ? '#ff6fa8' : '#fff2f6', [x + (rng() - 0.5) * 0.8, 0.75 + rng() * 0.3, z + (rng() - 0.5) * 0.8], [0.12, 0.12, 0.12]);
}

/** Decor geometry for one road segment variant (merged). z is 0..-len (segment local). */
export function buildSegmentDecor(len, rng, variant) {
  const b = new Builder();
  const lamps = new Builder();
  // median kerbs: black & yellow
  const n = Math.round(len / 1.5);
  for (const x of [4.95, 7.05]) for (let i = 0; i < n; i++) b.box(i % 2 ? '#f2c81a' : '#1d1d1f', [x, 0.14, -i * 1.5 - 0.75], [0.26, 0.28, 1.5]);
  b.box('#6b5a3c', [6.0, 0.2, -len / 2], [1.85, 0.12, len]); // raised median earth
  for (let z = -1.5; z > -len; z -= 2.6) if (Math.abs(z + len / 2) > 1.6) shrub(b, 6.0 + (rng() - 0.5) * 0.4, z, rng);
  // streetlight on the median, two arms
  const lz = -len / 2;
  b.add(CYL6, '#8d939b', [6.0, 4.6, lz], [0.12, 9.2, 0.12]);
  b.box('#8d939b', [5.0, 9.1, lz], [2.2, 0.1, 0.12], [0, 0, -0.08]);
  b.box('#8d939b', [7.0, 9.1, lz], [2.2, 0.1, 0.12], [0, 0, 0.08]);
  b.box('#5f6670', [6.0, 0.6, lz], [0.4, 1.0, 0.4]);
  lamps.box('#ffffff', [3.95, 8.98, lz], [0.95, 0.12, 0.42]);
  lamps.box('#ffffff', [8.05, 8.98, lz], [0.95, 0.12, 0.42]);
  // left verge: palms & trees
  let z = -2 - rng() * 4;
  while (z > -len) {
    const r = rng();
    if (r < 0.45) palm(b, -8 - rng() * 4, z, 6 + rng() * 3, (rng() - 0.3) * 1.2, rng);
    else if (r < 0.85) tree(b, -10 - rng() * 12, z, 0.9 + rng() * 0.6, rng);
    z -= 6 + rng() * 7;
  }
  // right verge beyond the oncoming carriageway
  z = -3 - rng() * 5;
  while (z > -len) {
    if (rng() < 0.55) tree(b, 21 + rng() * 14, z, 0.9 + rng() * 0.7, rng); else palm(b, 20 + rng() * 3, z, 6 + rng() * 3, (rng() - 0.6) * 1.2, rng);
    z -= 7 + rng() * 8;
  }
  // milestone (km stone) on some variants
  if (variant % 2 === 0) {
    b.box('#f4f1e8', [-7, 0.35, -len * 0.3], [0.5, 0.7, 0.22]);
    b.add(CYL, '#f2c81a', [-7, 0.7, -len * 0.3], [0.25, 0.22, 0.25], [Math.PI / 2, 0, 0]);
  }
  // fence posts on the far left
  for (let k = 0; k < len; k += 5) b.box('#d8d2c2', [-27, 0.5, -k], [0.15, 1.0, 0.15]);
  return { decor: b.build(), lamps: lamps.build(), lampPositions: [[3.95, 8.9, lz], [8.05, 8.9, lz]] };
}

/** Road surface plane for one segment (local z 0..-len). */
export function roadPlane(len) {
  const g = new THREE.PlaneGeometry(ROAD_X1 - ROAD_X0, len);
  g.rotateX(-Math.PI / 2);
  g.translate((ROAD_X0 + ROAD_X1) / 2, 0, -len / 2);
  return g;
}

/** Billboard on two posts; the board faces the road (+z, toward the driver). */
export function buildBillboard(texture) {
  const g = new THREE.Group();
  const b = new Builder();
  for (const x of [-2.6, 2.6]) b.box('#6d7480', [x, 3.2, 0], [0.25, 6.4, 0.25]);
  b.box('#2a2d33', [0, 6.6, -0.08], [8.4, 4.4, 0.15]);
  b.box('#4a4f58', [0, 4.35, 0.3], [8.0, 0.08, 0.7]);
  g.add(new THREE.Mesh(b.build(), new THREE.MeshLambertMaterial({ vertexColors: true })));
  const board = new THREE.Mesh(PLANE.clone(), new THREE.MeshLambertMaterial({ map: texture, emissive: '#ffffff', emissiveMap: texture, emissiveIntensity: 0.15 }));
  board.scale.set(8, 4, 1); board.position.set(0, 6.6, 0.01);
  g.add(board);
  return { group: g, board };
}

/** Roadside dhaba: low building, tin roof, sign, cots and a string of bulbs. */
export function buildDhaba(signTex) {
  const g = new THREE.Group();
  const b = new Builder();
  b.box('#e9c9a3', [0, 1.6, 0], [9, 3.2, 5], null, 0.06);
  b.box('#b5562f', [0, 3.45, 0.6], [10, 0.18, 6.6], [0.12, 0, 0]);
  b.box('#5a3a22', [0, 1.1, 2.51], [1.6, 2.2, 0.05]);
  b.box('#2b88c9', [-3, 1.6, 2.51], [1.5, 1.0, 0.05]);
  b.box('#2b88c9', [3, 1.6, 2.51], [1.5, 1.0, 0.05]);
  for (const x of [-4.2, 4.2]) b.box('#6b4d31', [x, 1.5, 3.6], [0.15, 3.0, 0.15]);
  for (const [x, z] of [[-2.5, 5.2], [1.8, 5.6], [3.6, 4.6]]) {
    b.box('#8b5a2b', [x, 0.45, z], [2.0, 0.12, 0.9]);
    b.box('#d9b44a', [x, 0.52, z], [1.8, 0.04, 0.75]);
    for (const dx of [-0.9, 0.9]) for (const dz of [-0.38, 0.38]) b.box('#5a3a22', [x + dx, 0.22, z + dz], [0.08, 0.44, 0.08]);
  }
  b.add(CYL, '#d9d2c4', [-5.5, 0.5, 4], [0.5, 1.0, 0.5]); // water drum
  g.add(new THREE.Mesh(b.build(), new THREE.MeshLambertMaterial({ vertexColors: true })));
  const sign = new THREE.Mesh(PLANE.clone(), new THREE.MeshLambertMaterial({ map: signTex, emissive: '#ffffff', emissiveMap: signTex, emissiveIntensity: 0.2 }));
  sign.scale.set(6, 3, 1); sign.position.set(0, 5.2, 1.2);
  g.add(sign);
  const bulbs = [];
  for (let i = 0; i <= 10; i++) bulbs.push([-4.2 + i * 0.84, 2.9 - Math.sin((i / 10) * Math.PI) * 0.4, 3.62]);
  return { group: g, bulbs };
}

/** Distant hills ridge (a strip of triangles). */
export function buildHills(width, baseY, height, z, seed, rng) {
  const N = 60, pos = [];
  let prev = null;
  for (let i = 0; i <= N; i++) {
    const x = -width / 2 + (i / N) * width;
    const y = baseY + height * (0.35 + 0.65 * Math.abs(Math.sin(i * 0.37 + seed) * Math.cos(i * 0.13 + seed * 2))) * (0.7 + rng() * 0.3);
    if (prev) pos.push(prev[0], baseY - 40, z, x, baseY - 40, z, prev[0], prev[1], z, prev[0], prev[1], z, x, baseY - 40, z, x, y, z);
    prev = [x, y];
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}
