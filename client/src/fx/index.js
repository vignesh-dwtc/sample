// PlayNest FX toolkit — shared "wow" effects. Stable API (other modules import these):
//   confetti({ x, y, count, colors, spread })   full-screen canvas confetti burst (x,y in 0..1 viewport fractions)
//   burst(el | {x, y}, { count, colors })        small particle burst at an element or point (px)
//   floatText(el | {x, y}, text, { color })       "+50" style floating label
//   sound(name, { volume, pan, pitch }?)          realistic synthesized SFX (all old names kept: tap, click, success, error, coin, levelup,
//                                                 whoosh, swoosh, hit, crowd, engine, crash) + cricket/highway/carrom/generic sets
//   loop(name, { volume, rate, pan })             continuous beds → { set(), stop(fadeMs) }; soundNames() / loopNames() list them
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
  Object.assign(el.style, { position: 'fixed', left: `${x}px`, top: `${y}px`, transform: 'translate(-50%,-50%)', color, font: "800 1.5rem 'Baloo 2', Nunito, system-ui, sans-serif", textShadow: '0 2px 12px rgba(0,0,0,.5)', pointerEvents: 'none', zIndex: '9999', transition: 'transform .9s cubic-bezier(.2,.8,.2,1), opacity .9s' });
  document.body.appendChild(el);
  requestAnimationFrame(() => { el.style.transform = 'translate(-50%,-160%) scale(1.15)'; el.style.opacity = '0'; });
  setTimeout(() => el.remove(), 950);
}

// ---------- sound (procedural, physically-informed synthesis — see ./audio/registry.js) ----------
// sound(name, { volume, pan, pitch }) one-shots, loop(name, opts) → { set, stop }, soundNames(), loopNames().
// Mute is persisted under 'playnest.muted'; muting stops loops instantly.
import { isMuted as audioIsMuted, setMuted as audioSetMuted, subscribeMuted } from './audio/index.js';
export { sound, loop, soundNames, loopNames, preloadSounds, setCategoryVolume } from './audio/index.js';
export const isMuted = audioIsMuted;
export const setMuted = audioSetMuted;
export const useMuted = () => useSyncExternalStore(subscribeMuted, audioIsMuted, audioIsMuted);

// ---------- haptics ----------
const HAPTICS = { tap: 10, success: [12, 40, 20], error: [40, 30, 40], heavy: 35 };
export function haptic(p = 'tap') { try { navigator.vibrate?.(HAPTICS[p] ?? p); } catch { /* ignore */ } }
