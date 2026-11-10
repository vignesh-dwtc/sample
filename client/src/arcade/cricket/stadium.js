// Procedural floodlit night stadium for Cricket Blitz (three.js, no external assets).
import * as THREE from 'three';
import { ROPE_R, PITCH_LEN } from './logic.js';

// Two towers flank the far (bowler's) end so they frame the batting view, two sit behind the batter.
export const TOWER_ANGLES = [24, 150, 210, 336].map((d) => (d * Math.PI) / 180);
export const TOWER_R = 104;
const FIELD_R = 71;
export const standY = (r) => (r < FIELD_R ? 0 : 1.6 + (r - FIELD_R) * 0.72);

export function canvasTex(w, h, draw, { repeat = false } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  return t;
}

export function glowTexture() {
  return canvasTex(128, 128, (g, w) => {
    const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.18, 'rgba(255,250,230,0.85)');
    r.addColorStop(0.45, 'rgba(255,230,180,0.25)');
    r.addColorStop(1, 'rgba(255,220,160,0)');
    g.fillStyle = r; g.fillRect(0, 0, w, w);
  });
}

function rng(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

function outfieldTexture() {
  return canvasTex(1024, 1024, (g, W) => {
    const px = W / (FIELD_R * 2); // pixels per metre
    g.fillStyle = '#2f7a35'; g.fillRect(0, 0, W, W);
    // Mown stripes (along the pitch axis) with alternating shades.
    const stripe = 6 * px;
    for (let i = 0; i * stripe < W; i++) {
      g.fillStyle = i % 2 ? '#2b7231' : '#38893c';
      g.fillRect(i * stripe, 0, stripe + 1, W);
    }
    // Cross stripes (lighter diagonal-free checker for the "chequered" broadcast look).
    g.globalAlpha = 0.08;
    for (let i = 0; i * stripe < W; i++) if (i % 2) { g.fillStyle = '#d8ffcf'; g.fillRect(0, i * stripe, W, stripe); }
    g.globalAlpha = 1;
    // Grass speckle.
    const r = rng(11);
    for (let i = 0; i < 14000; i++) {
      g.fillStyle = r() < 0.5 ? 'rgba(10,40,12,0.18)' : 'rgba(170,230,140,0.10)';
      g.fillRect(r() * W, r() * W, 1.5, 1.5);
    }
    // Floodlit centre, darker edges.
    const v = g.createRadialGradient(W / 2, W / 2, W * 0.1, W / 2, W / 2, W / 2);
    v.addColorStop(0, 'rgba(255,255,220,0.10)'); v.addColorStop(0.75, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,10,0,0.35)');
    g.fillStyle = v; g.fillRect(0, 0, W, W);
    // 30-yard circle as dashes.
    g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 2.2; g.setLineDash([10, 12]);
    g.beginPath(); g.arc(W / 2, W / 2, 27.4 * px, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
  });
}

function pitchTexture() {
  return canvasTex(128, 1024, (g, W, H) => {
    const pxm = H / 24; // pitch plane is 24 m long
    const grd = g.createLinearGradient(0, 0, W, 0);
    grd.addColorStop(0, '#9c8d5a'); grd.addColorStop(0.5, '#c9b47e'); grd.addColorStop(1, '#9c8d5a');
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    const r = rng(5);
    for (let i = 0; i < 2600; i++) { g.fillStyle = r() < 0.5 ? 'rgba(90,70,30,0.18)' : 'rgba(255,240,200,0.14)'; g.fillRect(r() * W, r() * H, 2, 2); }
    // Worn footmarks near both ends.
    for (const cy of [2.4, 21.6]) {
      const wg = g.createRadialGradient(W / 2, cy * pxm, 2, W / 2, cy * pxm, 70);
      wg.addColorStop(0, 'rgba(120,95,55,0.55)'); wg.addColorStop(1, 'rgba(120,95,55,0)');
      g.fillStyle = wg; g.fillRect(0, cy * pxm - 80, W, 160);
    }
    g.fillStyle = '#fbfbf4';
    const pxw = W / 3.2;
    for (const top of [true, false]) {
      const stumpY = top ? 1.94 * pxm : H - 1.94 * pxm;
      const pop = stumpY + (top ? 1 : -1) * 1.22 * pxm;
      g.fillRect(0, stumpY - 2, W, 4); // bowling crease
      g.fillRect(0, pop - 2, W, 4); // popping crease
      const y0 = top ? pop - 2.44 * pxm : pop;
      for (const sx of [-1.32, 1.32]) g.fillRect(W / 2 + sx * pxw - 2, y0, 4, 2.44 * pxm); // return creases
    }
  });
}

function boardTexture() {
  return canvasTex(2048, 64, (g, W, H) => {
    const segs = [
      ['PLAYNEST', '#7c5cff', '#22d3a6'], ['CRICKET BLITZ', '#ff5c7a', '#ffd166'], ['HIT IT BIG', '#0ea5e9', '#22d3a6'], ['PLAYNEST ARCADE', '#ffb547', '#ff5c7a'],
    ];
    const sw = W / segs.length;
    segs.forEach(([txt, a, b], i) => {
      const lg = g.createLinearGradient(i * sw, 0, (i + 1) * sw, H);
      lg.addColorStop(0, a); lg.addColorStop(1, b);
      g.fillStyle = lg; g.fillRect(i * sw, 0, sw, H);
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(i * sw, 0, 3, H);
      g.fillStyle = '#fff'; g.font = '800 40px "Baloo 2", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(txt, i * sw + sw / 2, H / 2 + 2);
    });
  }, { repeat: true });
}

function lightPanelTexture() {
  return canvasTex(128, 64, (g, W, H) => {
    g.fillStyle = '#20232e'; g.fillRect(0, 0, W, H);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 8; x++) {
      const cx = 8 + x * 16, cy = 8 + y * 16;
      const rg = g.createRadialGradient(cx, cy, 0, cx, cy, 8);
      rg.addColorStop(0, '#ffffff'); rg.addColorStop(0.5, '#fff4d8'); rg.addColorStop(1, '#7a6a40');
      g.fillStyle = rg; g.beginPath(); g.arc(cx, cy, 6.5, 0, Math.PI * 2); g.fill();
    }
  });
}

function beamTexture() {
  return canvasTex(8, 128, (g, W, H) => {
    const lg = g.createLinearGradient(0, H, 0, 0);
    lg.addColorStop(0, 'rgba(255,245,220,0.0)'); lg.addColorStop(0.6, 'rgba(255,245,220,0.35)'); lg.addColorStop(1, 'rgba(255,250,235,0.9)');
    g.fillStyle = lg; g.fillRect(0, 0, W, H);
  });
}

/**
 * Build the stadium into `scene`. Returns { crowdUniforms, flash(), update(t, dt) }.
 * Everything added here is disposed by the engine's scene traversal.
 */
export function buildStadium(scene, { lowEnd = false } = {}) {
  // Sky dome (gradient + horizon glow from the lights).
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color('#03040d') }, mid: { value: new THREE.Color('#0d1440') }, glow: { value: new THREE.Color('#3a3a78') } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 glow; varying vec3 vP; void main(){ float h = clamp(vP.y, -0.1, 1.0); vec3 c = mix(mid, top, smoothstep(0.05, 0.6, h)); c = mix(glow, c, smoothstep(-0.02, 0.22, h)); gl_FragColor = vec4(c, 1.0); }',
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(420, 32, 16), skyMat);
  scene.add(sky);
  scene.fog = new THREE.Fog(0x0c1236, 150, 420);

  // Stars.
  {
    const n = 500, pos = new Float32Array(n * 3), r = rng(3);
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, e = 0.25 + r() * 1.2, R = 400;
      pos[i * 3] = Math.cos(a) * Math.cos(e) * R; pos[i * 3 + 1] = Math.sin(e) * R; pos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * R;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xbfd0ff, size: 1.3, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.8 })));
  }

  // Lights.
  scene.add(new THREE.HemisphereLight(0xc9d8ff, 0x1a3a1c, 1.1));
  const key = new THREE.DirectionalLight(0xfff3dd, 2.2); key.position.set(-40, 70, 45); scene.add(key);
  const fill = new THREE.DirectionalLight(0xdfe8ff, 1.1); fill.position.set(50, 60, -50); scene.add(fill);

  // Outfield + pitch.
  const field = new THREE.Mesh(new THREE.CircleGeometry(FIELD_R + 0.5, 96), new THREE.MeshLambertMaterial({ map: outfieldTexture() }));
  field.rotation.x = -Math.PI / 2; scene.add(field);
  const pitch = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 24), new THREE.MeshLambertMaterial({ map: pitchTexture() }));
  pitch.rotation.x = -Math.PI / 2; pitch.position.set(0, 0.006, -PITCH_LEN / 2); scene.add(pitch);

  // Boundary rope + LED boards + sightscreens.
  const rope = new THREE.Mesh(new THREE.TorusGeometry(ROPE_R, 0.11, 6, 180), new THREE.MeshLambertMaterial({ color: 0xffe066, emissive: 0x6a5200 }));
  rope.rotation.x = Math.PI / 2; rope.position.y = 0.1; scene.add(rope);
  const btex = boardTexture(); btex.repeat.set(-7, 1); // negative: boards are seen from inside
  const boardsMat = new THREE.MeshBasicMaterial({ map: btex, side: THREE.BackSide, toneMapped: false });
  const boards = new THREE.Mesh(new THREE.CylinderGeometry(FIELD_R - 0.6, FIELD_R - 0.6, 1.1, 128, 1, true), boardsMat);
  boards.position.y = 0.55; scene.add(boards);
  const wall = new THREE.Mesh(new THREE.LatheGeometry([
    new THREE.Vector2(FIELD_R, 0), new THREE.Vector2(FIELD_R, 1.6), new THREE.Vector2(FIELD_R + 40, 1.6 + 40 * 0.72), new THREE.Vector2(FIELD_R + 40, 1.6 + 40 * 0.72 + 6),
  ], 72), new THREE.MeshLambertMaterial({ color: 0x1b1f38, side: THREE.DoubleSide }));
  scene.add(wall);
  // Roof rim (catches light).
  const roof = new THREE.Mesh(new THREE.TorusGeometry(FIELD_R + 38, 0.8, 4, 96), new THREE.MeshLambertMaterial({ color: 0x8890c0, emissive: 0x20243f }));
  roof.rotation.x = Math.PI / 2; roof.position.y = 1.6 + 40 * 0.72 + 6; scene.add(roof);
  const ssMat = new THREE.MeshLambertMaterial({ color: 0x10142a, emissive: 0x05060e });
  for (const z of [-FIELD_R + 1.2, FIELD_R - 1.2]) {
    const ss = new THREE.Mesh(new THREE.BoxGeometry(17, 8.5, 0.4), ssMat); ss.position.set(0, 4.25, z * 1.04); scene.add(ss);
  }

  // Crowd: one instanced mesh, bobbing in the vertex shader (no per-frame CPU work).
  const crowdUniforms = { uTime: { value: 0 }, uExcite: { value: 0.15 } };
  {
    const geo = new THREE.BoxGeometry(0.66, 0.9, 0.45); geo.translate(0, 0.45, 0);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = crowdUniforms.uTime; sh.uniforms.uExcite = crowdUniforms.uExcite;
      sh.vertexShader = 'uniform float uTime; uniform float uExcite;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float ph = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.53;
          float jump = max(0.0, sin(uTime * (5.0 + fract(ph) * 4.0) + ph * 6.28));
          transformed.y += jump * uExcite * 0.9 + sin(uTime * 1.3 + ph) * 0.04;
          transformed.x *= 1.0 + jump * uExcite * 0.15;
        #endif`);
    };
    const r = rng(77);
    const cols = ['#2f6ae0', '#e0761a', '#d9d9d9', '#e2bb30', '#24b56b', '#d9416a', '#1e3a8a', '#6a4fe0', '#0e8fcf', '#c9c2a6', '#2f6ae0', '#e0761a'].map((c) => new THREE.Color(c));
    const skins = ['#5a3a26', '#7a4e32', '#8f5f3d', '#3b2a20', '#a77452', '#1c1612'].map((c) => new THREE.Color(c));
    const headGeo = new THREE.IcosahedronGeometry(0.2, 0); headGeo.translate(0, 1.13, 0);
    const rowStep = lowEnd ? 1.9 : 1.45, seat = lowEnd ? 1.5 : 1.15;
    const tmp = [];
    for (let r0 = FIELD_R + 1.2; r0 < FIELD_R + 39; r0 += rowStep) {
      const n = Math.floor((Math.PI * 2 * r0) / seat);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        if (Math.abs(((a / (Math.PI * 2)) * 12) % 1 - 0.5) < 0.035) continue; // aisles
        if (Math.abs(Math.sin(a)) < 0.12 && r0 < FIELD_R + 9) continue; // sightscreen gaps at both ends
        if (r() < 0.28) continue;
        tmp.push(a, r0);
      }
    }
    const count = tmp.length / 2;
    const crowd = new THREE.InstancedMesh(geo, mat, count);
    const heads = new THREE.InstancedMesh(headGeo, mat, count);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < count; i++) {
      const a = tmp[i * 2], rr = tmp[i * 2 + 1];
      p.set(Math.sin(a) * rr, standY(rr), -Math.cos(a) * rr);
      q.setFromAxisAngle(up, -a);
      s.set(1, 0.85 + r() * 0.3, 1);
      m.compose(p, q, s); crowd.setMatrixAt(i, m); heads.setMatrixAt(i, m);
      crowd.setColorAt(i, cols[(r() * cols.length) | 0]);
      heads.setColorAt(i, skins[(r() * skins.length) | 0]);
    }
    crowd.frustumCulled = false; heads.frustumCulled = false;
    scene.add(crowd, heads);
  }

  // Floodlight towers with glow sprites and soft light beams.
  const glowTex = glowTexture();
  const panelTex = lightPanelTexture();
  const beamTex = beamTexture();
  const towerMat = new THREE.MeshLambertMaterial({ color: 0x3a3f58 });
  const panelMat = new THREE.MeshBasicMaterial({ map: panelTex, toneMapped: false });
  const beamMat = new THREE.MeshBasicMaterial({ map: beamTex, transparent: true, opacity: lowEnd ? 0.05 : 0.085, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const glowMat = new THREE.SpriteMaterial({ map: glowTex, color: 0xfff2d6, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false });
  const sprites = [];
  for (const ang of TOWER_ANGLES) {
    const x = Math.sin(ang) * TOWER_R, z = -Math.cos(ang) * TOWER_R, H = 62;
    const g = new THREE.Group(); g.position.set(x, 0, z); g.lookAt(0, 0, 0);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.6, H, 6), towerMat); mast.position.y = H / 2; g.add(mast);
    const head = new THREE.Mesh(new THREE.BoxGeometry(14, 7, 0.6), panelMat); head.position.set(0, H + 3, 0.6); head.rotation.x = -0.35; g.add(head);
    const back = new THREE.Mesh(new THREE.BoxGeometry(14.4, 7.4, 0.5), towerMat); back.position.set(0, H + 3, 0.15); back.rotation.x = -0.35; g.add(back);
    scene.add(g);
    for (let k = -1; k <= 1; k++) {
      const sp = new THREE.Sprite(glowMat); sp.scale.setScalar(k === 0 ? 55 : 26);
      sp.position.set(x + Math.cos(ang) * k * 4.5, H + 3, z + Math.sin(ang) * k * 4.5);
      scene.add(sp); sprites.push(sp);
    }
    // Light beam: a long open cone from the tower head to the field.
    const len = Math.hypot(TOWER_R * 0.75, H);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(4, 34, len, 20, 1, true), beamMat);
    const top = new THREE.Vector3(x, H + 3, z), bottom = new THREE.Vector3(x * 0.25, 0, z * 0.25);
    beam.position.copy(top).add(bottom).multiplyScalar(0.5);
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(bottom).normalize());
    scene.add(beam);
  }

  let flashT = 0;
  return {
    crowdUniforms,
    flash() { flashT = 1; },
    update(t, dt) {
      crowdUniforms.uTime.value = t;
      crowdUniforms.uExcite.value = Math.max(0.12, crowdUniforms.uExcite.value - dt * 0.35);
      btex.offset.x = (btex.offset.x + dt * 0.02) % 1;
      if (flashT > 0) flashT = Math.max(0, flashT - dt * 1.5);
      const k = 1 + flashT * 0.6 + Math.sin(t * 9) * 0.015;
      for (let i = 0; i < sprites.length; i++) sprites[i].material.opacity = Math.min(1, 0.85 * k);
    },
    excite(v = 1) { crowdUniforms.uExcite.value = Math.max(crowdUniforms.uExcite.value, v); },
  };
}
