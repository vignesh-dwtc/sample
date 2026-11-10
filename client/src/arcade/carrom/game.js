// Carrom Strike game controller: fixed-timestep loop, touch/mouse/keyboard input, rules, juice and drawing.
// The React page owns the HUD/overlays; this class owns the canvas. No allocations in the per-frame path
// (typed arrays + pre-rendered sprites; callbacks fire only when something changes).
import {
  createWorld, setupBoard, setBody, step, isMoving, clearEvents, countActive, predictContact, nearestFreeBaseX, placeNear,
  shotSpeed, SIZE, STRIKER_R, COIN_R, POCKETS, BASE_Y, T_STRIKER, T_WHITE, T_BLACK, T_QUEEN,
} from './engine.js';
import { createRules, resolveShot, finalizeRound, pocketedCount, ROUND_SECONDS, POINTS_WHITE, POINTS_BLACK, POINTS_QUEEN } from './rules.js';
import { renderBoard, renderSprites, FRAME, WORLD } from './art.js';
import { sound, haptic, burst, floatText, confetti, reducedMotion } from '../../fx/index.js';

const STEP = 1 / 120;
const MAX_PULL = 330; // world units of pull for full power
const MIN_POWER = 0.05;
const TAU = Math.PI * 2;
const FALL_SLOTS = 24;
const FALL_TIME = 0.5;
const RING_SLOTS = 16;
const RING_COLORS = ['#ffffff', '#ffd166', '#ff5c7a'];
const TRAIL = 8;
const POWER_COLORS = Array.from({ length: 21 }, (_, i) => `hsl(${Math.round(130 - i * 6.5)}, 90%, 58%)`);
const DASH = [7, 9];
const NO_DASH = [];
const COIN_COLORS = {
  [T_WHITE]: ['#fff6e0', '#ffd166', '#ffffff'],
  [T_BLACK]: ['#4a4a4a', '#9aa0b5', '#ffd166'],
  [T_QUEEN]: ['#ff5c7a', '#ffd166', '#ff9aa8'],
  [T_STRIKER]: ['#ff5c7a', '#ffffff'],
};

export class CarromGame {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{ onHud?: Function, onBanner?: Function, onEnd?: Function }} cb
   */
  constructor(canvas, cb = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cb = cb;
    this.world = setupBoard(createWorld());
    this.rules = createRules();
    this.state = 'idle'; // idle | place | moving | over
    this.paused = false;
    this.timeLeft = ROUND_SECONDS;
    this.css = 0; this.dpr = 1; this.s = 1;
    this.board = null; this.sprites = null;
    this.raf = 0; this.last = 0; this.acc = 0;
    this.drag = null; this.rect = null;
    this.aimDx = 0; this.aimDy = -1; this.power = 0; this.aiming = false;
    this.kbAngle = -Math.PI / 2; this.kbCharging = false; this.kbAim = false;
    this.pred = new Float64Array(8);
    this.shot = { white: 0, black: 0, queen: false, striker: false };
    this.shotHard = false;
    this.lastSoundAt = 0;
    this.shakeT = 0; this.shakeMag = 0; this.slowT = 0;
    this.clock = 0;
    this.strikerHomeX = SIZE / 2;
    this.appear = new Float32Array(this.world.n);
    this.fallT = new Float32Array(FALL_SLOTS).fill(-1);
    this.fallType = new Uint8Array(FALL_SLOTS);
    this.fallX = new Float32Array(FALL_SLOTS); this.fallY = new Float32Array(FALL_SLOTS);
    this.fallPX = new Float32Array(FALL_SLOTS); this.fallPY = new Float32Array(FALL_SLOTS);
    this.fallVX = new Float32Array(FALL_SLOTS); this.fallVY = new Float32Array(FALL_SLOTS);
    this.ringT = new Float32Array(RING_SLOTS).fill(-1);
    this.ringX = new Float32Array(RING_SLOTS); this.ringY = new Float32Array(RING_SLOTS);
    this.ringR = new Float32Array(RING_SLOTS); this.ringDur = new Float32Array(RING_SLOTS);
    this.ringC = new Uint8Array(RING_SLOTS);
    this.trailX = new Float32Array(TRAIL); this.trailY = new Float32Array(TRAIL); this.trailN = 0; this.trailHead = 0;
    this.hud = { score: -1, time: -1, white: -1, black: -1, queen: '', state: '' };
    this.queenIdx = this.world.type.indexOf(T_QUEEN);
    this.motion = !reducedMotion();

    this.frame = this.frame.bind(this);
    this.onDown = this.onDown.bind(this);
    this.onMove = this.onMove.bind(this);
    this.onUp = this.onUp.bind(this);
    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointercancel', this.onUp);
  }

  destroy() {
    cancelAnimationFrame(this.raf); this.raf = 0;
    const c = this.canvas;
    c.removeEventListener('pointerdown', this.onDown);
    c.removeEventListener('pointermove', this.onMove);
    c.removeEventListener('pointerup', this.onUp);
    c.removeEventListener('pointercancel', this.onUp);
    this.board = null; this.sprites = null;
  }

  /** Size the canvas to `css` CSS pixels square and rebuild the art. */
  resize(css) {
    css = Math.max(200, Math.floor(css));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (css === this.css && dpr === this.dpr && this.board) return;
    this.css = css; this.dpr = dpr;
    const px = Math.round(css * dpr);
    this.canvas.width = px; this.canvas.height = px;
    this.canvas.style.width = `${css}px`; this.canvas.style.height = `${css}px`;
    this.s = px / WORLD;
    this.board = renderBoard(px);
    this.sprites = renderSprites(this.s);
    this.draw();
  }

  // ---------- round lifecycle ----------
  start() {
    this.world = setupBoard(createWorld());
    this.rules = createRules();
    this.timeLeft = ROUND_SECONDS;
    this.state = 'place';
    this.paused = false;
    this.strikerHomeX = SIZE / 2;
    this.fallT.fill(-1); this.appear.fill(0); this.ringT.fill(-1); this.trailN = 0;
    this.drag = null; this.aiming = false; this.kbAim = false; this.kbCharging = false; this.power = 0;
    this.shakeT = 0; this.slowT = 0;
    this.motion = !reducedMotion();
    this.resetShot();
    this.emitHud(true);
    this.run();
  }

  pause() {
    if (this.state === 'over' || this.state === 'idle' || this.paused) return;
    this.paused = true;
    this.drag = null; this.aiming = false; this.kbCharging = false;
    cancelAnimationFrame(this.raf); this.raf = 0;
    this.draw();
    this.emitHud(true);
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    this.emitHud(true);
    this.run();
  }

  run() { if (!this.raf) { this.last = 0; this.raf = requestAnimationFrame(this.frame); } }

  resetShot() {
    const sh = this.shot;
    sh.white = 0; sh.black = 0; sh.queen = false; sh.striker = false;
    this.shotHard = false;
    this.world.firstContact = -1;
  }

  // ---------- main loop ----------
  frame(now) {
    this.raf = 0;
    if (this.paused || !this.board) return;
    const real = this.last ? Math.min(0.1, (now - this.last) / 1000) : 1 / 60;
    this.last = now;
    this.clock += real;

    if (this.state === 'place' || this.state === 'moving') {
      this.timeLeft = Math.max(0, this.timeLeft - real);
    }
    if (this.kbCharging) this.power = Math.min(1, this.power + real / 1.1);

    if (this.state === 'moving') {
      if (this.slowT > 0) this.slowT -= real;
      const scale = this.slowT > 0 ? 0.35 : 1;
      this.acc += real * scale;
      if (this.acc > 0.25) this.acc = 0.25;
      while (this.acc >= STEP) {
        step(this.world, STEP);
        this.handleEvents();
        this.acc -= STEP;
      }
      if (!isMoving(this.world)) this.endShot();
    } else if (this.state === 'place' && this.timeLeft <= 0) {
      this.endRound();
    }

    // animations
    for (let k = 0; k < FALL_SLOTS; k++) if (this.fallT[k] >= 0) { this.fallT[k] += real; if (this.fallT[k] > FALL_TIME) this.fallT[k] = -1; }
    for (let i = 0; i < this.appear.length; i++) if (this.appear[i] > 0) this.appear[i] = Math.max(0, this.appear[i] - real * 3.5);
    for (let k = 0; k < RING_SLOTS; k++) if (this.ringT[k] >= 0) { this.ringT[k] += real; if (this.ringT[k] > this.ringDur[k]) this.ringT[k] = -1; }
    if (this.shakeT > 0) this.shakeT -= real;
    // striker motion trail
    const w = this.world;
    if (this.state === 'moving' && w.active[0] && (w.vx[0] * w.vx[0] + w.vy[0] * w.vy[0]) > 500 * 500) {
      this.trailX[this.trailHead] = w.x[0]; this.trailY[this.trailHead] = w.y[0];
      this.trailHead = (this.trailHead + 1) % TRAIL; if (this.trailN < TRAIL) this.trailN++;
    } else if (this.trailN > 0) this.trailN--;

    this.draw();
    this.emitHud(false);
    if (this.state !== 'over' && this.state !== 'idle') this.raf = requestAnimationFrame(this.frame);
  }

  handleEvents() {
    const w = this.world;
    // collision sounds: loudest impact per step, throttled
    if (w.hitCount > 0) {
      let best = 0, bestK = 0;
      for (let k = 0; k < w.hitCount; k++) if (w.hitSpeed[k] > best) { best = w.hitSpeed[k]; bestK = k; }
      const strikerHit = w.hitA[bestK] === 0 && w.hitB[bestK] >= 0;
      const wall = w.hitB[bestK] < 0;
      if (best > 40 && this.clock - this.lastSoundAt > 0.035) {
        this.lastSoundAt = this.clock;
        const vol = Math.min(1, 0.12 + best / 2600) * (wall ? 0.6 : 1);
        sound(best > 1500 && !wall ? 'hit' : 'click', { volume: vol });
        if (best > 1800 && !wall) haptic(12);
      }
      if (best > 700 && !wall) this.spawnRing(w.hitX[bestK], w.hitY[bestK], 10 + Math.min(40, best / 60), 0.28, best > 2200 ? 1 : 0);
      if (strikerHit && !this.shotHard && best > 2000) {
        this.shotHard = true;
        if (this.motion) { this.shakeT = 0.28; this.shakeMag = Math.min(9, 3 + best / 700); }
      }
    }
    // pockets
    for (let k = 0; k < w.pocketCount; k++) {
      const i = w.pocketIdx[k], type = w.type[i], hole = w.pocketHole[k];
      this.spawnFall(type, w.pocketX[k], w.pocketY[k], POCKETS[hole * 2], POCKETS[hole * 2 + 1], w.pocketVx[k], w.pocketVy[k]);
      this.spawnRing(POCKETS[hole * 2], POCKETS[hole * 2 + 1], 90, 0.6, type === T_STRIKER ? 2 : 1);
      const pt = this.toClient(POCKETS[hole * 2], POCKETS[hole * 2 + 1]);
      if (type === T_STRIKER) {
        this.shot.striker = true;
        sound('error'); haptic('error');
        floatText(pt, 'Foul −10', { color: '#ff5c7a' });
        continue;
      }
      if (type === T_WHITE) this.shot.white++;
      else if (type === T_BLACK) this.shot.black++;
      else this.shot.queen = true;
      sound('coin'); haptic('success');
      burst(pt, { count: type === T_QUEEN ? 40 : 22, colors: COIN_COLORS[type] });
      const pts = type === T_WHITE ? POINTS_WHITE : type === T_BLACK ? POINTS_BLACK : POINTS_QUEEN;
      floatText(pt, `+${pts}`, { color: type === T_QUEEN ? '#ff8a9e' : type === T_WHITE ? '#ffd166' : '#cfd6ff' });
      if (type === T_QUEEN && this.motion) this.slowT = 0.6;
      if (this.shot.white + this.shot.black + (this.shot.queen ? 1 : 0) >= 3 && this.motion) this.slowT = Math.max(this.slowT, 0.35);
    }
    clearEvents(w);
  }

  spawnFall(type, x, y, px, py, vx, vy) {
    let slot = 0;
    for (let k = 0; k < FALL_SLOTS; k++) if (this.fallT[k] < 0) { slot = k; break; }
    this.fallT[slot] = 0; this.fallType[slot] = type;
    this.fallX[slot] = x; this.fallY[slot] = y; this.fallPX[slot] = px; this.fallPY[slot] = py;
    this.fallVX[slot] = vx; this.fallVY[slot] = vy;
  }

  spawnRing(x, y, radius, dur, color) {
    let slot = 0, oldest = -1;
    for (let k = 0; k < RING_SLOTS; k++) {
      if (this.ringT[k] < 0) { slot = k; oldest = -2; break; }
      if (this.ringT[k] > oldest) { oldest = this.ringT[k]; slot = k; }
    }
    this.ringT[slot] = 0; this.ringX[slot] = x; this.ringY[slot] = y; this.ringR[slot] = radius; this.ringDur[slot] = dur; this.ringC[slot] = color;
  }

  endShot() {
    const w = this.world, r = this.rules;
    const left = { white: countActive(w, T_WHITE), black: countActive(w, T_BLACK) };
    const out = resolveShot(r, this.shot, left);
    const cb = this.cb;
    if (out.covered) {
      cb.onBanner?.('Queen covered! +50', 'queen');
      sound('levelup'); haptic('success');
      confetti({ y: 0.4, count: 160, colors: ['#ff5c7a', '#ffd166', '#ffffff', '#c4212d'] });
    } else if (out.queenPocketed) {
      cb.onBanner?.('Queen! Cover her next shot', 'queen');
      sound('success');
    } else if (out.queenReturned) {
      cb.onBanner?.('Queen not covered — back to centre', 'bad');
      sound('error');
      placeNear(w, this.queenIdx, SIZE / 2, SIZE / 2);
      this.appear[this.queenIdx] = 1;
    }
    if (out.combo && !out.covered) {
      cb.onBanner?.(`${out.coins}-coin combo! ×2`, 'combo');
      sound('success');
      confetti({ y: 0.45, count: 90 + out.coins * 20 });
    }
    if (out.foul && !out.combo && !out.covered && !out.queenPocketed) cb.onBanner?.('Foul! Striker pocketed −10', 'bad');

    // striker back to the baseline
    if (!w.active[0]) setBody(w, 0, T_STRIKER, this.strikerHomeX, BASE_Y);
    w.vx[0] = 0; w.vy[0] = 0;
    w.active[0] = 0; // ignore itself while searching
    const x = nearestFreeBaseX(w, this.strikerHomeX);
    setBody(w, 0, T_STRIKER, x, BASE_Y);
    this.appear[0] = 1;
    this.resetShot();

    if (countActive(w) === 0) { this.endRound(true); return; }
    if (this.timeLeft <= 0) { this.endRound(); return; }
    this.state = 'place';
    this.emitHud(true);
  }

  endRound(cleared = false) {
    if (this.state === 'over') return;
    const lost = finalizeRound(this.rules);
    this.state = 'over';
    this.drag = null; this.aiming = false;
    cancelAnimationFrame(this.raf); this.raf = 0;
    this.draw();
    this.emitHud(true);
    const r = this.rules;
    this.cb.onEnd?.({
      score: r.score, white: r.white, black: r.black, queen: r.queenCovered, queenLost: lost < 0,
      pocketed: pocketedCount(r), bestCombo: r.bestCombo, fouls: r.fouls, shots: r.shots, cleared,
      timeLeft: Math.ceil(this.timeLeft),
    });
  }

  emitHud(force) {
    const h = this.hud, r = this.rules;
    const time = Math.ceil(this.timeLeft);
    const st = this.paused ? 'paused' : this.state;
    if (!force && h.score === r.score && h.time === time && h.white === r.white && h.black === r.black && h.queen === r.queen && h.state === st) return;
    h.score = r.score; h.time = time; h.white = r.white; h.black = r.black; h.queen = r.queen; h.state = st;
    this.cb.onHud?.({ score: r.score, time, white: r.white, black: r.black, queen: r.queen, state: st });
  }

  // ---------- input ----------
  toWorld(e) {
    const rect = this.rect || this.canvas.getBoundingClientRect();
    const k = WORLD / rect.width;
    this.tmpX = (e.clientX - rect.left) * k - FRAME;
    this.tmpY = (e.clientY - rect.top) * k - FRAME;
  }

  toClient(x, y) {
    const rect = this.canvas.getBoundingClientRect();
    const k = rect.width / WORLD;
    const vw = window.innerWidth;
    const cx = rect.left + (x + FRAME) * k;
    return { x: Math.max(48, Math.min(vw - 48, cx)), y: rect.top + (y + FRAME) * k };
  }

  onDown(e) {
    if (this.state !== 'place' || this.paused || this.drag) return;
    e.preventDefault();
    this.rect = this.canvas.getBoundingClientRect();
    this.toWorld(e);
    const wx = this.tmpX, wy = this.tmpY, w = this.world;
    try { this.canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    const dx = wx - w.x[0], dy = wy - w.y[0];
    const onStriker = dx * dx + dy * dy < (STRIKER_R * 2.2) ** 2;
    const nearBase = Math.abs(wy - BASE_Y) < STRIKER_R * 2.4;
    this.kbAim = false; this.kbCharging = false;
    this.drag = { id: e.pointerId, mode: onStriker ? 'pending' : nearBase ? 'slide' : 'aim', sx: wx, sy: wy, offX: onStriker ? w.x[0] - wx : 0 };
    if (this.drag.mode === 'slide') this.slideTo(wx);
    sound('tap');
  }

  onMove(e) {
    const d = this.drag;
    if (!d || d.id !== e.pointerId) return;
    e.preventDefault();
    this.toWorld(e);
    const wx = this.tmpX, wy = this.tmpY;
    if (d.mode === 'pending') {
      const mx = wx - d.sx, my = wy - d.sy;
      if (mx * mx + my * my < 100) return;
      // near-horizontal drags slide the striker; anything else is a slingshot pull
      d.mode = Math.abs(my) < Math.abs(mx) * 0.45 ? 'slide' : 'aim';
    }
    if (d.mode === 'slide') { this.slideTo(wx + d.offX); return; }
    // slingshot: pulling back from where the finger went down aims the opposite way
    const px = d.sx - wx, py = d.sy - wy;
    const len = Math.sqrt(px * px + py * py);
    if (len < 1) { this.power = 0; this.aiming = false; return; }
    this.aimDx = px / len; this.aimDy = py / len;
    this.power = Math.min(1, len / MAX_PULL);
    this.aiming = true;
  }

  onUp(e) {
    const d = this.drag;
    if (!d || d.id !== e.pointerId) return;
    this.drag = null; this.rect = null;
    if (d.mode === 'aim' && this.aiming && this.power >= MIN_POWER && this.state === 'place' && !this.paused) this.shoot(this.aimDx, this.aimDy, this.power);
    this.aiming = false; this.power = 0;
  }

  slideTo(wx) {
    const w = this.world;
    w.active[0] = 0;
    const x = nearestFreeBaseX(w, wx);
    w.active[0] = 1;
    w.x[0] = x; w.y[0] = BASE_Y;
    this.strikerHomeX = x;
  }

  /** Keyboard: ←/→ move, ↑/↓ aim, hold Space to charge and release to shoot. Returns true if handled. */
  key(e, down) {
    if (this.state !== 'place' || this.paused) return false;
    const k = e.key;
    if (down && (k === 'ArrowLeft' || k === 'ArrowRight')) {
      this.slideTo(this.world.x[0] + (k === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 40 : 10));
      return true;
    }
    if (down && (k === 'ArrowUp' || k === 'ArrowDown')) {
      this.kbAim = true;
      this.kbAngle += (k === 'ArrowUp' ? -1 : 1) * (e.shiftKey ? 0.12 : 0.03);
      return true;
    }
    if (k === ' ' || k === 'Enter') {
      if (down && !e.repeat && !this.kbCharging) { this.kbAim = true; this.kbCharging = true; this.power = 0; }
      else if (!down && this.kbCharging) {
        this.kbCharging = false;
        const p = this.power; this.power = 0;
        if (p >= MIN_POWER) this.shoot(Math.cos(this.kbAngle), Math.sin(this.kbAngle), p);
      }
      return true;
    }
    return false;
  }

  shoot(dx, dy, power) {
    const w = this.world, v = shotSpeed(power);
    this.resetShot();
    w.vx[0] = dx * v; w.vy[0] = dy * v;
    this.state = 'moving';
    this.acc = 0;
    sound('swoosh'); haptic(power > 0.7 ? 20 : 8);
    this.emitHud(true);
  }

  // ---------- drawing ----------
  draw() {
    const g = this.ctx, w = this.world, s = this.s, sp = this.sprites;
    if (!this.board || !sp) return;
    let ox = 0, oy = 0;
    if (this.shakeT > 0) {
      const m = this.shakeMag * this.dpr * (this.shakeT / 0.28);
      ox = (Math.random() * 2 - 1) * m; oy = (Math.random() * 2 - 1) * m;
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    g.setTransform(1, 0, 0, 1, ox, oy);
    g.drawImage(this.board, 0, 0);

    // falling coins (under everything else)
    for (let k = 0; k < FALL_SLOTS; k++) {
      const t = this.fallT[k];
      if (t < 0) continue;
      const p = t / FALL_TIME, e = 1 - (1 - p) * (1 - p);
      const x = this.fallX[k] + this.fallVX[k] * 0.03 * p, y = this.fallY[k] + this.fallVY[k] * 0.03 * p;
      const cx = x + (this.fallPX[k] - x) * e, cy = y + (this.fallPY[k] - y) * e;
      const spr = sp[this.fallType[k]];
      const sc = 1 - 0.5 * e;
      g.globalAlpha = 1 - p * 0.85;
      const size = spr.canvas.width * sc;
      g.drawImage(spr.canvas, (FRAME + cx) * s - size / 2, (FRAME + cy) * s - size / 2, size, size);
    }
    g.globalAlpha = 1;

    // impact rings + pocket flashes
    for (let k = 0; k < RING_SLOTS; k++) {
      const t = this.ringT[k];
      if (t < 0) continue;
      const p = t / this.ringDur[k], e = 1 - (1 - p) * (1 - p) * (1 - p);
      g.beginPath(); g.arc((FRAME + this.ringX[k]) * s, (FRAME + this.ringY[k]) * s, (6 + this.ringR[k] * e) * s, 0, TAU);
      g.lineWidth = (1 - p) * 4 * this.dpr; g.strokeStyle = RING_COLORS[this.ringC[k]]; g.globalAlpha = (1 - p) * 0.8; g.stroke();
      g.globalAlpha = 1;
    }
    // striker trail
    if (this.trailN > 1 && w.active[0]) {
      const spr = sp[T_STRIKER];
      for (let k = 0; k < this.trailN; k++) {
        const idx = (this.trailHead - 1 - k + TRAIL * 2) % TRAIL;
        const sc = 0.9 - k * 0.07;
        g.globalAlpha = 0.18 * (1 - k / TRAIL);
        const size = spr.canvas.width * sc;
        g.drawImage(spr.canvas, (FRAME + this.trailX[idx]) * s - size / 2, (FRAME + this.trailY[idx]) * s - size / 2, size, size);
      }
      g.globalAlpha = 1;
    }

    // coins
    for (let i = 1; i < w.n; i++) if (w.active[i]) this.blit(sp[w.type[i]], w.x[i], w.y[i], this.appear[i]);

    const placing = this.state === 'place' && !this.paused;
    if (w.active[0]) {
      const x = (FRAME + w.x[0]) * s, y = (FRAME + w.y[0]) * s;
      if (placing) {
        // pulsing "move me" glow + baseline guide
        const pulse = 0.5 + 0.5 * Math.sin(this.clock * 4);
        g.beginPath(); g.arc(x, y, (STRIKER_R + 7 + pulse * 4) * s, 0, TAU);
        g.lineWidth = 2.5 * this.dpr; g.strokeStyle = '#7cffd6'; g.globalAlpha = 0.35 + pulse * 0.35; g.stroke(); g.globalAlpha = 1;
      }
      if (placing && (this.aiming || this.kbAim)) this.drawAim(g, w.x[0], w.y[0]);
      this.blit(sp[T_STRIKER], w.x[0], w.y[0], this.appear[0]);
      if (placing && (this.aiming || this.kbAim) && this.power > 0) {
        // power ring around the striker
        const ci = Math.min(20, Math.round(this.power * 20));
        g.beginPath(); g.arc(x, y, (STRIKER_R + 12) * s, -Math.PI / 2, -Math.PI / 2 + this.power * TAU);
        g.lineWidth = 5 * this.dpr; g.lineCap = 'round'; g.strokeStyle = POWER_COLORS[ci]; g.stroke();
      }
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
  }

  blit(spr, x, y, appear) {
    const g = this.ctx, s = this.s;
    if (appear > 0) {
      const sc = 1 + Math.sin(appear * Math.PI) * 0.35 - appear * 0.3;
      const size = spr.canvas.width * sc;
      g.globalAlpha = 1 - appear * 0.6;
      g.drawImage(spr.canvas, (FRAME + x) * s - size / 2, (FRAME + y) * s - size / 2, size, size);
      g.globalAlpha = 1;
      return;
    }
    g.drawImage(spr.canvas, Math.round((FRAME + x) * s - spr.half), Math.round((FRAME + y) * s - spr.half));
  }

  drawAim(g, sx, sy) {
    const s = this.s, d = this.dpr, w = this.world;
    let dx = this.aimDx, dy = this.aimDy;
    if (this.kbAim) { dx = Math.cos(this.kbAngle); dy = Math.sin(this.kbAngle); }
    const p = this.pred;
    predictContact(w, sx, sy, dx, dy, p);
    const ci = Math.min(20, Math.round(this.power * 20));
    const X = (v) => (FRAME + v) * s;
    // slingshot band behind the striker (only for touch / mouse pulls)
    if (this.aiming && this.drag) {
      const back = 40 + this.power * 150;
      g.beginPath(); g.moveTo(X(sx), X(sy)); g.lineTo(X(sx - dx * back), X(sy - dy * back));
      g.lineWidth = (3 + this.power * 5) * d; g.lineCap = 'round'; g.strokeStyle = 'rgba(255,92,122,0.55)'; g.stroke();
      g.beginPath(); g.arc(X(sx - dx * back), X(sy - dy * back), (5 + this.power * 4) * d, 0, TAU); g.fillStyle = '#ff5c7a'; g.fill();
    }
    // dotted aim line to the first contact
    g.setLineDash(DASH);
    g.lineDashOffset = -this.clock * 40;
    g.beginPath(); g.moveTo(X(sx + dx * STRIKER_R), X(sy + dy * STRIKER_R)); g.lineTo(X(p[0]), X(p[1]));
    g.lineWidth = 2.2 * d; g.lineCap = 'round'; g.strokeStyle = 'rgba(255,255,255,0.85)'; g.stroke();
    g.setLineDash(NO_DASH);
    // ghost striker at contact
    g.beginPath(); g.arc(X(p[0]), X(p[1]), STRIKER_R * s, 0, TAU);
    g.fillStyle = 'rgba(255,255,255,0.14)'; g.fill();
    g.lineWidth = 2 * d; g.strokeStyle = 'rgba(255,255,255,0.75)'; g.stroke();
    const len = 50 + 170 * this.power;
    if (p[5] >= 0) {
      // predicted path of the target coin
      const j = p[5], tx = w.x[j], ty = w.y[j];
      g.beginPath(); g.arc(X(tx), X(ty), (COIN_R + 4) * s, 0, TAU);
      g.lineWidth = 2.5 * d; g.strokeStyle = POWER_COLORS[ci]; g.stroke();
      const ex = tx + p[2] * len, ey = ty + p[3] * len;
      g.beginPath(); g.moveTo(X(tx + p[2] * COIN_R), X(ty + p[3] * COIN_R)); g.lineTo(X(ex), X(ey));
      g.lineWidth = 3 * d; g.strokeStyle = POWER_COLORS[ci]; g.stroke();
      // arrow head
      const ax = -p[3], ay = p[2];
      g.beginPath(); g.moveTo(X(ex + p[2] * 14), X(ey + p[3] * 14));
      g.lineTo(X(ex + ax * 9), X(ey + ay * 9)); g.lineTo(X(ex - ax * 9), X(ey - ay * 9)); g.closePath();
      g.fillStyle = POWER_COLORS[ci]; g.fill();
    } else if (p[6] !== 0 || p[7] !== 0) {
      // bank shot: reflect off the cushion
      const dot = dx * p[6] + dy * p[7];
      const rx = dx - 2 * dot * p[6], ry = dy - 2 * dot * p[7];
      g.setLineDash(DASH);
      g.beginPath(); g.moveTo(X(p[0]), X(p[1])); g.lineTo(X(p[0] + rx * len), X(p[1] + ry * len));
      g.lineWidth = 2 * d; g.strokeStyle = 'rgba(255,255,255,0.4)'; g.stroke();
      g.setLineDash(NO_DASH);
    }
  }
}
