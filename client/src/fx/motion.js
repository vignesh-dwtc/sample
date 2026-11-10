// PlayNest motion helpers (additive to fx/index.js). Framework-free so any module can use them.
//   onCelebrate(type, fn) / emitCelebrate(type, detail)   tiny event bus ('levelup' | 'achievement')
//   easeOutCubic(t)                                       easing used by count-ups and bars
//   tween(from, to, ms, onFrame) → cancel()               rAF tween (instant under reduced motion)
import { reducedMotion } from './index.js';

const EVT = 'playnest:celebrate';

export function emitCelebrate(type, detail = {}) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(EVT, { detail: { type, ...detail } }));
}

export function onCelebrate(type, fn) {
  if (typeof window === 'undefined') return () => {};
  const h = (e) => { if (e.detail?.type === type) fn(e.detail); };
  window.addEventListener(EVT, h);
  return () => window.removeEventListener(EVT, h);
}

export const easeOutCubic = (t) => 1 - (1 - t) ** 3;

export function tween(from, to, ms, onFrame) {
  if (reducedMotion() || from === to || typeof requestAnimationFrame === 'undefined') { onFrame(to, 1); return () => {}; }
  let raf = 0;
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / ms);
    onFrame(from + (to - from) * easeOutCubic(t), t);
    if (t < 1) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}
