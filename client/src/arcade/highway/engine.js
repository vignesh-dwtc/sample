// Highway Rush — three.js engine. Owns the renderer, scene, game loop and input actions.
// The React page creates one HighwayGame, forwards input, and renders the HUD from onFrame().
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as L from './logic.js';
import * as T from './textures.js';
import * as M from './models.js';
import { sound, haptic, isMuted, reducedMotion } from '../../fx/index.js';

const SEG_LEN = 30, SEG_COUNT = 9, SEG_VARIANTS = 4;
const POOL_KINDS = { car: 8, auto: 3, bike: 3, truck: 4, bus: 3 };
const ONCOMING_KINDS = ['car', 'truck', 'car', 'bus', 'auto'];
const ONCOMING_X = [8.8, 12.0, 15.2];
const COINS = 24;
const FOG_NEAR = 45, FOG_FAR = 210;
const PLAY_SKY_OFFSET = 250, INTRO_SKY_OFFSET = 1250;

export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch { return false; }
}

// ---------------------------------------------------------------- colour palettes
const pal = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'string' ? new THREE.Color(v) : v]));
const DAY = pal({ top: '#2c78db', horizon: '#b4dcff', fog: '#bcdcf2', hemiSky: '#d6ecff', hemiGround: '#7a6a48', hemiI: 1.5, sun: '#fff1d0', sunI: 2.6, ground: '#7c8a40', hillsFar: '#7d9bb0', hillsNear: '#5f7d6a', city: '#8aa0b8', disc: '#fff6d8' });
const DUSK = pal({ top: '#26306f', horizon: '#ff8a4a', fog: '#d98466', hemiSky: '#ffb78e', hemiGround: '#4a3530', hemiI: 1.15, sun: '#ff9a5a', sunI: 1.9, ground: '#5d5532', hillsFar: '#7a4f78', hillsNear: '#4b3352', city: '#4a3456', disc: '#ffb070' });
const NIGHT = pal({ top: '#02030c', horizon: '#18204a', fog: '#0f1530', hemiSky: '#4a5a96', hemiGround: '#141626', hemiI: 0.75, sun: '#a8bcff', sunI: 0.45, ground: '#1c2417', hillsFar: '#151a36', hillsNear: '#0c0f22', city: '#0a0c1c', disc: '#e8eeff' });

// ---------------------------------------------------------------- point sprites (glows, sparks, smoke)
const PTS_VERT = `
attribute vec4 pcolor; attribute float psize; varying vec4 vColor; uniform float scale;
void main() { vColor = pcolor; vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = min(320.0, psize * scale / max(0.1, -mv.z)); gl_Position = projectionMatrix * mv; }`;
const PTS_FRAG = `
uniform sampler2D map; varying vec4 vColor;
void main() { vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vColor.rgb, vColor.a * t.a * t.r); }`;
class PointsPool {
  constructor(max, map, additive) {
    this.max = max; this.n = 0;
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 4); this.size = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos); g.setAttribute('pcolor', this.aCol); g.setAttribute('psize', this.aSize);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: map }, scale: { value: 400 } }, vertexShader: PTS_VERT, fragmentShader: PTS_FRAG,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 5 : 4;
  }
  begin() { this.n = 0; }
  push(x, y, z, r, g, b, a, s) {
    if (this.n >= this.max || a <= 0.003) return;
    const i = this.n++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.col[i * 4] = r; this.col[i * 4 + 1] = g; this.col[i * 4 + 2] = b; this.col[i * 4 + 3] = a;
    this.size[i] = s;
  }
  end() {
    this.points.geometry.setDrawRange(0, this.n);
    this.aPos.needsUpdate = true; this.aCol.needsUpdate = true; this.aSize.needsUpdate = true;
  }
}

const SKY_VERT = `varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const SKY_FRAG = `
uniform vec3 top; uniform vec3 horizon; uniform vec3 sunColor; uniform vec3 sunDir; uniform float sunSize; uniform float glow;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(horizon, top, smoothstep(-0.02, 0.5, h));
  float s = max(dot(d, normalize(sunDir)), 0.0);
  col += sunColor * (smoothstep(1.0 - sunSize, 1.0 - sunSize * 0.6, s) * 1.6 + pow(s, 12.0) * 0.45 * glow + pow(s, 3.0) * 0.12 * glow);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

const tmpColor = new THREE.Color(), tmpColor2 = new THREE.Color();
const mix3 = (out, a, b, c, dusk, night) => out.copy(a).lerp(b, dusk).lerp(c, night);
const num3 = (a, b, c, dusk, night) => L.lerp(L.lerp(a, b, dusk), c, night);

export class HighwayGame {
  constructor(container, { onFrame, onEvent } = {}) {
    this.container = container;
    this.onFrame = onFrame || (() => {});
    this.onEvent = onEvent || (() => {});
    this.rng = L.createRng(20261110);
    this.reduced = reducedMotion();
    this.disposables = [];

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.domElement.className = 'hw-canvas';
    container.appendChild(renderer.domElement);
    this.renderer = renderer;
    this.onContextLost = (e) => { e.preventDefault(); this.pause(); };
    renderer.domElement.addEventListener('webglcontextlost', this.onContextLost);

    const scene = new THREE.Scene();
    this.scene = scene;
    scene.fog = new THREE.Fog(0xbcdcf2, FOG_NEAR, FOG_FAR);
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.3, 2000);
    this.camera.position.set(0, 3.2, 7.5);
    scene.add(this.camera);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    this.envMap = pmrem.fromScene(room, 0.04).texture;
    room.dispose?.(); pmrem.dispose();
    this.disposables.push(this.envMap);

    this.tex = {
      glow: T.glowTexture(), smoke: T.smokeTexture(), shadow: T.shadowTexture(), beam: T.beamTexture(),
      roads: [T.roadTexture(SEG_LEN, this.rng), T.roadTexture(SEG_LEN, this.rng)],
      trucks: [0, 1, 2, 3].map((i) => T.truckBackTexture(i)),
      boards: Array.from({ length: T.BOARD_COUNT }, (_, i) => T.boardTexture(i)),
    };
    this.tex.skyline = T.skylineTexture();
    this.tex.windows = T.windowsTexture(this.tex.skyline);
    for (const t of Object.values(this.tex)) (Array.isArray(t) ? t : [t]).forEach((x) => this.disposables.push(x));

    this.buildLights();
    this.buildSky();
    this.buildRoad();
    this.buildTraffic();
    this.buildPlayer();
    this.buildCoins();
    this.buildProps();
    this.buildFx();

    // state
    this.mode = 'intro';
    this.paused = false;
    this.muted = isMuted();
    this.time = 0;
    this.player = { lane: 1, x: 0, z: 0, w: L.PLAYER.w, l: L.PLAYER.l, v: 0, roll: 0, yaw: 0, spin: 0, bump: 0 };
    this.hud = { score: 0, distance: 0, speedKmh: 0, nitro: 0.6, nitroActive: false, combo: 0, comboLeft: 0, mult: 1 };
    this.sky = { dusk: 0, night: 0 };
    this.members = [];
    this.resetRun(true);

    this.loop = this.loop.bind(this);
    this.raf = 0; this.last = 0;
    this.resize();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.raf = requestAnimationFrame(this.loop);
  }

  // ------------------------------------------------------------ scene construction
  buildLights() {
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.5);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.5);
    this.sun.position.set(-25, 40, 30);
    this.scene.add(this.hemi, this.sun);
  }

  buildSky() {
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: { top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, sunColor: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(-0.25, 0.3, -1) }, sunSize: { value: 0.0025 }, glow: { value: 1 } },
      vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false,
    });
    this.skyMesh = new THREE.Mesh(new THREE.SphereGeometry(1500, 24, 16), this.skyMat);
    this.skyMesh.renderOrder = -10;
    this.skyMesh.frustumCulled = false;
    this.scene.add(this.skyMesh);

    // stars
    const n = 600, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, y = 0.08 + Math.random() * 0.92, r = Math.sqrt(1 - y * y);
      pos[i * 3] = Math.cos(a) * r * 1300; pos[i * 3 + 1] = y * 1300; pos[i * 3 + 2] = Math.sin(a) * r * 1300;
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
    this.stars = new THREE.Points(sg, this.starMat);
    this.stars.renderOrder = -9;
    this.scene.add(this.stars);

    // distant hills & city skyline (follow the camera, never fogged)
    this.far = new THREE.Group();
    this.hillsFarMat = new THREE.MeshBasicMaterial({ color: 0x7d9bb0, fog: false });
    this.hillsNearMat = new THREE.MeshBasicMaterial({ color: 0x5f7d6a, fog: false });
    const hf = new THREE.Mesh(M.buildHills(3600, -12, 150, -1150, 1.3, this.rng), this.hillsFarMat);
    const hn = new THREE.Mesh(M.buildHills(2200, -12, 80, -900, 4.1, this.rng), this.hillsNearMat);
    hn.position.x = -700;
    this.cityMat = new THREE.MeshBasicMaterial({ color: 0x4a3456, alphaMap: this.tex.skyline, transparent: true, fog: false, depthWrite: false });
    const city = new THREE.Mesh(new THREE.PlaneGeometry(900, 140), this.cityMat);
    city.position.set(520, 50, -980);
    this.windowsMat = new THREE.MeshBasicMaterial({ map: this.tex.windows, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, fog: false, depthWrite: false });
    const win = new THREE.Mesh(city.geometry, this.windowsMat);
    win.position.set(520, 50, -979);
    this.far.add(hf, hn, city, win);
    this.far.children.forEach((c) => { c.renderOrder = -8; c.frustumCulled = false; });
    this.scene.add(this.far);

    this.groundMat = new THREE.MeshLambertMaterial({ color: 0x7c8a40 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), this.groundMat);
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.06;
    this.scene.add(ground);
  }

  buildRoad() {
    this.roadMats = this.tex.roads.map((t) => new THREE.MeshLambertMaterial({ map: t }));
    this.decorMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.lampMat = new THREE.MeshBasicMaterial({ color: 0xbfc4cc });
    this.poolMat = new THREE.MeshBasicMaterial({ map: this.tex.glow, color: 0xffb35c, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const roadGeo = M.roadPlane(SEG_LEN);
    this.variants = [];
    for (let v = 0; v < SEG_VARIANTS; v++) this.variants.push(M.buildSegmentDecor(SEG_LEN, this.rng, v));
    const pools = [3.95, 8.05].map((x) => { const g = new THREE.PlaneGeometry(7, 11); g.rotateX(-Math.PI / 2); g.translate(x, 0.05, -SEG_LEN / 2); return g; });
    const poolGeo = mergeGeometries(pools); pools.forEach((g) => g.dispose());
    this.segments = [];
    for (let i = 0; i < SEG_COUNT; i++) {
      const g = new THREE.Group();
      const road = new THREE.Mesh(roadGeo, this.roadMats[i % 2]);
      const variant = i % SEG_VARIANTS;
      const decor = new THREE.Mesh(this.variants[variant].decor, this.decorMat);
      const lamps = new THREE.Mesh(this.variants[variant].lamps, this.lampMat);
      const pool = new THREE.Mesh(poolGeo, this.poolMat);
      pool.renderOrder = 2;
      g.add(road, decor, lamps, pool);
      g.position.z = 30 - i * SEG_LEN;
      this.scene.add(g);
      this.segments.push({ group: g, decor, lamps, variant });
    }
  }

  makeVehicle(kind, kits, shared) {
    const kit = kits[kind];
    const g = new THREE.Group();
    const paintMat = new THREE.MeshLambertMaterial({ vertexColors: true, color: 0xffffff });
    g.add(new THREE.Mesh(kit.paint, paintMat), new THREE.Mesh(kit.fixed, shared.fixed), new THREE.Mesh(kit.lights, shared.lights));
    const spec = L.VEHICLES[kind];
    const sh = new THREE.Mesh(shared.shadowGeo, shared.shadow);
    sh.scale.set(spec.w * 1.35, spec.l * 1.12, 1); sh.position.y = 0.03; sh.renderOrder = 1;
    g.add(sh);
    const blinkers = kit.blink.map(([x, y, z]) => { const b = new THREE.Mesh(shared.blinkGeo, shared.blink); b.position.set(x, y, z); b.visible = false; g.add(b); return b; });
    let back = null;
    if (kit.back) {
      back = new THREE.Mesh(shared.plane, shared.backs[0]);
      back.scale.set(kit.back.w, kit.back.h, 1); back.position.set(0, kit.back.y, kit.back.z);
      g.add(back);
    }
    g.visible = false;
    this.scene.add(g);
    return {
      kind, group: g, paintMat, blinkers, back, kit, active: false, lane: 0, targetLane: null, x: 0, z: 0, w: spec.w, l: spec.l,
      speed: 0, vz: 0, close: false, passed: false, changeT: 0, changeFrom: 0, blinkT: 0, blinkDir: 0, tilt: 0,
    };
  }

  buildTraffic() {
    const kits = M.buildTrafficKits();
    this.kits = kits;
    for (const k of Object.values(kits)) this.disposables.push(k.paint, k.fixed, k.lights);
    const shadowGeo = new THREE.PlaneGeometry(1, 1); shadowGeo.rotateX(-Math.PI / 2);
    const plane = new THREE.PlaneGeometry(1, 1);
    this.disposables.push(shadowGeo, plane);
    const shared = {
      fixed: new THREE.MeshLambertMaterial({ vertexColors: true }),
      lights: new THREE.MeshBasicMaterial({ vertexColors: true }),
      blink: new THREE.MeshBasicMaterial({ color: 0xffa21a }),
      shadow: new THREE.MeshBasicMaterial({ map: this.tex.shadow, transparent: true, depthWrite: false, color: 0x000000 }),
      shadowGeo, plane, blinkGeo: new THREE.BoxGeometry(0.2, 0.13, 0.06),
      backs: this.tex.trucks.map((t) => new THREE.MeshLambertMaterial({ map: t })),
    };
    this.disposables.push(shared.blinkGeo);
    this.shared = shared;
    this.vehicles = [];
    for (const [kind, n] of Object.entries(POOL_KINDS)) for (let i = 0; i < n; i++) this.vehicles.push(this.makeVehicle(kind, kits, shared));
    this.oncoming = ONCOMING_KINDS.map((kind) => {
      const v = this.makeVehicle(kind, kits, shared);
      v.group.rotation.y = Math.PI;
      v.group.visible = true;
      return v;
    });
  }

  buildPlayer() {
    const car = M.buildPlayerCar(this.envMap);
    this.car = car;
    const sh = new THREE.Mesh(this.shared.shadowGeo, this.shared.shadow);
    sh.scale.set(2.5, 5.0, 1); sh.position.y = 0.03; sh.renderOrder = 1;
    this.carRoot = new THREE.Group();
    this.carRoot.add(car.group);
    this.scene.add(this.carRoot, sh);
    this.carShadow = sh;
    // headlight pool on the road
    const beamGeo = new THREE.PlaneGeometry(7.5, 30); beamGeo.rotateX(-Math.PI / 2); beamGeo.translate(0, 0.06, -17);
    this.beamMat = new THREE.MeshBasicMaterial({ map: this.tex.beam, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, color: 0xfff0d0 });
    this.beam = new THREE.Mesh(beamGeo, this.beamMat);
    this.beam.renderOrder = 3;
    this.scene.add(this.beam);
  }

  buildCoins() {
    const g = new THREE.CylinderGeometry(0.48, 0.48, 0.12, 18); g.rotateX(Math.PI / 2);
    const m = new THREE.MeshStandardMaterial({ color: 0xffc83a, metalness: 0.85, roughness: 0.25, emissive: 0x6b4300, envMap: this.envMap });
    this.coinMesh = new THREE.InstancedMesh(g, m, COINS);
    this.coinMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.coinMesh.frustumCulled = false;
    this.scene.add(this.coinMesh);
    this.coins = Array.from({ length: COINS }, () => ({ active: false, x: 0, z: 0, y: 0.9, pop: 0 }));
    this.coinMatrix = new THREE.Matrix4();
    this.coinQuat = new THREE.Quaternion();
    this.coinPos = new THREE.Vector3();
    this.coinScale = new THREE.Vector3();
    this.coinAxis = new THREE.Vector3(0, 1, 0);
  }

  buildProps() {
    this.props = [];
    for (let i = 1; i < T.BOARD_COUNT; i++) {
      const b = M.buildBillboard(this.tex.boards[i]);
      this.scene.add(b.group);
      this.props.push({ kind: 'board', group: b.group, z: 999, active: false });
    }
    const d = M.buildDhaba(this.tex.boards[0]);
    this.scene.add(d.group);
    this.props.push({ kind: 'dhaba', group: d.group, bulbs: d.bulbs, z: 999, active: false });
    this.props.forEach((p) => { p.group.visible = false; });
    this.nextProp = 60;
  }

  buildFx() {
    this.glows = new PointsPool(320, this.tex.glow, true);
    this.sparks = new PointsPool(160, this.tex.glow, true);
    this.smoke = new PointsPool(60, this.tex.smoke, false);
    this.scene.add(this.glows.points, this.sparks.points, this.smoke.points);
    this.sparkList = Array.from({ length: 160 }, () => ({ life: 0 }));
    this.smokeList = Array.from({ length: 60 }, () => ({ life: 0 }));
    // speed lines live in camera space
    const n = 70;
    this.lines = Array.from({ length: n }, () => this.resetLine({}, true));
    this.linePos = new Float32Array(n * 6);
    const lg = new THREE.BufferGeometry();
    this.lineAttr = new THREE.BufferAttribute(this.linePos, 3).setUsage(THREE.DynamicDrawUsage);
    lg.setAttribute('position', this.lineAttr);
    this.lineMat = new THREE.LineBasicMaterial({ color: 0xdff4ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    this.lineMesh = new THREE.LineSegments(lg, this.lineMat);
    this.lineMesh.frustumCulled = false;
    this.lineMesh.renderOrder = 20;
    this.camera.add(this.lineMesh);
  }

  resetLine(l, anywhere) {
    const a = Math.random() * Math.PI * 2, r = 1.4 + Math.random() * 3.2;
    l.x = Math.cos(a) * r * 1.3; l.y = Math.sin(a) * r * 0.8; l.z = anywhere ? -2 - Math.random() * 50 : -52;
    return l;
  }

  // ------------------------------------------------------------ run lifecycle
  resetRun(intro) {
    for (const v of this.vehicles) { v.active = false; v.group.visible = false; }
    for (const c of this.coins) c.active = false;
    for (let i = 0; i < this.oncoming.length; i++) { const o = this.oncoming[i]; o.x = ONCOMING_X[i % 3]; o.z = -40 - i * 55; o.speed = 18 + this.rng() * 8; }
    const p = this.player;
    p.lane = 1; p.x = L.laneX(1); p.v = 0; p.roll = 0; p.yaw = 0; p.spin = 0; p.bump = 0;
    this.distance = 0;
    this.speed = intro ? 25 : Math.max(this.speed || 0, 25);
    this.nitro = 0.6; this.nitroActive = false; this.nitroFx = 0;
    this.state = { combo: 0, lastNear: -99, bonus: 0, nearMisses: 0 };
    this.coinsCollected = 0; this.topSpeed = 0;
    this.lastSpawn = null; this.nextCoins = 140; this.wallTimer = 0; this.changeTimer = 1; this.autoTimer = 0;
    this.shake = 0; this.timeScale = 1; this.crashT = 0; this.overT = 0;
    this.skyOffset = intro ? INTRO_SKY_OFFSET : PLAY_SKY_OFFSET;
    for (let z = -55; z > L.SPAWN_Z; z -= L.spawnGapAt(0) * 1.1) this.spawnVehicle(z);
  }

  start() {
    this.resetRun(false);
    this.mode = 'play';
    this.paused = false;
    this.startAudio();
    sound('engine');
    this.onEvent('start');
    this.kick();
  }

  // ------------------------------------------------------------ input
  steer(dir) {
    if (this.mode !== 'play' || this.paused) return;
    const p = this.player;
    const t = L.clamp(p.lane + dir, 0, L.LANES - 1);
    if (t === p.lane) { p.bump = dir; this.shake = Math.max(this.shake, 0.15); haptic(12); return; }
    p.lane = t;
    sound('swoosh');
  }

  boost() {
    if (this.mode !== 'play' || this.paused || this.nitroActive || this.nitro < L.NITRO_MIN) return false;
    this.nitroActive = true;
    sound('whoosh'); haptic([20, 30, 20]);
    this.container.classList.add('is-nitro');
    return true;
  }

  pause() {
    if (this.paused) return;
    this.paused = true;
    cancelAnimationFrame(this.raf); this.raf = 0;
    this.audio?.ctx.suspend().catch(() => {});
  }

  resume() {
    if (!this.paused || this.disposed) return;
    this.paused = false;
    this.last = 0;
    if (this.mode === 'play') this.audio?.ctx.resume().catch(() => {});
    this.kick();
  }

  kick() { if (!this.raf && !this.paused && !this.disposed) { this.last = 0; this.raf = requestAnimationFrame(this.loop); } }

  setMuted(m) { this.muted = m; }

  // ------------------------------------------------------------ audio: engine drone
  startAudio() {
    if (this.audio) { this.audio.ctx.resume().catch(() => {}); return; }
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      o1.type = 'sawtooth'; o2.type = 'square'; o2.detune.value = 7;
      f.type = 'lowpass'; f.frequency.value = 520; f.Q.value = 3;
      g.gain.value = 0;
      o1.connect(f); o2.connect(f); f.connect(g).connect(ctx.destination);
      o1.start(); o2.start();
      this.audio = { ctx, o1, o2, f, g };
    } catch { this.audio = null; }
  }

  updateAudio() {
    const a = this.audio;
    if (!a) return;
    const t = a.ctx.currentTime;
    const on = this.mode === 'play' && !this.muted && !isMuted();
    const hz = 38 + this.speed * 1.25 + (this.nitroActive ? 18 : 0);
    a.o1.frequency.setTargetAtTime(hz, t, 0.08);
    a.o2.frequency.setTargetAtTime(hz * 0.5, t, 0.08);
    a.f.frequency.setTargetAtTime(380 + this.speed * 9 + (this.nitroActive ? 500 : 0), t, 0.1);
    a.g.gain.setTargetAtTime(on ? 0.028 : 0, t, on ? 0.15 : 0.05);
  }

  // ------------------------------------------------------------ spawning
  freeVehicle(kind) {
    for (const v of this.vehicles) if (!v.active && v.kind === kind) return v;
    return null;
  }

  spawnVehicle(z) {
    const kind = L.pickKind(this.rng, this.distance);
    const v = this.freeVehicle(kind) || this.freeVehicle('car');
    if (!v) return null;
    const lane = L.pickSpawnLane(this.vehicles, z, v.l, this.rng);
    if (lane < 0) return null;
    const spec = L.VEHICLES[v.kind];
    const cruise = L.speedAt(this.distance);
    v.active = true; v.lane = lane; v.targetLane = null; v.x = L.laneX(lane); v.z = z;
    v.speed = cruise * L.lerp(spec.speed[0], spec.speed[1], this.rng());
    v.vz = 0; v.close = false; v.passed = false; v.changeT = 0; v.blinkT = 0; v.blinkDir = 0; v.tilt = 0;
    const paints = M.PAINTS[v.kind];
    v.paintMat.color.set(paints[Math.floor(this.rng() * paints.length)]);
    if (v.back) v.back.material = this.shared.backs[Math.floor(this.rng() * this.shared.backs.length)];
    v.group.visible = true;
    v.group.rotation.set(0, 0, 0);
    this.lastSpawn = v;
    return v;
  }

  spawnCoins() {
    const len = 5 * 5.5;
    const lane = L.pickCoinLane(this.vehicles, L.SPAWN_Z, len, this.rng);
    if (lane < 0) return false;
    let placed = 0;
    for (const c of this.coins) {
      if (c.active) continue;
      c.active = true; c.x = L.laneX(lane); c.z = L.SPAWN_Z - placed * 5.5; c.pop = 0;
      if (++placed >= 5) break;
    }
    return placed > 0;
  }

  // ------------------------------------------------------------ main loop
  loop(now) {
    this.raf = 0;
    if (this.paused || this.disposed) return;
    const realDt = this.last ? Math.min(0.05, (now - this.last) / 1000) : 1 / 60;
    this.last = now;
    if (this.mode === 'crash') {
      this.crashT += realDt;
      this.timeScale = Math.min(1, 0.16 + this.crashT * this.crashT * 0.35);
      if (this.crashT > 2.1) {
        this.mode = 'over'; this.overT = 0;
        this.onEvent('over', this.stats());
      }
    } else this.timeScale = 1;
    if (this.mode === 'over') this.overT += realDt;
    const dt = realDt * this.timeScale;
    this.time += dt;
    this.update(dt, realDt);
    this.renderer.render(this.scene, this.camera);
    // after the result card has been up a while, stop burning battery
    if (this.mode === 'over' && this.overT > 7) return;
    this.raf = requestAnimationFrame(this.loop);
  }

  stats() {
    return {
      score: L.scoreFor(this.distance, this.state.bonus),
      distance: Math.round(this.distance),
      topSpeed: Math.round(this.topSpeed),
      nearMisses: this.state.nearMisses,
      coins: this.coinsCollected,
    };
  }

  update(dt, realDt) {
    const p = this.player;
    const playing = this.mode === 'play';
    const intro = this.mode === 'intro';

    // ---- speed & nitro
    if (playing) {
      if (this.nitroActive) {
        this.nitro = L.stepNitro(this.nitro, true, dt);
        if (this.nitro <= 0) { this.nitroActive = false; this.container.classList.remove('is-nitro'); }
      } else this.nitro = L.stepNitro(this.nitro, false, dt);
      const target = L.speedAt(this.distance) * (this.nitroActive ? L.NITRO_MULT : 1);
      const acc = this.nitroActive ? 26 : target < this.speed ? 10 : 6;
      this.speed += L.clamp(target - this.speed, -acc * dt, acc * dt);
      this.topSpeed = Math.max(this.topSpeed, this.speed * 3.6);
    } else if (intro) {
      this.speed += (26 - this.speed) * Math.min(1, dt * 2);
    } else {
      this.speed *= Math.exp(-dt * 2.6);
      if (this.speed < 0.3) this.speed = 0;
    }
    this.nitroFx += ((this.nitroActive ? 1 : 0) - this.nitroFx) * Math.min(1, dt * 5);
    const dz = this.speed * dt;
    this.distance += dz;

    // ---- player steering (critically damped spring) & body roll
    if (playing || intro) {
      if (intro) this.autopilot(dt);
      const tx = L.laneX(p.lane) + p.bump * 0.45;
      const k = 120, c = 2 * Math.sqrt(k);
      p.v += (k * (tx - p.x) - c * p.v) * dt;
      p.x += p.v * dt;
      p.bump *= Math.exp(-dt * 10);
      p.roll += (L.clamp(-p.v * 0.045, -0.16, 0.16) - p.roll) * Math.min(1, dt * 14);
      p.yaw += (L.clamp(-p.v * 0.035, -0.22, 0.22) - p.yaw) * Math.min(1, dt * 12);
    } else {
      p.x += p.v * dt; p.v *= Math.exp(-dt * 2);
      p.yaw += p.spin * dt; p.spin *= Math.exp(-dt * 1.6);
      p.roll *= Math.exp(-dt * 3);
    }

    // ---- world scroll
    for (const s of this.segments) {
      s.group.position.z += dz;
      if (s.group.position.z - SEG_LEN > 12) {
        s.group.position.z -= SEG_COUNT * SEG_LEN;
        const v = Math.floor(this.rng() * SEG_VARIANTS);
        if (v !== s.variant) { s.variant = v; s.decor.geometry = this.variants[v].decor; s.lamps.geometry = this.variants[v].lamps; }
      }
    }
    this.updateProps(dz);
    this.updateTraffic(dt, dz, playing);
    this.updateCoins(dt, dz, playing);
    this.updateOncoming(dt);

    // ---- combo timer
    const comboLeft = this.state.combo > 0 ? 1 - (this.time - this.state.lastNear) / L.COMBO_WINDOW : 0;
    if (comboLeft <= 0 && this.state.combo > 0 && playing) { this.state.combo = 0; }

    // ---- visuals
    this.updateCar(dt);
    this.updateSky();
    this.updateCamera(dt, realDt);
    this.updateGlows();
    this.updateParticles(dt, dz);
    this.updateLines(realDt);
    this.updateAudio();

    // ---- HUD
    const h = this.hud;
    h.score = playing || this.mode !== 'intro' ? L.scoreFor(this.distance, this.state.bonus) : 0;
    h.distance = this.distance;
    h.speedKmh = this.speed * 3.6;
    h.nitro = this.nitro; h.nitroActive = this.nitroActive;
    h.combo = this.state.combo; h.comboLeft = Math.max(0, comboLeft);
    h.mult = L.comboMultiplier(this.state.combo);
    h.mode = this.mode;
    this.onFrame(h);
  }

  autopilot(dt) {
    this.autoTimer -= dt;
    if (this.autoTimer > 0) return;
    this.autoTimer = 0.35;
    const p = this.player;
    const clear = (lane) => L.laneClear(this.vehicles, lane, -48, 6);
    if (!clear(p.lane)) {
      for (const d of [-1, 1, -2, 2]) { const t = p.lane + d; if (t >= 0 && t < L.LANES && clear(t) && (Math.abs(d) === 1 || clear(p.lane + Math.sign(d)))) { p.lane = t; return; } }
    } else if (this.rng() < 0.08) {
      const t = p.lane + (this.rng() < 0.5 ? -1 : 1);
      if (t >= 0 && t < L.LANES && clear(t)) p.lane = t;
    }
  }

  updateTraffic(dt, dz, playing) {
    const p = this.player;
    const vs = this.vehicles;
    for (const v of vs) {
      if (!v.active) continue;
      // keep distance from slower traffic ahead in the same lane
      let limit = Infinity;
      for (const o of vs) {
        if (o === v || !o.active || o.z >= v.z) continue;
        if (!(L.laneMask(o) & L.laneMask(v))) continue;
        const gap = (v.z - v.l / 2) - (o.z + o.l / 2);
        if (gap < 9 && o.speed < limit) limit = o.speed;
      }
      if (limit < v.speed) v.speed = limit;
      if (this.mode !== 'play' && this.mode !== 'intro') v.speed = v.z > -4 ? this.speed : Math.max(v.speed, 12);
      v.vz = this.speed - v.speed;
      v.z += v.vz * dt;
      // lane change: blink first, then glide
      if (v.blinkT > 0) {
        v.blinkT -= dt;
        if (v.blinkT <= 0) v.changeT = 0.0001;
      }
      if (v.changeT > 0) {
        v.changeT += dt / 1.4;
        const k = Math.min(1, v.changeT);
        const e = k * k * (3 - 2 * k);
        v.x = L.lerp(L.laneX(v.changeFrom), L.laneX(v.targetLane), e);
        v.tilt = Math.sin(k * Math.PI) * 0.12 * Math.sign(L.laneX(v.targetLane) - L.laneX(v.changeFrom));
        if (k >= 1) { v.lane = v.targetLane; v.targetLane = null; v.changeT = 0; v.blinkDir = 0; v.tilt = 0; }
      }
      if (v.z > 30 || v.z < -320) { v.active = false; v.group.visible = false; continue; }
      if (playing) {
        const r = L.trackVehicle(v, p, v.vz);
        if (r === 'crash') { this.crash(v); return; }
        if (r === 'near') this.nearMiss(v);
      }
      v.group.position.set(v.x, 0, v.z);
      v.group.rotation.y = -v.tilt * 0.6;
      const on = v.blinkDir !== 0 && (this.time * 3.2) % 1 < 0.55;
      v.blinkers[0].visible = on && v.blinkDir < 0;
      v.blinkers[1].visible = on && v.blinkDir > 0;
    }

    // spawning (spatial density: wait until the last spawn has moved far enough)
    const gap = L.spawnGapAt(this.distance);
    if (!this.lastSpawn || !this.lastSpawn.active || this.lastSpawn.z > L.SPAWN_Z + gap || this.lastSpawn.z < L.SPAWN_Z - 40) this.spawnVehicle(L.SPAWN_Z);

    // fairness: break walls (now or about to form) a few times per second
    this.wallTimer -= dt;
    if (this.wallTimer <= 0) {
      this.wallTimer = 0.2;
      const w = L.findWall(vs);
      if (w) {
        const r = L.resolveWall(vs, w, this.members);
        if (r.action === 'despawn') { r.vehicle.active = false; r.vehicle.group.visible = false; } else r.vehicle.speed = this.speed * 1.18;
      } else {
        const pw = L.predictWall(vs, 5, 0.5);
        if (pw) {
          L.wallMembersAt(vs, pw.anchor, pw.t, this.members);
          let f = 0;
          for (const m of this.members) f = Math.max(f, m.speed);
          for (const m of this.members) m.speed = f;
        }
      }
    }

    // occasional lane changes with blinkers
    this.changeTimer -= dt;
    if (this.changeTimer <= 0) {
      this.changeTimer = 0.6 + this.rng() * 0.8;
      const chance = L.clamp(0.25 + this.distance / 12000, 0.25, 0.6);
      const cand = vs[Math.floor(this.rng() * vs.length)];
      if (cand.active && L.VEHICLES[cand.kind].canChange && cand.targetLane == null && this.rng() < chance) {
        const t = cand.lane + (this.rng() < 0.5 ? -1 : 1);
        if (L.canChangeLane(vs, cand, t, p)) {
          cand.targetLane = t; cand.changeFrom = cand.lane; cand.blinkT = 0.9; cand.blinkDir = t > cand.lane ? 1 : -1; cand.changeT = 0;
        }
      }
    }
  }

  updateCoins(dt, dz, playing) {
    if (playing || this.mode === 'intro') {
      this.nextCoins -= dz;
      if (this.nextCoins <= 0) this.nextCoins = this.spawnCoins() ? 160 + this.rng() * 200 : 20;
    }
    const p = this.player;
    const m = this.coinMatrix;
    for (let i = 0; i < COINS; i++) {
      const c = this.coins[i];
      if (c.active) {
        c.z += dz;
        if (c.pop > 0) { c.pop += dt * 3; c.y = 0.9 + c.pop * 2.2; if (c.pop >= 1) c.active = false; }
        else {
          c.y = 0.9 + Math.sin(this.time * 4 + c.z * 0.3) * 0.12;
          if (playing && Math.abs(c.x - p.x) < 1.45 && Math.abs(c.z - p.z) < 2.6) {
            c.pop = 0.0001;
            this.coinsCollected += 1;
            this.state.bonus += L.COIN_POINTS;
            this.nitro = Math.min(1, this.nitro + 0.04);
            sound('coin');
            this.onEvent('coin', { points: L.COIN_POINTS });
          }
          if (c.z > 15) c.active = false;
        }
      }
      if (c.active) {
        const s = c.pop > 0 ? 1 - c.pop : 1;
        this.coinQuat.setFromAxisAngle(this.coinAxis, this.time * 4 + i);
        m.compose(this.coinPos.set(c.x, c.y, c.z), this.coinQuat, this.coinScale.set(s, s, s));
      } else m.makeScale(0, 0, 0);
      this.coinMesh.setMatrixAt(i, m);
    }
    this.coinMesh.instanceMatrix.needsUpdate = true;
  }

  updateOncoming(dt) {
    for (let i = 0; i < this.oncoming.length; i++) {
      const o = this.oncoming[i];
      o.z += (this.speed + o.speed) * dt;
      if (o.z > 25) { o.z = -260 - this.rng() * 160; o.x = ONCOMING_X[Math.floor(this.rng() * 3)]; o.speed = 16 + this.rng() * 10; o.paintMat.color.set(M.PAINTS[o.kind][Math.floor(this.rng() * M.PAINTS[o.kind].length)]); if (o.back) o.back.material = this.shared.backs[i % 4]; }
      o.group.position.set(o.x, 0, o.z);
    }
  }

  updateProps(dz) {
    this.nextProp -= dz;
    for (const pr of this.props) {
      if (!pr.active) continue;
      pr.z += dz; pr.group.position.z = pr.z;
      if (pr.z > 40) { pr.active = false; pr.group.visible = false; }
    }
    if (this.nextProp <= 0) {
      const free = this.props.filter((x) => !x.active);
      if (free.length) {
        const pr = free[Math.floor(this.rng() * free.length)];
        const right = pr.kind === 'board' && this.rng() < 0.35;
        pr.active = true; pr.z = -250; pr.group.visible = true;
        pr.group.position.set(pr.kind === 'dhaba' ? -17 : right ? 23 : -12.5, 0, pr.z);
        pr.group.rotation.y = pr.kind === 'dhaba' ? 0.75 : right ? -0.45 : 0.4;
      }
      this.nextProp = 110 + this.rng() * 170;
    }
  }

  nearMiss(v) {
    const pts = L.registerNearMiss(this.state, this.time);
    sound('whoosh');
    haptic(18);
    this.shake = Math.max(this.shake, 0.12);
    this.onEvent('near', { points: pts, combo: this.state.combo, mult: L.comboMultiplier(this.state.combo), side: v.x < this.player.x ? -1 : 1 });
  }

  crash(v) {
    if (this.mode !== 'play') return;
    this.mode = 'crash';
    this.crashT = 0;
    this.nitroActive = false;
    this.container.classList.remove('is-nitro');
    const p = this.player;
    const side = v.x < p.x ? 1 : -1;
    p.v = side * 6;
    p.spin = side * (2.5 + this.rng() * 1.5);
    v.speed = Math.max(v.speed, this.speed * 0.8);
    v.tilt = -side * 0.4;
    this.shake = this.reduced ? 0.2 : 1.2;
    const cx = (p.x + v.x) / 2, cz = (v.z + v.l / 2 + p.z - p.l / 2) / 2;
    this.emitSparks(cx, 0.8, cz, 90);
    for (let i = 0; i < 10; i++) this.emitSmoke(cx + (this.rng() - 0.5), 0.6, cz, 0.9);
    sound('crash'); sound('hit');
    haptic([60, 40, 120]);
    this.onEvent('crash');
  }

  emitSparks(x, y, z, n) {
    let k = 0;
    for (const s of this.sparkList) {
      if (s.life > 0) continue;
      const a = Math.random() * Math.PI * 2, sp = 4 + Math.random() * 11;
      s.x = x; s.y = y; s.z = z; s.vx = Math.cos(a) * sp; s.vy = 2 + Math.random() * 7; s.vz = Math.sin(a) * sp - 4;
      s.life = s.max = 0.5 + Math.random() * 0.9;
      if (++k >= n) break;
    }
  }

  emitSmoke(x, y, z, life = 1.6) {
    for (const s of this.smokeList) {
      if (s.life > 0) continue;
      s.x = x; s.y = y; s.z = z; s.vx = (Math.random() - 0.5) * 1.2; s.vy = 1 + Math.random() * 1.2; s.vz = (Math.random() - 0.5);
      s.life = s.max = life + Math.random();
      return;
    }
  }

  // ------------------------------------------------------------ visuals
  updateCar(dt) {
    const p = this.player;
    const r = this.carRoot;
    r.position.set(p.x, 0, p.z);
    r.rotation.set(0, p.yaw, 0);
    const g = this.car.group;
    g.rotation.z = p.roll;
    g.rotation.x = -this.nitroFx * 0.04 + (this.mode === 'play' ? Math.sin(this.time * 31) * 0.003 * (this.speed / 30) : 0);
    g.position.y = this.mode === 'crash' ? Math.abs(Math.sin(this.crashT * 9)) * 0.25 * Math.max(0, 1 - this.crashT) : 0;
    const spin = (this.speed * dt) / 0.36;
    for (const w of this.car.wheels) w.rotation.x -= spin;
    this.carShadow.position.set(p.x, 0.03, p.z);
    this.carShadow.rotation.y = p.yaw;
    this.beam.position.set(p.x, 0, p.z);
    this.beam.rotation.y = p.yaw;
    if (this.mode === 'crash' || (this.mode === 'over' && this.overT < 5)) {
      this.smokeTimer = (this.smokeTimer || 0) - dt;
      if (this.smokeTimer <= 0) { this.smokeTimer = 0.07; this.emitSmoke(p.x + (Math.random() - 0.5) * 0.8, 1.0, p.z - 1.6, 2.2); }
    }
  }

  updateSky() {
    const s = L.dayNight(this.distance + this.skyOffset, this.sky);
    const { dusk, night } = s;
    const u = this.skyMat.uniforms;
    mix3(u.top.value, DAY.top, DUSK.top, NIGHT.top, dusk, night);
    mix3(u.horizon.value, DAY.horizon, DUSK.horizon, NIGHT.horizon, dusk, night);
    mix3(u.sunColor.value, DAY.disc, DUSK.disc, NIGHT.disc, dusk, night);
    const elev = num3(0.42, 0.045, 0.3, dusk, night);
    u.sunDir.value.set(num3(-0.35, -0.12, 0.45, dusk, night), elev, -1).normalize();
    u.sunSize.value = num3(0.00045, 0.0011, 0.00025, dusk, night);
    u.glow.value = num3(0.7, 1.6, 0.25, dusk, night);
    mix3(this.scene.fog.color, DAY.fog, DUSK.fog, NIGHT.fog, dusk, night);
    mix3(this.hemi.color, DAY.hemiSky, DUSK.hemiSky, NIGHT.hemiSky, dusk, night);
    mix3(this.hemi.groundColor, DAY.hemiGround, DUSK.hemiGround, NIGHT.hemiGround, dusk, night);
    this.hemi.intensity = num3(DAY.hemiI, DUSK.hemiI, NIGHT.hemiI, dusk, night);
    mix3(this.sun.color, DAY.sun, DUSK.sun, NIGHT.sun, dusk, night);
    this.sun.intensity = num3(DAY.sunI, DUSK.sunI, NIGHT.sunI, dusk, night);
    mix3(this.groundMat.color, DAY.ground, DUSK.ground, NIGHT.ground, dusk, night);
    // distant layers fade toward the horizon colour (aerial perspective)
    mix3(tmpColor, DAY.hillsFar, DUSK.hillsFar, NIGHT.hillsFar, dusk, night);
    this.hillsFarMat.color.copy(tmpColor).lerp(u.horizon.value, 0.35);
    mix3(tmpColor2, DAY.hillsNear, DUSK.hillsNear, NIGHT.hillsNear, dusk, night);
    this.hillsNearMat.color.copy(tmpColor2).lerp(u.horizon.value, 0.2);
    mix3(this.cityMat.color, DAY.city, DUSK.city, NIGHT.city, dusk, night);
    this.cityMat.color.lerp(u.horizon.value, 0.3);
    this.windowsMat.opacity = night;
    this.starMat.opacity = night * 0.95;
    const lit = L.clamp(night * 1.2 + dusk * 0.25, 0, 1);
    this.lampMat.color.setRGB(0.6 + lit * 0.4, 0.6 + lit * 0.25, 0.62 - lit * 0.3);
    this.poolMat.opacity = night * 0.42;
    this.beamMat.opacity = this.mode === 'over' ? night * 0.25 : Math.max(night, dusk * 0.2) * 0.5;
    this.car.paint.envMapIntensity = num3(0.75, 0.7, 0.45, dusk, night);
    this.renderer.toneMappingExposure = num3(1.0, 1.05, 1.25, dusk, night);
  }

  updateCamera(dt, realDt) {
    const cam = this.camera, p = this.player;
    const aspect = this.width / Math.max(1, this.height);
    const portrait = aspect < 1;
    let tx, ty, tz, lx, ly, lz;
    if (this.mode === 'intro') {
      const a = 0.35 + Math.sin(this.time * 0.18) * 0.75;
      const r = portrait ? 9.5 : 8;
      tx = p.x + Math.sin(a) * r; ty = 2.2 + Math.sin(this.time * 0.11) * 0.5; tz = p.z + Math.cos(a) * r;
      lx = p.x; ly = 0.9; lz = p.z - 2;
    } else if (this.mode === 'play') {
      tx = p.x * 0.78; ty = portrait ? 3.5 : 3.0; tz = (portrait ? 7.6 : 7.0) + this.nitroFx * 1.1;
      lx = p.x * 0.9; ly = 1.0; lz = -12;
    } else {
      // crash / over: swing round slowly to show the wreck
      const a = 0.5 + Math.min(1.4, (this.crashT + this.overT) * 0.35);
      tx = p.x + Math.sin(a) * 9; ty = 3.4; tz = p.z + Math.cos(a) * 9;
      lx = p.x; ly = 0.8; lz = p.z;
    }
    const k = 1 - Math.exp(-realDt * (this.mode === 'play' ? 7 : 2.2));
    cam.position.x += (tx - cam.position.x) * k;
    cam.position.y += (ty - cam.position.y) * k;
    cam.position.z += (tz - cam.position.z) * k;
    this.look = this.look || new THREE.Vector3(0, 1, -10);
    this.look.x += (lx - this.look.x) * k; this.look.y += (ly - this.look.y) * k; this.look.z += (lz - this.look.z) * k;
    cam.lookAt(this.look);
    // shake
    this.shake = Math.max(0, this.shake - realDt * 1.6);
    const speedJitter = this.mode === 'play' && !this.reduced ? this.nitroFx * 0.035 + Math.max(0, this.speed - 38) * 0.0012 : 0;
    const amp = (this.reduced ? 0 : this.shake * this.shake * 0.5) + speedJitter;
    if (amp > 0) {
      cam.position.x += Math.sin(this.time * 61) * amp;
      cam.position.y += Math.sin(this.time * 47 + 1) * amp * 0.7;
      cam.rotation.z += Math.sin(this.time * 37) * amp * 0.05;
    }
    // FOV: wide enough on portrait phones, kick on nitro
    const hfov = 64;
    let fov = (2 * Math.atan(Math.tan((hfov * Math.PI) / 360) / aspect) * 180) / Math.PI;
    fov = L.clamp(fov, 50, portrait ? 80 : 70);
    fov += this.nitroFx * 12 + L.clamp((this.speed - 25) * 0.12, 0, 4);
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
    this.skyMesh.position.copy(cam.position);
    this.stars.position.copy(cam.position);
    this.far.position.set(cam.position.x, 0, cam.position.z);
    const scale = this.height * this.renderer.getPixelRatio() / (2 * Math.tan((cam.fov * Math.PI) / 360));
    this.glows.mat.uniforms.scale.value = scale;
    this.sparks.mat.uniforms.scale.value = scale;
    this.smoke.mat.uniforms.scale.value = scale;
  }

  updateGlows() {
    const G = this.glows;
    const { night, dusk } = this.sky;
    const fade = (z) => L.clamp((FOG_FAR + z) / (FOG_FAR - FOG_NEAR), 0, 1);
    G.begin();
    // streetlights
    if (night > 0.02) {
      for (const s of this.segments) {
        const z = s.group.position.z;
        for (const lp of this.variants[s.variant].lampPositions) {
          const f = fade(z + lp[2]) * night;
          G.push(lp[0], lp[1] - 0.15, z + lp[2], 1.0, 0.72, 0.38, f * 0.9, 5.5);
        }
      }
    }
    const tailA = 0.22 + night * 0.7 + dusk * 0.15;
    for (const v of this.vehicles) {
      if (!v.active) continue;
      const f = fade(v.z);
      for (const t of v.kit.tails) G.push(v.x + t[0], t[1], v.z + t[2], 1.0, 0.12, 0.08, tailA * f, 1.5);
      if (v.blinkDir) {
        const on = (this.time * 3.2) % 1 < 0.55;
        if (on) { const b = v.kit.blink[v.blinkDir < 0 ? 0 : 1]; G.push(v.x + b[0], b[1], v.z + b[2], 1.0, 0.6, 0.1, 0.9 * f, 1.4); }
      }
    }
    for (const o of this.oncoming) {
      const f = fade(o.z) * (0.15 + night * 0.85);
      for (const h of o.kit.heads) G.push(o.x - h[0], h[1], o.z - h[2], 1.0, 0.95, 0.8, f, 3.2);
    }
    // player lights
    const p = this.player, cy = Math.cos(p.yaw), sy = Math.sin(p.yaw);
    for (const t of this.car.tails) G.push(p.x + t[0] * cy + t[2] * sy, t[1], p.z + t[2] * cy - t[0] * sy, 1.0, 0.1, 0.15, 0.3 + night * 0.6, 1.3);
    if (night + dusk * 0.3 > 0.05) for (const h of this.car.heads) G.push(p.x + h[0] * cy + h[2] * sy, h[1], p.z + h[2] * cy - h[0] * sy, 0.9, 0.95, 1.0, Math.max(night, dusk * 0.3) * 0.8, 1.6);
    // nitro flames
    if (this.nitroFx > 0.05) {
      for (const e of this.car.exhausts) {
        const fl = 0.75 + Math.random() * 0.5;
        const x = p.x + e[0] * cy + e[2] * sy, z = p.z + e[2] * cy - e[0] * sy;
        G.push(x, e[1], z + 0.15, 0.45, 0.7, 1.0, this.nitroFx * 0.95, 1.5 * fl);
        G.push(x, e[1], z + 0.6, 0.3, 0.45, 1.0, this.nitroFx * 0.6, 1.1 * fl);
        G.push(x, e[1], z + 1.0, 1.0, 0.55, 0.2, this.nitroFx * 0.35, 0.8 * fl);
      }
    }
    // coins sparkle
    for (const c of this.coins) if (c.active && c.pop === 0) G.push(c.x, c.y, c.z, 1.0, 0.8, 0.3, 0.35 * fade(c.z), 1.6);
    // dhaba string lights
    if (night > 0.05) {
      for (const pr of this.props) {
        if (!pr.active || !pr.bulbs) continue;
        const ry = pr.group.rotation.y, c = Math.cos(ry), s = Math.sin(ry), px = pr.group.position.x, pz = pr.z;
        for (let i = 0; i < pr.bulbs.length; i++) {
          const b = pr.bulbs[i];
          const tw = 0.7 + 0.3 * Math.sin(this.time * 5 + i);
          G.push(px + b[0] * c + b[2] * s, b[1], pz + b[2] * c - b[0] * s, i % 3 === 0 ? 1 : 0.4, i % 3 === 1 ? 1 : 0.6, i % 3 === 2 ? 1 : 0.3, night * tw * fade(pz), 0.9);
        }
      }
    }
    G.end();
  }

  updateParticles(dt, dz) {
    const S = this.sparks;
    S.begin();
    for (const s of this.sparkList) {
      if (s.life <= 0) continue;
      s.life -= dt;
      s.vy -= 18 * dt;
      s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt + dz;
      if (s.y < 0.05) { s.y = 0.05; s.vy *= -0.35; s.vx *= 0.7; s.vz *= 0.7; }
      const k = s.life / s.max;
      S.push(s.x, s.y, s.z, 1.0, 0.55 + k * 0.4, 0.15 + k * 0.3, k, 0.35 + k * 0.3);
    }
    S.end();
    const K = this.smoke;
    K.begin();
    const { night } = this.sky;
    const g = 0.5 - night * 0.3;
    for (const s of this.smokeList) {
      if (s.life <= 0) continue;
      s.life -= dt;
      s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt + dz;
      const k = s.life / s.max;
      K.push(s.x, s.y, s.z, g, g, g * 1.05, Math.min(1, k * 1.6) * 0.55, 2.2 + (1 - k) * 5);
    }
    K.end();
  }

  updateLines(realDt) {
    const amt = this.reduced ? 0 : L.clamp(this.nitroFx * 0.9 + Math.max(0, this.speed - 42) * 0.02, 0, 1);
    this.lineMat.opacity = amt * 0.55;
    this.lineMesh.visible = amt > 0.01;
    if (!this.lineMesh.visible) return;
    const sp = this.speed * (1 + this.nitroFx) * 1.4;
    const len = 1.5 + this.nitroFx * 7;
    const arr = this.linePos;
    for (let i = 0; i < this.lines.length; i++) {
      const l = this.lines[i];
      l.z += sp * realDt;
      if (l.z > -1.5) this.resetLine(l, false);
      arr[i * 6] = l.x; arr[i * 6 + 1] = l.y; arr[i * 6 + 2] = l.z;
      arr[i * 6 + 3] = l.x; arr[i * 6 + 4] = l.y; arr[i * 6 + 5] = l.z - len;
    }
    this.lineAttr.needsUpdate = true;
  }

  resize() {
    const r = this.container.getBoundingClientRect();
    this.width = Math.max(1, Math.round(r.width));
    this.height = Math.max(1, Math.round(r.height));
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    if (this.paused && !this.disposed) this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect();
    this.container.classList.remove('is-nitro');
    this.renderer.domElement.removeEventListener('webglcontextlost', this.onContextLost);
    const seen = new Set();
    const free = (x) => { if (x && !seen.has(x)) { seen.add(x); x.dispose?.(); } };
    this.scene.traverse((o) => {
      free(o.geometry);
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) { if (!m) continue; free(m.map); free(m.alphaMap); free(m.emissiveMap); free(m); }
    });
    for (const v of this.variants) { free(v.decor); free(v.lamps); }
    this.disposables.forEach(free);
    if (this.audio) { try { this.audio.o1.stop(); this.audio.o2.stop(); } catch { /* ignore */ } this.audio.ctx.close().catch(() => {}); }
    this.renderer.dispose();
    this.renderer.forceContextLoss?.();
    this.renderer.domElement.remove();
  }
}
