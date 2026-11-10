// PlayNest FX toolkit — shared "wow" effects. Stable API (other modules import these):
//   confetti({ x, y, count, colors, spread })   full-screen canvas confetti burst (x,y in 0..1 viewport fractions)
//   burst(el | {x, y}, { count, colors })        small particle burst at an element or point (px)
//   floatText(el | {x, y}, text, { color })       "+50" style floating label
//   sound(name, { volume }?)                      synthesized SFX: 'tap','success','error','coin','levelup','whoosh','hit','crowd','swoosh','engine','crash','click'
//   haptic(pattern)                               navigator.vibrate wrapper ('tap'|'success'|'error'|number[])
//   isMuted() / setMuted(bool) / useMuted()       sound preference (persisted)
//   reducedMotion()                               true if the user prefers reduced motion
import { useSyncExternalStore } from 'react';

export const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const PALETTE = ['#7c5cff', '#22d3a6', '#ffd166', '#ff5c7a', '#9d84ff', '#4cc9f0'];

// ---------- particles (single shared overlay canvas) ----------
let canvas, ctx, parts = [], raf = 0;
function ensureCanvas() {
  if (canvas) return;
  canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: '9999' });
  document.body.appendChild(canvas);
  ctx = canvas.getContext('2d');
  const size = () => { const d = Math.min(window.devicePixelRatio || 1, 2); canvas.width = innerWidth * d; canvas.height = innerHeight * d; ctx.setTransform(d, 0, 0, d, 0, 0); };
  size(); window.addEventListener('resize', size);
}
function loop() {
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  parts = parts.filter((p) => p.life > 0);
  for (const p of parts) {
    p.vy += p.g; p.vx *= p.drag; p.vy *= p.drag; p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life -= 1;
    ctx.save(); ctx.globalAlpha = Math.min(1, p.life / 30); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.c;
    if (p.shape === 'rect') ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); else { ctx.beginPath(); ctx.arc(0, 0, p.s / 2, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }
  raf = parts.length ? requestAnimationFrame(loop) : 0;
  if (!raf) ctx.clearRect(0, 0, innerWidth, innerHeight);
}
function emit(list) { if (reducedMotion()) return; ensureCanvas(); parts.push(...list); if (!raf) raf = requestAnimationFrame(loop); }
const rnd = (a, b) => a + Math.random() * (b - a);
const pt = (t) => { if (t && t.getBoundingClientRect) { const r = t.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; } return t || { x: innerWidth / 2, y: innerHeight / 2 }; };

export function confetti({ x = 0.5, y = 0.35, count = 140, colors = PALETTE, spread = 1 } = {}) {
  const ox = x * innerWidth, oy = y * innerHeight;
  emit(Array.from({ length: Math.min(count, 300) }, () => {
    const a = rnd(0, Math.PI * 2), v = rnd(4, 13) * spread;
    return { x: ox, y: oy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 6, g: 0.28, drag: 0.985, s: rnd(6, 11), rot: rnd(0, 6), vr: rnd(-0.3, 0.3), c: colors[(Math.random() * colors.length) | 0], life: rnd(80, 140), shape: Math.random() < 0.7 ? 'rect' : 'dot' };
  }));
}
export function burst(target, { count = 24, colors = PALETTE } = {}) {
  const { x, y } = pt(target);
  emit(Array.from({ length: count }, () => {
    const a = rnd(0, Math.PI * 2), v = rnd(2, 6);
    return { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 0.12, drag: 0.94, s: rnd(3, 6), rot: 0, vr: 0, c: colors[(Math.random() * colors.length) | 0], life: rnd(30, 50), shape: 'dot' };
  }));
}
export function floatText(target, text, { color = '#ffd166' } = {}) {
  const { x, y } = pt(target);
  const el = document.createElement('div');
  el.textContent = text; el.setAttribute('aria-hidden', 'true');
  Object.assign(el.style, { position: 'fixed', left: `${x}px`, top: `${y}px`, transform: 'translate(-50%,-50%)', color, font: '800 1.4rem Outfit, system-ui, sans-serif', textShadow: '0 2px 12px rgba(0,0,0,.5)', pointerEvents: 'none', zIndex: '9999', transition: 'transform .9s cubic-bezier(.2,.8,.2,1), opacity .9s' });
  document.body.appendChild(el);
  requestAnimationFrame(() => { el.style.transform = 'translate(-50%,-160%) scale(1.15)'; el.style.opacity = '0'; });
  setTimeout(() => el.remove(), 950);
}

// ---------- sound (WebAudio synthesis — no audio files) ----------
const MUTE_KEY = 'playnest.muted';
let muted = (() => { try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; } })();
const muteListeners = new Set();
export const isMuted = () => muted;
export function setMuted(m) { muted = !!m; try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch { /* ignore */ } muteListeners.forEach((l) => l()); }
export const useMuted = () => useSyncExternalStore((l) => { muteListeners.add(l); return () => muteListeners.delete(l); }, () => muted, () => muted);

let ac;
const audio = () => { try { ac ||= new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); return ac; } catch { return null; } };
function tone(a, { f = 440, f2, type = 'sine', dur = 0.15, vol = 0.15, delay = 0 }) {
  const t = a.currentTime + delay, o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  vol = Math.max(0.0002, vol * gainScale);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
}
function noise(a, { dur = 0.3, vol = 0.12, filter = 1200, q = 0.7, delay = 0, sweepTo }) {
  const t = a.currentTime + delay, len = Math.ceil(a.sampleRate * dur), buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource(), bp = a.createBiquadFilter(), g = a.createGain();
  src.buffer = buf; bp.type = 'bandpass'; bp.frequency.setValueAtTime(filter, t); if (sweepTo) bp.frequency.exponentialRampToValueAtTime(sweepTo, t + dur); bp.Q.value = q;
  vol = Math.max(0.0002, vol * gainScale);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(bp).connect(g).connect(a.destination); src.start(t); src.stop(t + dur);
}
const SOUNDS = {
  click: (a) => tone(a, { f: 900, dur: 0.04, vol: 0.06, type: 'square' }),
  tap: (a) => tone(a, { f: 520, f2: 680, dur: 0.07, vol: 0.08, type: 'triangle' }),
  success: (a) => [523, 659, 784].forEach((f, i) => tone(a, { f, dur: 0.18, vol: 0.12, type: 'triangle', delay: i * 0.08 })),
  error: (a) => tone(a, { f: 220, f2: 140, dur: 0.22, vol: 0.12, type: 'sawtooth' }),
  coin: (a) => { tone(a, { f: 988, dur: 0.08, vol: 0.1, type: 'square' }); tone(a, { f: 1319, dur: 0.18, vol: 0.1, type: 'square', delay: 0.07 }); },
  levelup: (a) => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(a, { f, dur: 0.25, vol: 0.12, type: 'triangle', delay: i * 0.09 })),
  whoosh: (a) => noise(a, { dur: 0.35, vol: 0.12, filter: 400, sweepTo: 3000 }),
  swoosh: (a) => noise(a, { dur: 0.2, vol: 0.1, filter: 2500, sweepTo: 600 }),
  hit: (a) => { noise(a, { dur: 0.08, vol: 0.35, filter: 1800, q: 1.5 }); tone(a, { f: 180, f2: 90, dur: 0.12, vol: 0.2 }); },
  crowd: (a) => noise(a, { dur: 1.8, vol: 0.09, filter: 900, q: 0.4 }),
  engine: (a) => tone(a, { f: 70, f2: 140, dur: 0.6, vol: 0.06, type: 'sawtooth' }),
  crash: (a) => { noise(a, { dur: 0.7, vol: 0.3, filter: 600, q: 0.5 }); tone(a, { f: 120, f2: 40, dur: 0.5, vol: 0.2, type: 'sawtooth' }); },
};
// Optional { volume } (0..1) scales the effect, e.g. collision clicks by impact speed.
let gainScale = 1;
export function sound(name, { volume = 1 } = {}) {
  if (muted || !SOUNDS[name]) return;
  const a = audio();
  if (a) { gainScale = Math.max(0, Math.min(1, volume)); try { SOUNDS[name](a); } catch { /* ignore */ } gainScale = 1; }
}

// ---------- haptics ----------
const HAPTICS = { tap: 10, success: [12, 40, 20], error: [40, 30, 40], heavy: 35 };
export function haptic(p = 'tap') { try { navigator.vibrate?.(HAPTICS[p] ?? p); } catch { /* ignore */ } }
