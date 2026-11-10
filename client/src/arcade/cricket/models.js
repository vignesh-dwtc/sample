// Low-poly procedural cricketers, stumps and bails.
import * as THREE from 'three';
import { TOWER_ANGLES } from './stadium.js';

const geo = {};
function g(name, make) { return (geo[name] ||= make()); }
export function resetGeoCache() { for (const k of Object.keys(geo)) delete geo[k]; }

const mats = new Map();
function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!mats.has(key)) mats.set(key, new THREE.MeshLambertMaterial({ color, ...opts }));
  return mats.get(key);
}
export function resetMatCache() { mats.clear(); }

let shadowTex;
function shadowTexture() {
  if (shadowTex) return shadowTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const r = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(0,0,0,0.55)'); r.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = r; x.fillRect(0, 0, 64, 64);
  shadowTex = new THREE.CanvasTexture(c);
  return shadowTex;
}
export function resetShadowTex() { shadowTex = null; }

/** Four faint floodlight shadows radiating away from the towers (classic night-match look). */
export function floodShadows(scale = 1) {
  const grp = new THREE.Group();
  const m = new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, opacity: 0.6 });
  const plane = g('shadowPlane', () => { const p = new THREE.PlaneGeometry(1, 1); p.rotateX(-Math.PI / 2); p.translate(0, 0, -0.5); return p; });
  for (const a of TOWER_ANGLES) {
    const s = new THREE.Mesh(plane, m);
    s.scale.set(0.7 * scale, 1, 2.2 * scale);
    s.rotation.y = Math.PI - a; // point away from the tower
    s.position.y = 0.012;
    grp.add(s);
  }
  const blob = new THREE.Mesh(g('blob', () => { const p = new THREE.PlaneGeometry(1, 1); p.rotateX(-Math.PI / 2); return p; }), m);
  blob.scale.set(0.9 * scale, 1, 0.9 * scale); blob.position.y = 0.014; grp.add(blob);
  grp.renderOrder = 1;
  return grp;
}

/**
 * A cricketer facing local +z. Returns { root, parts } with pivots for animation.
 * kit: { shirt, trousers, skin, cap ('helmet'|'cap'|'hat'), pads, gloves, bat }
 */
export function makePlayer(kit) {
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const shirt = mat(kit.shirt), trousers = mat(kit.trousers), skin = mat(kit.skin || 0xa8714a);
  const hips = new THREE.Group(); hips.position.y = 0.95; body.add(hips);
  const pelvis = new THREE.Mesh(g('pelvis', () => new THREE.BoxGeometry(0.34, 0.2, 0.22)), trousers); hips.add(pelvis);

  const legs = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(side * 0.1, -0.05, 0); hips.add(leg);
    const thigh = new THREE.Mesh(g('thigh', () => { const c = new THREE.CylinderGeometry(0.075, 0.062, 0.46, 7); c.translate(0, -0.23, 0); return c; }), trousers);
    leg.add(thigh);
    const knee = new THREE.Group(); knee.position.y = -0.45; leg.add(knee);
    const shin = new THREE.Mesh(g('shin', () => { const c = new THREE.CylinderGeometry(0.06, 0.05, 0.44, 7); c.translate(0, -0.22, 0); return c; }), kit.pads ? mat(0xf4f4ee) : trousers);
    if (kit.pads) shin.scale.set(1.45, 1.05, 1.55);
    knee.add(shin);
    const shoe = new THREE.Mesh(g('shoe', () => { const b = new THREE.BoxGeometry(0.1, 0.07, 0.24); b.translate(0, -0.45, 0.05); return b; }), mat(0xf0f0f0));
    knee.add(shoe);
    legs.push({ leg, knee });
  }

  const torso = new THREE.Group(); torso.position.y = 1.02; body.add(torso);
  const chest = new THREE.Mesh(g('chest', () => { const c = new THREE.CapsuleGeometry(0.16, 0.32, 4, 8); c.scale(1.15, 1, 0.72); c.translate(0, 0.28, 0); return c; }), shirt);
  torso.add(chest);
  const neck = new THREE.Mesh(g('neck', () => new THREE.CylinderGeometry(0.05, 0.06, 0.1, 6)), skin); neck.position.y = 0.6; torso.add(neck);
  const head = new THREE.Group(); head.position.y = 0.72; torso.add(head);
  head.add(new THREE.Mesh(g('head', () => new THREE.SphereGeometry(0.11, 12, 10)), skin));
  if (kit.cap === 'helmet') {
    const hm = new THREE.MeshPhongMaterial({ color: kit.helmet || 0x14306b, shininess: 80, specular: 0x8899cc });
    const shell = new THREE.Mesh(g('helmet', () => new THREE.SphereGeometry(0.128, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.58)), hm);
    shell.position.y = 0.015; head.add(shell);
    const peak = new THREE.Mesh(g('peak', () => new THREE.BoxGeometry(0.2, 0.015, 0.09)), hm); peak.position.set(0, 0.035, 0.12); head.add(peak);
    const grille = new THREE.Mesh(g('grille', () => new THREE.TorusGeometry(0.11, 0.01, 4, 12, Math.PI)), mat(0xc0c4cc));
    grille.rotation.set(0, 0, Math.PI); grille.position.set(0, -0.02, 0.03); grille.scale.set(1, 0.8, 1.1); head.add(grille);
  } else if (kit.cap) {
    const cm = mat(kit.capColor || kit.shirt);
    const crown = new THREE.Mesh(g('cap', () => new THREE.SphereGeometry(0.118, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5)), cm); crown.position.y = 0.02; head.add(crown);
    const brim = new THREE.Mesh(g(kit.cap === 'hat' ? 'hatbrim' : 'capbrim', () => (kit.cap === 'hat' ? new THREE.CylinderGeometry(0.2, 0.2, 0.012, 14) : new THREE.BoxGeometry(0.18, 0.012, 0.12))), cm);
    brim.position.set(0, 0.03, kit.cap === 'hat' ? 0 : 0.1); head.add(brim);
  }

  // Shoulders rig holds both arms; batters also hold the bat in it.
  const shoulders = new THREE.Group(); shoulders.position.y = 0.48; torso.add(shoulders);
  const arms = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(side * 0.21, 0, 0); shoulders.add(arm);
    const upper = new THREE.Mesh(g('upper', () => { const c = new THREE.CylinderGeometry(0.052, 0.045, 0.32, 6); c.translate(0, -0.16, 0); return c; }), shirt);
    arm.add(upper);
    const elbow = new THREE.Group(); elbow.position.y = -0.31; arm.add(elbow);
    const fore = new THREE.Mesh(g('fore', () => { const c = new THREE.CylinderGeometry(0.043, 0.036, 0.3, 6); c.translate(0, -0.15, 0); return c; }), skin);
    elbow.add(fore);
    const hand = new THREE.Mesh(g(kit.gloves ? 'glove' : 'hand', () => new THREE.SphereGeometry(kit.gloves ? 0.065 : 0.045, 8, 6)), kit.gloves ? mat(kit.gloves) : skin);
    hand.position.y = -0.31; elbow.add(hand);
    arms.push({ arm, elbow, hand });
  }

  let bat = null;
  if (kit.bat) {
    bat = new THREE.Group();
    const handle = new THREE.Mesh(g('handle', () => { const c = new THREE.CylinderGeometry(0.018, 0.018, 0.3, 6); c.translate(0, -0.15, 0); return c; }), mat(0x1c1c1c));
    bat.add(handle);
    const blade = new THREE.Mesh(g('blade', () => { const b = new THREE.BoxGeometry(0.108, 0.56, 0.05); b.translate(0, -0.58, 0); return b; }), mat(0xe9d3a0));
    bat.add(blade);
    const sticker = new THREE.Mesh(g('sticker', () => { const b = new THREE.BoxGeometry(0.09, 0.2, 0.052); b.translate(0, -0.48, 0); return b; }), mat(kit.bat));
    bat.add(sticker);
  }
  root.add(floodShadows(1));
  return { root, parts: { body, hips, torso, head, shoulders, legs, arms, bat } };
}

/** Set a simple running pose. phase in radians, amt 0..1. */
export function poseRun(p, phase, amt = 1) {
  const s = Math.sin(phase) * amt;
  p.legs[0].leg.rotation.x = s * 0.9; p.legs[1].leg.rotation.x = -s * 0.9;
  p.legs[0].knee.rotation.x = Math.max(0, -s) * 1.2 + 0.1 * amt; p.legs[1].knee.rotation.x = Math.max(0, s) * 1.2 + 0.1 * amt;
  p.arms[0].arm.rotation.x = -s * 0.8; p.arms[1].arm.rotation.x = s * 0.8;
  p.arms[0].elbow.rotation.x = -0.9 * amt; p.arms[1].elbow.rotation.x = -0.9 * amt;
  p.torso.rotation.x = 0.18 * amt;
  p.body.position.y = Math.abs(Math.cos(phase)) * 0.06 * amt;
}
export function poseIdle(p, t = 0) {
  for (const l of p.legs) { l.leg.rotation.set(0, 0, 0); l.knee.rotation.x = 0.12; }
  p.arms[0].arm.rotation.set(0, 0, 0.12); p.arms[1].arm.rotation.set(0, 0, -0.12);
  p.arms[0].elbow.rotation.x = -0.25; p.arms[1].elbow.rotation.x = -0.25;
  p.torso.rotation.set(0.04 + Math.sin(t * 1.7) * 0.02, 0, 0);
  p.body.position.y = 0;
}
/** Fielder ready crouch (walking in). */
export function poseCrouch(p, k) {
  for (const l of p.legs) { l.leg.rotation.x = -0.5 * k; l.knee.rotation.x = 0.9 * k; }
  p.legs[0].leg.rotation.z = 0.15 * k; p.legs[1].leg.rotation.z = -0.15 * k;
  p.torso.rotation.x = 0.5 * k; p.body.position.y = -0.14 * k;
  p.arms[0].arm.rotation.set(-0.6 * k, 0, 0.2); p.arms[1].arm.rotation.set(-0.6 * k, 0, -0.2);
}
/** Arms up (catch / celebration). */
export function poseArmsUp(p, k) {
  p.arms[0].arm.rotation.set(0, 0, 2.7 * k); p.arms[1].arm.rotation.set(0, 0, -2.7 * k);
  p.arms[0].elbow.rotation.x = 0; p.arms[1].elbow.rotation.x = 0;
}

/** Stumps (3) + bails (2). Returns { group, stumps:[Mesh], bails:[Mesh], baseline } for resetting. */
export function makeStumps() {
  const group = new THREE.Group();
  const wood = new THREE.MeshPhongMaterial({ color: 0xf2e6c6, shininess: 40 });
  const bailMat = new THREE.MeshPhongMaterial({ color: 0xffe9a8, emissive: 0x000000, shininess: 60 });
  const stumpGeo = g('stump', () => { const c = new THREE.CylinderGeometry(0.018, 0.018, 0.71, 8); c.translate(0, 0.355, 0); return c; });
  const bailGeo = g('bail', () => { const c = new THREE.CylinderGeometry(0.008, 0.008, 0.11, 6); c.rotateZ(Math.PI / 2); return c; });
  const stumps = [-0.105, 0, 0.105].map((x) => { const m = new THREE.Mesh(stumpGeo, wood); m.position.set(x, 0, 0); group.add(m); return m; });
  const bails = [-0.0525, 0.0525].map((x) => { const m = new THREE.Mesh(bailGeo, bailMat); m.position.set(x, 0.722, 0); group.add(m); return m; });
  const baseline = [...stumps, ...bails].map((m) => ({ m, p: m.position.clone(), r: m.rotation.clone() }));
  return { group, stumps, bails, bailMat, baseline };
}
