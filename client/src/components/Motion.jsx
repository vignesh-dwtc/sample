// App-wide motion system: aurora background, route transitions, press ripples, UI sounds,
// desktop 3D tilt, count-up numbers and the animated XP bar. See Motion.css.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { haptic, reducedMotion, sound } from '../fx/index.js';
import { tween } from '../fx/motion.js';
import './Motion.css';

/** Subtle aurora blobs behind the app. GPU-only (transform), paused when hidden or off-screen. */
export function Aurora() {
  return (
    <div className="pn-aurora" aria-hidden="true">
      <span className="pn-aurora-blob b1" />
      <span className="pn-aurora-blob b2" />
      <span className="pn-aurora-blob b3" />
      <span className="pn-aurora-grain" />
    </div>
  );
}

// Arcade game pages play their own SFX; skip generic UI sounds there so nothing doubles up.
const quietRoute = (p) => /^\/arcade\/./.test(p);
const finePointer = () => typeof window !== 'undefined' && window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;

/**
 * Installs the global, delegated motion behaviours once (from Layout):
 *  - View Transitions on internal link clicks (fallback: a fade-in of <main> on route change)
 *  - ripple on .btn / .pn-press, tiny tap/click sounds on primary actions
 *  - 3D tilt + shine on .pn-tilt (desktop pointer only)
 *  - html.pn-hidden while the tab is hidden (pauses CSS loops)
 */
export function useGlobalMotion(mainRef) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const pendingVT = useRef(null);
  const firstRender = useRef(true);
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  // Route change: finish a pending view transition, or run the fallback fade.
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
    if (firstRender.current) { firstRender.current = false; return; }
    if (pendingVT.current) { pendingVT.current(); pendingVT.current = null; return; }
    const main = mainRef.current;
    if (main && !reducedMotion() && main.animate) {
      // Opacity only: a transform here would re-parent position:fixed children while it runs.
      main.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' });
    }
  }, [pathname, mainRef]);

  useEffect(() => {
    const doc = document;
    const root = doc.documentElement;

    const onVisibility = () => root.classList.toggle('pn-hidden', doc.hidden);
    onVisibility();

    // ---- View transitions on internal links ----
    const onClickCapture = (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target instanceof Element && e.target.closest('a[href]');
      if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download') || a.closest('[data-no-vt]')) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname === location.pathname) return;
      if (url.pathname.startsWith('/api')) return;
      if (!doc.startViewTransition || reducedMotion()) return;
      e.preventDefault();
      const to = url.pathname + url.search + url.hash;
      try {
        doc.startViewTransition(() => new Promise((resolve) => {
          const t = setTimeout(() => { pendingVT.current = null; resolve(); }, 650);
          pendingVT.current = () => { clearTimeout(t); resolve(); };
          navigate(to);
        }));
      } catch {
        navigate(to);
      }
    };

    // ---- Ripple + press feedback ----
    const onPointerDown = (e) => {
      const el = e.target instanceof Element && e.target.closest('.btn, .pn-press');
      if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true' || reducedMotion()) return;
      const r = el.getBoundingClientRect();
      const size = Math.max(r.width, r.height) * 2.2;
      const span = doc.createElement('span');
      span.className = 'pn-ripple';
      span.setAttribute('aria-hidden', 'true');
      span.style.width = span.style.height = `${size}px`;
      span.style.left = `${e.clientX - r.left - size / 2}px`;
      span.style.top = `${e.clientY - r.top - size / 2}px`;
      el.appendChild(span);
      span.addEventListener('animationend', () => span.remove(), { once: true });
      setTimeout(() => span.remove(), 900);
    };

    // ---- Subtle UI sounds (only after a real click = user gesture) ----
    const onClick = (e) => {
      if (quietRoute(pathRef.current)) return;
      const el = e.target instanceof Element && e.target.closest('.btn, .pn-tab, .pn-link, .pn-sfx, .lb-tab, .lb-period');
      if (!el || el.disabled || el.closest('[data-sfx="off"]')) return;
      const primary = el.classList.contains('btn') && !el.classList.contains('ghost') && !el.classList.contains('secondary');
      sound(primary ? 'tap' : 'click');
      if (primary) haptic('tap');
    };

    // ---- 3D tilt (desktop) ----
    let tiltEl = null, raf = 0, last = null;
    const resetTilt = (el) => { el.style.removeProperty('--rx'); el.style.removeProperty('--ry'); el.classList.remove('is-tilting'); };
    const applyTilt = () => {
      raf = 0;
      if (!tiltEl || !last) return;
      const r = tiltEl.getBoundingClientRect();
      const px = (last.x - r.left) / r.width, py = (last.y - r.top) / r.height;
      tiltEl.style.setProperty('--rx', `${((0.5 - py) * 9).toFixed(2)}deg`);
      tiltEl.style.setProperty('--ry', `${((px - 0.5) * 11).toFixed(2)}deg`);
      tiltEl.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`);
      tiltEl.style.setProperty('--my', `${(py * 100).toFixed(1)}%`);
    };
    const onPointerMove = (e) => {
      if (e.pointerType !== 'mouse' || !finePointer() || reducedMotion()) return;
      const el = e.target instanceof Element && e.target.closest('.pn-tilt');
      if (el !== tiltEl) { if (tiltEl) resetTilt(tiltEl); tiltEl = el; if (el) el.classList.add('is-tilting'); }
      if (!el) return;
      last = { x: e.clientX, y: e.clientY };
      if (!raf) raf = requestAnimationFrame(applyTilt);
    };
    const onLeaveDoc = () => { if (tiltEl) resetTilt(tiltEl); tiltEl = null; };

    doc.addEventListener('visibilitychange', onVisibility);
    doc.addEventListener('click', onClickCapture, true);
    doc.addEventListener('click', onClick);
    doc.addEventListener('pointerdown', onPointerDown, { passive: true });
    doc.addEventListener('pointermove', onPointerMove, { passive: true });
    doc.documentElement.addEventListener('pointerleave', onLeaveDoc);
    return () => {
      doc.removeEventListener('visibilitychange', onVisibility);
      doc.removeEventListener('click', onClickCapture, true);
      doc.removeEventListener('click', onClick);
      doc.removeEventListener('pointerdown', onPointerDown);
      doc.removeEventListener('pointermove', onPointerMove);
      doc.documentElement.removeEventListener('pointerleave', onLeaveDoc);
      cancelAnimationFrame(raf);
    };
  }, [navigate]);
}

/**
 * Animated number. Counts from the previous value (0 on first mount) to `value`.
 * Screen readers get the final value only.
 */
export function CountUp({ value, format = (n) => Math.round(n).toLocaleString('en-US'), duration = 900, className }) {
  const target = Number(value) || 0;
  const [shown, setShown] = useState(() => (reducedMotion() ? target : 0));
  const from = useRef(reducedMotion() ? target : 0);
  useEffect(() => {
    const cancel = tween(from.current, target, duration, (v) => { from.current = v; setShown(v); });
    return cancel;
  }, [target, duration]);
  return (
    <span className={`pn-count${className ? ` ${className}` : ''}`}>
      <span aria-hidden="true">{format(shown)}</span>
      <span className="pn-sr-only">{format(target)}</span>
    </span>
  );
}

/** XP / progress bar that fills with a transform (no layout) and a travelling sheen. */
export function XpBar({ pct, label, className = '' }) {
  const v = Math.max(0, Math.min(100, Number(pct) || 0));
  const [fill, setFill] = useState(() => (reducedMotion() ? v : 0));
  useEffect(() => {
    if (reducedMotion()) { setFill(v); return undefined; }
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setFill(v)));
    return () => cancelAnimationFrame(id);
  }, [v]);
  return (
    <div className={`progress pn-xpbar ${className}`} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v)}>
      <span className="pn-xpbar-fill" style={{ transform: `scaleX(${fill / 100})` }} />
    </div>
  );
}

/** True while the element is on screen (used to pause decorative loops). */
export function useInView(ref, rootMargin = '80px') {
  const [inView, setInView] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { rootMargin });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, rootMargin]);
  return inView;
}
