// Cricket Blitz 3D engine: renderer, scene, game loop, input and camera.
// React talks to it through createEngine(container, { onEvent }) and the returned controls.
import * as THREE from 'three';
import { sound, haptic, reducedMotion } from '../../fx/index.js';
import {
  makeRng, planDelivery, deliveryPath, ballAt, decideShot, launchFor, stepBall, newInnings, applyBall,
  BALL_R, CONTACT_Z, ROPE_R, PITCH_LEN, SIM_SLOW, clamp,
} from './logic.js';
import { buildStadium, glowTexture, standY } from './stadium.js';
import { makePlayer, makeStumps, poseRun, poseIdle, poseCrouch, poseArmsUp, floodShadows, resetGeoCache, resetMatCache, resetShadowTex } from './models.js';

export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch { return false; }
}

const DEG = Math.PI / 180;
// Dev-only: ?ckfast lets slow headless test browsers (software WebGL) take bigger steps.
const MAX_DT = import.meta.env?.DEV && typeof location !== 'undefined' && location.search.includes('ckfast') ? 0.1 : 0.05;
const BAT_KIT = { shirt: 0x1f5fd6, trousers: 0x173a85, skin: 0x9a6440, cap: 'helmet', helmet: 0x0f2a66, pads: true, gloves: 0xf5f5f0, bat: 0x22d3a6 };
const FIELD_KIT = { shirt: 0xf07a1a, trousers: 0x7a2a12, skin: 0x8a5a3a, cap: 'cap', capColor: 0x7a2a12 };
const KEEPER_KIT = { ...FIELD_KIT, cap: 'helmet', helmet: 0x7a2a12, pads: true, gloves: 0xffd166 };
const FIELD_POS = [
  ['keeper', 0.3, 13.5], ['slip', 2.2, 14.8], ['third man', 36, 44], ['point', 26, 0], ['cover', 23, -16],
  ['mid-off', 9, -36], ['mid-on', -10, -35], ['midwicket', -26, -13], ['square leg', -27, 3], ['fine leg', -30, 40],
];
const BATTER_POS = new THREE.Vector3(-0.42, 0, -1.02);
const BAT_CAM = { pos: new THREE.Vector3(0.25, 2.5, 4.4), look: new THREE.Vector3(0, 0.85, -10) };

export function createEngine(container, { onEvent = () => {}, seed = (Date.now() & 0xffffff) } = {}) {
  const lowEnd = (navigator.hardwareConcurrency || 4) <= 4 || /Android|iPhone|iPad/i.test(navigator.userAgent);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  let pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
  renderer.setPixelRatio(pixelRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const canvas = renderer.domElement;
  canvas.className = 'ck-canvas';
  container.appendChild(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 900);
  const stadium = buildStadium(scene, { lowEnd });
  const rand = makeRng(seed);
  const glow = glowTexture();

  // ---------- actors ----------
  const strikerStumps = makeStumps(); scene.add(strikerStumps.group);
  const bowlerStumps = makeStumps(); bowlerStumps.group.position.z = -PITCH_LEN; scene.add(bowlerStumps.group);

  const batter = makePlayer(BAT_KIT);
  batter.root.position.copy(BATTER_POS); batter.root.rotation.y = Math.PI / 2; scene.add(batter.root);
  const bp = batter.parts;
  bp.shoulders.add(bp.bat); bp.bat.position.set(0, -0.56, 0.3);
  const nonStriker = makePlayer(BAT_KIT);
  scene.add(nonStriker.root);
  nonStriker.parts.arms[0].elbow.add(nonStriker.parts.bat); nonStriker.parts.bat.position.set(0, -0.3, 0); nonStriker.parts.bat.rotation.x = 0.4;
  const bowler = makePlayer(FIELD_KIT); scene.add(bowler.root);
  const umpire = makePlayer({ shirt: 0xf4f4f4, trousers: 0x222222, cap: 'hat', capColor: 0xf4f4f4 });
  umpire.root.position.set(-0.7, 0, -PITCH_LEN - 2.6); scene.add(umpire.root);
  const fielders = FIELD_POS.map(([name, x, z], i) => {
    const f = makePlayer(i === 0 ? KEEPER_KIT : FIELD_KIT);
    f.root.position.set(x, 0, z);
    scene.add(f.root);
    return { name, f, home: new THREE.Vector3(x, 0, z), target: new THREE.Vector3(), chasing: false, runPhase: rand() * 6, holding: false };
  });

  // Ball, trail, shadow, pitch marker.
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.055, 14, 10), new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x666666 }));
  scene.add(ball);
  const trailMat = new THREE.SpriteMaterial({ map: glow, color: 0xfff1c4, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  const TRAIL = 14, trail = [], trailPos = new Float32Array(TRAIL * 3);
  for (let i = 0; i < TRAIL; i++) { const s = new THREE.Sprite(trailMat); s.scale.setScalar(0.28 * (1 - i / TRAIL)); scene.add(s); trail.push(s); }
  const ballShadow = floodShadows(0.12); scene.add(ballShadow);
  const marker = new THREE.Group();
  const markerRing = new THREE.Mesh(new THREE.RingGeometry(0.17, 0.24, 28), new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, depthWrite: false, toneMapped: false }));
  markerRing.rotation.x = -Math.PI / 2; marker.add(markerRing);
  const markerDot = new THREE.Mesh(new THREE.CircleGeometry(0.07, 16), markerRing.material); markerDot.rotation.x = -Math.PI / 2; marker.add(markerDot);
  marker.position.y = 0.02; scene.add(marker);

  // Particles: one Points system for big sky fireworks, one for small sparks/dust near the bat.
  function makeParticles(NP, size) {
    const pos = new Float32Array(NP * 3), vel = new Float32Array(NP * 3), col = new Float32Array(NP * 3), base = new Float32Array(NP * 3);
    const life = new Float32Array(NP), max = new Float32Array(NP), grav = new Float32Array(NP);
    for (let i = 0; i < NP; i++) pos[i * 3 + 1] = -999;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size, map: glow, vertexColors: true, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false, toneMapped: false }));
    pts.frustumCulled = false; scene.add(pts);
    let cursor = 0, alive = 0;
    return {
      emit(x, y, z, n, color, speed, lf, g = 4, spread = 1) {
        if (reducedMotion()) n = Math.min(n, 12);
        tmpC.set(color);
        for (let k = 0; k < n; k++) {
          const i = cursor; cursor = (cursor + 1) % NP;
          const u = rand() * 2 - 1, th = rand() * Math.PI * 2, r = Math.sqrt(1 - u * u), sp = speed * (0.55 + rand() * 0.45);
          pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
          vel[i * 3] = r * Math.cos(th) * sp * spread; vel[i * 3 + 1] = u * sp; vel[i * 3 + 2] = r * Math.sin(th) * sp * spread;
          const tint = 0.75 + rand() * 0.5;
          base[i * 3] = tmpC.r * tint; base[i * 3 + 1] = tmpC.g * tint; base[i * 3 + 2] = tmpC.b * tint;
          life[i] = max[i] = lf * (0.7 + rand() * 0.5); grav[i] = g;
        }
        alive = NP;
      },
      update(dt) {
        if (!alive) return;
        let n = 0;
        for (let i = 0; i < NP; i++) {
          if (life[i] <= 0) continue;
          life[i] -= dt;
          const j = i * 3;
          if (life[i] <= 0) { pos[j + 1] = -999; col[j] = col[j + 1] = col[j + 2] = 0; continue; }
          n++;
          vel[j + 1] -= grav[i] * dt;
          const drag = 1 - 1.4 * dt;
          vel[j] *= drag; vel[j + 1] *= drag; vel[j + 2] *= drag;
          pos[j] += vel[j] * dt; pos[j + 1] += vel[j + 1] * dt; pos[j + 2] += vel[j + 2] * dt;
          const f = Math.min(1, (life[i] / max[i]) * 1.6);
          const tw = 0.75 + 0.25 * Math.sin(life[i] * 40 + i);
          col[j] = base[j] * f * tw; col[j + 1] = base[j + 1] * f * tw; col[j + 2] = base[j + 2] * f * tw;
        }
        alive = n;
        geo.attributes.position.needsUpdate = true;
        geo.attributes.color.needsUpdate = true;
      },
    };
  }
  const tmpC = new THREE.Color();
  const sky = makeParticles(lowEnd ? 600 : 1000, 1.5);
  const sparks = makeParticles(240, 0.09);
  const emit = sparks.emit;
  const FW = ['#ffd166', '#ff5c7a', '#22d3a6', '#7c5cff', '#4cc9f0', '#ffffff', '#ff9f1c'];
  function fireworks(n = 5, near = null) {
    for (let k = 0; k < n; k++) {
      const a = near != null ? near + (rand() - 0.5) * 0.9 : -Math.PI / 2 + (rand() - 0.5) * 2.2;
      const R = 70 + rand() * 25;
      const x = Math.sin(a) * R, z = -Math.cos(a) * R, y = 38 + rand() * 22;
      setTimeout(() => { if (!disposed) sky.emit(x, y, z, lowEnd ? 70 : 110, FW[(rand() * FW.length) | 0], 13, 1.6, 3); }, k * 260);
    }
  }
  function updateParticles(dt) { sky.update(dt); sparks.update(dt); }

  // ---------- state ----------
  let mode = 'intro'; // intro | play | over
  let phase = 'idle'; // idle | wait | runup | flight | struck | result
  let phaseT = 0, T = 0, timeScale = 1, targetScale = 1, shake = 0;
  let innings = newInnings();
  let delivery = null, path = null, dclock = 0, released = false;
  let swung = false, tapClock = 0, swingT = -1, resolved = false, outcome = null, aim = { az: 0, loft: false };
  let resultAt = 0, announced = false, bowledHit = false, stumpsFlying = false, runPlan = 0;
  const struck = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rolling: false, stopped: false };
  let catcher = null, chaser = null, held = null;
  const ballPos = new THREE.Vector3(), tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), lastDir = new THREE.Vector3(0, 0, -1);
  const camPos = new THREE.Vector3().copy(BAT_CAM.pos), camLook = new THREE.Vector3().copy(BAT_CAM.look);
  const wantPos = new THREE.Vector3(), wantLook = new THREE.Vector3();
  let camMode = 'intro';
  const flying = strikerStumps.baseline.map((b) => ({ ...b, v: new THREE.Vector3(), w: new THREE.Vector3(), active: false }));
  let disposed = false, paused = false, raf = 0, last = 0;
  const frameTimes = []; let qualityChecked = false;

  function send(ev) { try { onEvent(ev); } catch (e) { console.error(e); } }

  // ---------- per-ball setup ----------
  function resetActors() {
    for (const b of flying) { b.m.position.copy(b.p); b.m.rotation.copy(b.r); b.active = false; }
    strikerStumps.bailMat.emissive.setHex(0x000000);
    batter.root.position.copy(BATTER_POS); batter.root.rotation.y = Math.PI / 2;
    nonStriker.root.position.set(-1.25, 0, -PITCH_LEN - 1.1); nonStriker.root.rotation.y = 0;
    bowler.root.position.set(0.55, 0, -34); bowler.root.rotation.y = 0;
    for (const fd of fielders) { fd.f.root.position.copy(fd.home); fd.f.root.lookAt(BATTER_POS.x, 0, BATTER_POS.z); fd.chasing = false; fd.holding = false; poseIdle(fd.f.parts, rand() * 5); }
    ball.visible = false; marker.visible = false; trail.forEach((s) => { s.visible = false; });
    ballShadow.visible = false;
    catcher = chaser = held = null; stumpsFlying = false; bowledHit = false;
  }
  function stance(t) {
    poseIdle(bp, t);
    bp.legs[0].leg.rotation.z = 0.12; bp.legs[1].leg.rotation.z = -0.12;
    for (const l of bp.legs) { l.leg.rotation.x = -0.18; l.knee.rotation.x = 0.35; }
    bp.body.position.y = -0.05;
    bp.torso.rotation.set(0.32, 0.25, 0);
    bp.arms[0].arm.rotation.set(-0.55, 0, 0.32); bp.arms[1].arm.rotation.set(-0.55, 0, -0.32);
    bp.arms[0].elbow.rotation.x = -0.25; bp.arms[1].elbow.rotation.x = -0.25;
    bp.bat.rotation.set(0.35, 0, 0);
    bp.shoulders.rotation.set(0, 0, -0.15);
  }
  function nextBall() {
    resetActors();
    stance(T);
    delivery = planDelivery(rand, innings.balls);
    path = deliveryPath(delivery);
    dclock = 0; released = false; swung = false; swingT = -1; resolved = false; outcome = null; announced = false;
    aim = { az: 0, loft: false }; struck.stopped = false; struck.vx = struck.vz = 0;
    phase = 'wait'; phaseT = 0; camMode = 'bat'; targetScale = 1;
    send({ type: 'ball', ballNo: innings.balls + 1 });
  }

  // ---------- input ----------
  let down = null;
  const keys = { left: false, right: false, up: false };
  function aimFromScreen(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    const nx = clamp(((clientX - r.left) / r.width) * 2 - 1, -1, 1);
    const ny = (clientY - r.top) / r.height;
    return { az: nx * 75 * DEG, loft: ny < 0.42 };
  }
  function swing(a) {
    if (mode !== 'play' || swung || paused) return false;
    if (phase !== 'flight' && !(phase === 'runup' && phaseT > runupDur - 0.25)) return false;
    swung = true; tapClock = released ? dclock : -0.25; swingT = 0; aim = a;
    sound('swoosh');
    return true;
  }
  function onPointerDown(e) {
    if (mode !== 'play') return;
    e.preventDefault();
    const a = aimFromScreen(e.clientX, e.clientY);
    if (swing(a)) down = { x: e.clientX, y: e.clientY, id: e.pointerId };
  }
  function onPointerMove(e) {
    if (!down || e.pointerId !== down.id || resolved) return;
    const dx = e.clientX - down.x, dy = e.clientY - down.y;
    if (Math.hypot(dx, dy) > 22) aim = { az: clamp(Math.atan2(dx, Math.max(-dy, 8)), -110 * DEG, 110 * DEG), loft: dy < -28 };
  }
  function onPointerUp() { down = null; }
  function keyAim() { return { az: (keys.left ? -65 : 0) * DEG + (keys.right ? 65 : 0) * DEG, loft: keys.up }; }
  function onKey(e) {
    const k = e.key, isDown = e.type === 'keydown';
    if (k === 'ArrowLeft') keys.left = isDown; else if (k === 'ArrowRight') keys.right = isDown; else if (k === 'ArrowUp') keys.up = isDown;
    if (mode !== 'play' || !isDown || e.repeat) return;
    if (k === ' ' || k === 'Enter' || k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown') {
      e.preventDefault();
      if (!swing(keyAim()) && swung && !resolved && k !== ' ' && k !== 'Enter') aim = keyAim();
    }
  }
  canvas.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);

  // ---------- resolve ----------
  const runupDur = 1.55;
  function resolve() {
    resolved = true;
    const diff = swung ? (tapClock - path.tc) / SIM_SLOW : null;
    if (swung && keys && (keys.left || keys.right || keys.up) && !down) aim = keyAim();
    outcome = decideShot({ diff, delivery, path, aim }, rand);
    send({ type: 'shot', diff, timing: outcome.timing, swung });
    const r = outcome.result;
    if (r === 'bowled' || r === 'beaten') { phase = 'flight'; return; }
    // Contact!
    ballAt(path, Math.max(dclock, path.tc), ballPos);
    struck.x = ballPos.x; struck.y = Math.max(ballPos.y, 0.25); struck.z = ballPos.z; struck.rolling = false; struck.stopped = false;
    let target = 0;
    if (r === 'caught') {
      const edged = !!outcome.edged;
      let best = null, bestD = Infinity;
      for (const fd of fielders) {
        const faz = Math.atan2(fd.home.x - struck.x, -(fd.home.z - struck.z));
        const dist = Math.hypot(fd.home.x - struck.x, fd.home.z - struck.z);
        if (edged !== (Math.abs(faz) > 2.2) || (!edged && dist < 14)) continue;
        const d = Math.abs(faz - outcome.az);
        if (d < bestD) { bestD = d; best = fd; }
      }
      catcher = best || fielders[1];
      catcher.target.set(catcher.home.x + (rand() - 0.5) * 5, 0, catcher.home.z + (rand() - 0.5) * 5);
      outcome.az = Math.atan2(catcher.target.x - struck.x, -(catcher.target.z - struck.z));
      target = Math.hypot(catcher.target.x - struck.x, catcher.target.z - struck.z);
      catcher.chasing = true;
    }
    const v = launchFor(r, outcome.az, rand, target, outcome.edged ? 12 : 0);
    struck.vx = v.vx; struck.vy = v.vy; struck.vz = v.vz;
    lastDir.set(v.vx, 0, v.vz).normalize();
    if (r === 'dot' || r === '1' || r === '2' || r === '4') {
      tmpV.set(struck.x + lastDir.x * Math.min(v.dist, ROPE_R - 2), 0, struck.z + lastDir.z * Math.min(v.dist, ROPE_R - 2));
      let best = null, bestD = Infinity;
      for (const fd of fielders) { const d = fd.home.distanceTo(tmpV); if (d < bestD) { bestD = d; best = fd; } }
      chaser = best; chaser.chasing = true;
    }
    phase = 'struck'; phaseT = 0; runPlan = outcome.runs && (r === '1' || r === '2') ? outcome.runs : 0;
    const clean = outcome.timing && (outcome.timing.grade === 'perfect' || outcome.timing.grade === 'good');
    sound('hit'); haptic(clean ? 'heavy' : 'tap');
    emit(struck.x, struck.y, struck.z, clean ? 40 : 14, '#fff4c2', clean ? 6 : 3, 0.45, 3, 1);
    if (!reducedMotion()) shake = clean ? 0.22 : 0.08;
    if (r === '6' || r === '4' || r === '2' || r === 'caught' || (r === '1' && Math.abs(outcome.az) > 1)) camMode = 'chase';
    if (r === '6' && !reducedMotion()) { targetScale = 0.32; setTimeout(() => { targetScale = 1; }, 1300); }
    if (r === '6') { stadium.excite(0.6); }
    resultAt = { 6: 4.2, 4: 3.4, caught: 3.4, 2: 3.6, 1: 2.4, dot: 2.0 }[r] || 2.4;
  }

  function banner(text, kind) { send({ type: 'banner', text, kind }); }

  function finishBall() {
    innings = applyBall(innings, outcome);
    send({ type: 'innings', innings, outcome });
    if (innings.done) {
      mode = 'over'; phase = 'idle'; camMode = 'orbit';
      setTimeout(() => { if (!disposed) send({ type: 'end', innings }); }, 600);
    } else {
      phase = 'gap'; phaseT = 0;
    }
  }

  // ---------- animation helpers ----------
  const ease = (x) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);
  function animateBatter(dt) {
    if (phase === 'runup' || (phase === 'flight' && swingT < 0)) {
      // Backlift as the bowler gets close.
      const k = phase === 'runup' ? clamp((phaseT - 0.9) / 0.6, 0, 1) : 1;
      bp.shoulders.rotation.set(0, 0, -1.55 * ease(k));
      bp.torso.rotation.y = 0.25 + 0.25 * k;
      bp.legs[0].leg.rotation.x = -0.18 - 0.15 * k;
    }
    if (swingT >= 0) {
      swingT += dt;
      const k = clamp(swingT / 0.32, 0, 1);
      const az = clamp(aim.az, -1.2, 1.2);
      const follow = aim.loft ? 2.9 : 2.3;
      bp.shoulders.rotation.set(0, -az * 0.8 * ease(k), -1.55 + (1.55 + follow) * ease(k));
      bp.torso.rotation.y = 0.5 - 1.1 * ease(k);
      bp.legs[0].leg.rotation.x = -0.33 - 0.35 * ease(Math.min(1, k * 2));
      bp.legs[0].knee.rotation.x = 0.35 + 0.3 * ease(k);
      if (swingT > 1.4 && phase !== 'struck') { swingT = -1; }
    }
  }
  function animateBowler() {
    const P = bowler.parts;
    if (phase === 'wait' || phase === 'gap' || mode !== 'play') { poseIdle(P, T); bowler.root.position.set(0.55, 0, -34); return; }
    if (phase === 'runup') {
      const u = clamp(phaseT / runupDur, 0, 1);
      bowler.root.position.z = -34 + (34 - 20.9) * u;
      bowler.root.position.x = 0.55;
      poseRun(P, phaseT * 13, u < 0.8 ? 1 : 0.6);
      // Windmill in the last part of the run-up.
      const w = clamp((u - 0.72) / 0.28, 0, 1);
      P.arms[0].arm.rotation.set(w * Math.PI * 1.15, 0, 0);
      P.arms[0].elbow.rotation.x = 0;
      P.arms[1].arm.rotation.set(-w * 2.6, 0, 0.2);
    } else {
      const k = clamp(phaseT / 0.7, 0, 1);
      bowler.root.position.z = -20.9 + 3.5 * ease(k);
      bowler.root.position.x = 0.55 + 1.3 * ease(k);
      poseRun(bowler.parts, (dclock + 2) * 9, 1 - k);
      P.arms[0].arm.rotation.set(Math.PI * 1.15 + ease(k) * Math.PI * 0.75, 0, 0);
    }
  }
  function animateFielders(dt) {
    const crouch = phase === 'runup' ? clamp((phaseT - 0.8) / 0.5, 0, 1) : phase === 'flight' ? 1 : 0;
    for (const fd of fielders) {
      const P = fd.f.parts;
      if (fd.holding) { poseArmsUp(P, fd === catcher ? 1 : 0.5); continue; }
      if (fd.chasing) {
        let tx, tz;
        if (fd === catcher) { tx = fd.target.x; tz = fd.target.z; } else { tx = ballPos.x; tz = ballPos.z; }
        const dx = tx - fd.f.root.position.x, dz = tz - fd.f.root.position.z, d = Math.hypot(dx, dz);
        if (d > 0.35) {
          const sp = Math.min(d, 8.2 * dt);
          fd.f.root.position.x += (dx / d) * sp; fd.f.root.position.z += (dz / d) * sp;
          fd.f.root.rotation.y = Math.atan2(dx, dz);
          fd.runPhase += dt * 14; poseRun(P, fd.runPhase, 1);
        } else if (fd === catcher) { poseArmsUp(P, 0.6); fd.f.root.lookAt(ballPos.x, 0, ballPos.z); } else poseCrouch(P, 0.8);
        continue;
      }
      if (fd.name === 'keeper') { poseCrouch(P, 0.5 + crouch * 0.5); continue; }
      if (crouch > 0) { poseCrouch(P, crouch * 0.7); fd.f.root.position.z = fd.home.z - Math.sign(fd.home.z || 1) * crouch * 0.8; } else poseIdle(P, T + fd.runPhase);
    }
  }
  function animateRunning() {
    if (!runPlan || phase !== 'struck') return;
    const per = 1.3, t = phaseT - 0.25;
    if (t < 0) return;
    const leg = Math.min(runPlan, Math.floor(t / per));
    const u = leg >= runPlan ? 1 : (t % per) / per;
    const forward = leg % 2 === 0; // striker heading to the far end on legs 0, 2
    const zS = forward ? -1.4 + (-PITCH_LEN + 2.8) * u : -PITCH_LEN + 1.4 + (PITCH_LEN - 2.8) * u;
    if (leg >= runPlan) { poseIdle(bp, T); poseIdle(nonStriker.parts, T); return; }
    batter.root.position.set(-1.0, 0, zS); batter.root.rotation.y = forward ? Math.PI : 0;
    nonStriker.root.position.set(1.0, 0, -PITCH_LEN - zS - 0.0); nonStriker.root.rotation.y = forward ? 0 : Math.PI;
    poseRun(bp, t * 14, 1); bp.shoulders.rotation.set(0, 0, 0); bp.arms[0].arm.rotation.x = -0.6; bp.arms[1].arm.rotation.x = -0.6;
    poseRun(nonStriker.parts, t * 14 + 1, 1);
  }

  function updateStumps(dt) {
    if (!stumpsFlying) return;
    for (const b of flying) {
      if (!b.active) continue;
      b.v.y -= 9.81 * dt;
      b.m.position.addScaledVector(b.v, dt);
      b.m.rotation.x += b.w.x * dt; b.m.rotation.z += b.w.z * dt; b.m.rotation.y += b.w.y * dt;
      if (b.m.position.y < 0.02) { b.m.position.y = 0.02; b.v.y = -b.v.y * 0.3; b.v.x *= 0.6; b.v.z *= 0.6; b.w.multiplyScalar(0.5); if (Math.abs(b.v.y) < 0.4) b.v.y = 0; }
    }
  }
  function smashStumps() {
    stumpsFlying = true; bowledHit = true;
    const hitX = ballPos.x;
    for (const b of flying) {
      const isBail = b.m.geometry === strikerStumps.bails[0].geometry;
      const near = Math.max(0, 1 - Math.abs(b.p.x - hitX) / 0.25);
      if (!isBail && near < 0.25) continue;
      b.active = true;
      b.v.set((b.p.x - hitX) * 6 + (rand() - 0.5) * 1.5, isBail ? 3 + rand() * 2.5 : 1 + near * 1.2, isBail ? 3 + rand() * 3 : 2 + near * 3);
      b.w.set(isBail ? (rand() - 0.5) * 30 : 2 + near * 5, (rand() - 0.5) * 10, (rand() - 0.5) * (isBail ? 30 : 4));
    }
    strikerStumps.bailMat.emissive.setHex(0xff2244);
    emit(hitX, 0.6, 0, 40, '#ff5c7a', 4, 0.6, 3);
    emit(hitX, 0.6, 0, 20, '#ffd166', 3, 0.5, 3);
    sound('crash'); haptic('error'); stadium.excite(0.5); stadium.flash();
    if (!reducedMotion()) { shake = 0.12; targetScale = 0.35; setTimeout(() => { targetScale = 1; }, 900); }
    camMode = 'stumps';
    banner('BOWLED!', 'out');
  }

  // ---------- main update ----------
  function update(dt, rdt) {
    T += dt; phaseT += dt;
    stadium.update(T, dt);
    if (mode === 'play') {
      if (phase === 'wait' && phaseT > 0.7) { phase = 'runup'; phaseT = 0; send({ type: 'runup', length: delivery.length }); }
      else if (phase === 'runup' && phaseT >= runupDur) {
        phase = 'flight'; phaseT = 0; released = true; dclock = 0;
        if (swung) tapClock = -0.25;
        ball.visible = true; marker.visible = true; ballShadow.visible = true;
        marker.position.set(delivery.bounce.x, 0.02, delivery.bounce.z);
        markerRing.material.color.set(delivery.length === 'Yorker' ? '#ff5c7a' : delivery.length === 'Full' ? '#ffd166' : delivery.length === 'Good length' ? '#22d3a6' : '#4cc9f0');
        trail.forEach((s) => { s.visible = true; });
        for (let i = 0; i < TRAIL; i++) { trailPos[i * 3] = path.x0; trailPos[i * 3 + 1] = path.y0; trailPos[i * 3 + 2] = path.z0; }
        sound('whoosh');
        send({ type: 'release', speedKmh: delivery.speedKmh, length: delivery.length, kind: delivery.kind, swing: delivery.swingLabel });
      }
      if (phase === 'flight') {
        const prev = dclock;
        dclock += dt * SIM_SLOW;
        ballAt(path, dclock, ballPos);
        if (prev < path.t1 && dclock >= path.t1) emit(path.bx, 0.05, path.bz, 10, '#d8c38f', 1.6, 0.5, 3, 1.5);
        const mk = clamp(1 - (dclock - path.t1) * 4, 0, 1);
        markerRing.material.opacity = mk * (0.65 + 0.35 * Math.sin(T * 18));
        marker.scale.setScalar(1 + (1 - Math.min(1, dclock / path.t1)) * 0.8);
        if (!resolved && swung && (dclock >= path.tc || tapClock > path.tc)) resolve();
        if (!resolved && !swung && dclock >= path.ts + 0.02) resolve();
        if (resolved && outcome && (outcome.result === 'bowled' || outcome.result === 'beaten')) {
          if (outcome.result === 'bowled' && !bowledHit && dclock >= path.ts) { ballAt(path, path.ts, ballPos); smashStumps(); }
          if (outcome.result === 'bowled' && bowledHit) ballAt(path, path.ts, ballPos);
          if (outcome.result === 'beaten' && ballPos.z > 13) ballPos.z = 13;
          if (!announced) {
            announced = true; resultAt = outcome.result === 'bowled' ? 2.8 : 1.6; phaseT = 0;
            if (outcome.result === 'beaten') banner(swung ? 'BEATEN!' : 'DOT BALL', 'dot');
          }
          if (phaseT > resultAt) finishBall();
        }
      } else if (phase === 'struck') {
        const r = outcome.result;
        if (held) {
          ballPos.copy(held.f.root.position); ballPos.y = 1.25;
        } else if (!struck.stopped) {
          const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
          for (let s = 0; s < steps; s++) stepBall(struck, dt / steps);
          ballPos.set(struck.x, struck.y, struck.z);
          const R = Math.hypot(struck.x, struck.z);
          if (r === '6' && R > 71 && struck.y < standY(R)) { struck.stopped = true; stadium.excite(1); sky.emit(struck.x, struck.y + 1, struck.z, 40, '#ffd166', 6, 0.9, 5); }
          if (R > 110) struck.stopped = true;
          if (r === '4' && R > 70.2) { struck.stopped = true; }
          if ((r === '4' || r === '6') && R > ROPE_R && !announced) {
            announced = true; const six = r === '6';
            banner(six ? 'SIX!' : 'FOUR!', six ? 'six' : 'four');
            sound('crowd'); haptic('success'); stadium.excite(six ? 1 : 0.7); stadium.flash();
            fireworks(six ? 7 : 3, Math.atan2(struck.x, -struck.z));
            if (six) setTimeout(() => sound('levelup'), 120);
          }
          if (catcher && !held) {
            const hx = struck.x - catcher.f.root.position.x, hz = struck.z - catcher.f.root.position.z;
            if (Math.hypot(hx, hz) < 1.4 && struck.y < 2.4 && struck.vy < 0) {
              held = catcher; catcher.holding = true; catcher.chasing = false;
              banner('CAUGHT!', 'out'); sound('crowd'); haptic('error'); stadium.excite(0.8);
              emit(struck.x, struck.y, struck.z, 30, '#ff5c7a', 4, 0.6, 3);
            } else if (struck.rolling) { held = catcher; catcher.holding = true; }
          }
          if (chaser && !held && Math.hypot(struck.x - chaser.f.root.position.x, struck.z - chaser.f.root.position.z) < 0.8 && Math.hypot(struck.x, struck.z) < ROPE_R - 0.5) {
            held = chaser; chaser.chasing = false; chaser.holding = true;
          }
        }
        if (Math.hypot(struck.vx, struck.vz) > 0.5) lastDir.set(struck.vx, 0, struck.vz).normalize();
        if (phaseT > 0.9 && !announced && (r === '1' || r === '2' || r === 'dot')) {
          announced = true; banner(r === 'dot' ? 'DOT BALL' : r === '1' ? '1 RUN' : '2 RUNS', 'runs');
        }
        if (phaseT > resultAt) finishBall();
      } else if (phase === 'gap' && phaseT > 0.5) nextBall();
    }

    // Ball + trail + shadow.
    if (ball.visible) {
      ball.position.copy(ballPos);
      ball.rotation.x += dt * 30;
      for (let i = TRAIL - 1; i > 0; i--) { trailPos[i * 3] = trailPos[i * 3 - 3]; trailPos[i * 3 + 1] = trailPos[i * 3 - 2]; trailPos[i * 3 + 2] = trailPos[i * 3 - 1]; }
      trailPos[0] = ballPos.x; trailPos[1] = ballPos.y; trailPos[2] = ballPos.z;
      const moving = !(held || struck.stopped) || phase === 'flight';
      for (let i = 0; i < TRAIL; i++) { trail[i].position.set(trailPos[i * 3], trailPos[i * 3 + 1], trailPos[i * 3 + 2]); trail[i].visible = moving; }
      const sh = Math.max(0, 1 - ballPos.y / 12);
      ballShadow.position.set(ballPos.x, 0, ballPos.z);
      ballShadow.scale.setScalar(0.4 + sh * 0.6);
      ballShadow.visible = ballPos.y < 12 && Math.hypot(ballPos.x, ballPos.z) < 71;
    }

    if (mode === 'play') { animateBowler(); animateBatter(dt); animateFielders(dt); animateRunning(); }
    else { poseIdle(bowler.parts, T); animateFielders(dt); }
    poseIdle(umpire.parts, T + 2);
    if (!(phase === 'struck' && runPlan)) poseIdle(nonStriker.parts, T + 1);
    updateStumps(dt);
    updateParticles(dt);
    updateCamera(dt, rdt);
  }

  // ---------- camera ----------
  function fitFov() {
    const aspect = camera.aspect;
    const minH = 40 * DEG; // keep at least this much horizontal view on narrow phones
    const v = 2 * Math.atan(Math.tan(minH / 2) / aspect);
    camera.fov = clamp(Math.max(48 * DEG, v), 0, 82 * DEG) / DEG;
    camera.updateProjectionMatrix();
  }
  function updateCamera(dt, rdt) {
    const k = 1 - Math.exp(-rdt * 3.2);
    if (camMode === 'intro' || camMode === 'orbit') {
      const a = T * 0.07 + (camMode === 'orbit' ? 2.2 : 0);
      wantPos.set(Math.sin(a) * 40, 9 + Math.sin(T * 0.2) * 2, -10 + Math.cos(a) * 40);
      wantLook.set(0, 4.5, -10);
    } else if (camMode === 'bat') {
      wantPos.copy(BAT_CAM.pos); wantLook.copy(BAT_CAM.look);
      if (phase === 'flight' && dclock > path.tc) wantLook.lerp(ballPos, 0.15);
    } else if (camMode === 'stumps') {
      wantPos.set(1.6, 1.2, 3.2); wantLook.set(0, 0.45, 0);
    } else if (camMode === 'chase') {
      const R = Math.hypot(ballPos.x, ballPos.z);
      const back = outcome && outcome.result === '6' ? 16 : 12;
      wantPos.set(ballPos.x - lastDir.x * back, Math.max(3.5, ballPos.y * 0.6 + 4), ballPos.z - lastDir.z * back);
      const wr = Math.hypot(wantPos.x, wantPos.z);
      if (wr > 58) { wantPos.x *= 58 / wr; wantPos.z *= 58 / wr; }
      if (R < 5 && phaseT < 0.25) wantPos.lerp(BAT_CAM.pos, 0.6);
      wantLook.copy(ballPos);
    }
    const kk = camMode === 'stumps' ? 1 - Math.exp(-rdt * 6) : camMode === 'chase' ? 1 - Math.exp(-rdt * 2.6) : k;
    camPos.lerp(wantPos, kk);
    camLook.lerp(wantLook, Math.min(1, kk * 1.8));
    camera.position.copy(camPos);
    if (shake > 0.001) {
      camera.position.x += (rand() - 0.5) * shake; camera.position.y += (rand() - 0.5) * shake;
      shake *= Math.exp(-rdt * 7);
    }
    camera.lookAt(camLook);
  }

  // ---------- loop ----------
  function frame(now) {
    raf = 0;
    if (disposed || paused) return;
    raf = requestAnimationFrame(frame);
    const rdt = Math.min(MAX_DT, last ? (now - last) / 1000 : 0.016);
    last = now;
    timeScale += (targetScale - timeScale) * Math.min(1, rdt * 5);
    update(rdt * timeScale, rdt);
    renderer.render(scene, camera);
    if (!qualityChecked && mode === 'play') {
      frameTimes.push(rdt);
      if (frameTimes.length >= 90) {
        qualityChecked = true;
        const sorted = frameTimes.slice().sort((a, b) => a - b);
        if (sorted[45] > 0.026 && pixelRatio > 1) { pixelRatio = 1; renderer.setPixelRatio(1); resize(); }
      }
    }
  }
  function resize() {
    const w = container.clientWidth || 1, h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; fitFov();
    if (paused) renderer.render(scene, camera);
  }
  const ro = new ResizeObserver(resize); ro.observe(container);
  resetActors(); stance(0);
  resize();
  raf = requestAnimationFrame(frame);

  return {
    start() {
      innings = newInnings(); mode = 'play'; camMode = 'bat';
      send({ type: 'innings', innings, outcome: null });
      nextBall();
      phaseT = -0.6;
    },
    setPaused(p) {
      if (disposed || p === paused) return;
      paused = p;
      if (!p) { last = 0; if (!raf) raf = requestAnimationFrame(frame); } else renderer.render(scene, camera);
    },
    swing(dir = 0, loft = false) { return swing({ az: dir * 65 * DEG, loft }); },
    // Dev/test only: finish the innings now (remaining balls count as dots) to reach the result screen quickly.
    debugFinish: import.meta.env?.DEV ? () => {
      if (mode !== 'play') return;
      while (!innings.done) innings = applyBall(innings, { runs: 0, wicket: false });
      mode = 'over'; phase = 'idle'; camMode = 'orbit';
      send({ type: 'innings', innings, outcome: null }); send({ type: 'end', innings });
    } : undefined,
    get state() { return { mode, phase, innings, clock: dclock, tc: path ? path.tc : 0, slow: SIM_SLOW }; },
    dispose() {
      disposed = true; cancelAnimationFrame(raf); ro.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      const seen = new Set();
      scene.traverse((o) => {
        if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); }
        const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        for (const m of ms) {
          if (seen.has(m)) continue; seen.add(m);
          for (const key of ['map', 'emissiveMap']) if (m[key] && !seen.has(m[key])) { seen.add(m[key]); m[key].dispose(); }
          m.dispose();
        }
      });
      glow.dispose();
      resetGeoCache(); resetMatCache(); resetShadowTex();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
