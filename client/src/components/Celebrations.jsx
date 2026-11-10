// Full-screen LEVEL UP moment. Triggered centrally by session.celebrate() → emitCelebrate('levelup').
import { useCallback, useEffect, useRef, useState } from 'react';
import { confetti, haptic, reducedMotion, sound } from '../fx/index.js';
import { onCelebrate } from '../fx/motion.js';
import './Celebrations.css';

const AUTO_MS = 4200;

export default function Celebrations() {
  const [lvl, setLvl] = useState(null); // { level, xpGained, key }
  const [leaving, setLeaving] = useState(false);
  const btnRef = useRef(null);
  const opener = useRef(null);

  useEffect(() => onCelebrate('levelup', (d) => {
    opener.current = document.activeElement;
    setLeaving(false);
    setLvl({ level: d.level, xpGained: d.xpGained, key: Date.now() });
  }), []);

  const close = useCallback(() => {
    setLeaving(true);
    setTimeout(() => {
      setLvl(null);
      setLeaving(false);
      const o = opener.current;
      if (o && o.isConnected && o !== document.body) o.focus?.({ preventScroll: true });
    }, reducedMotion() ? 0 : 280);
  }, []);

  useEffect(() => {
    if (!lvl) return undefined;
    sound('levelup');
    haptic([20, 60, 30, 60, 60]);
    const c1 = setTimeout(() => confetti({ y: 0.42, count: 180, spread: 1.15 }), 260);
    const c2 = setTimeout(() => {
      confetti({ x: 0.15, y: 0.75, count: 70, spread: 0.8 });
      confetti({ x: 0.85, y: 0.75, count: 70, spread: 0.8 });
    }, 700);
    const auto = setTimeout(close, AUTO_MS);
    btnRef.current?.focus({ preventScroll: true });
    const onKey = (e) => {
      if (e.key === 'Escape') close();
      if (e.key === 'Tab') { e.preventDefault(); btnRef.current?.focus(); } // single control: keep focus inside
    };
    window.addEventListener('keydown', onKey);
    return () => { clearTimeout(c1); clearTimeout(c2); clearTimeout(auto); window.removeEventListener('keydown', onKey); };
  }, [lvl, close]);

  if (!lvl) return null;
  return (
    <div
      key={lvl.key}
      className={`pn-lvl${leaving ? ' is-leaving' : ''}`}
      role="dialog" aria-modal="true" aria-labelledby="pn-lvl-title" aria-describedby="pn-lvl-sub"
      onClick={close}
    >
      <div className="pn-lvl-rays" aria-hidden="true" />
      <div className="pn-lvl-glow" aria-hidden="true" />
      <div className="pn-lvl-ring" aria-hidden="true" />
      <div className="pn-lvl-core">
        <p className="pn-lvl-eyebrow" id="pn-lvl-title">Level up!</p>
        <div className="pn-lvl-num" aria-hidden="true">
          <span className="pn-lvl-num-label">LEVEL</span>
          <span className="pn-lvl-num-val">{lvl.level}</span>
        </div>
        <p className="pn-lvl-sub" id="pn-lvl-sub">
          You reached <strong>level {lvl.level}</strong>{lvl.xpGained ? ` · +${lvl.xpGained} XP` : ''}. Keep playing to unlock more!
        </p>
        <button ref={btnRef} type="button" className="btn pn-lvl-btn" onClick={(e) => { e.stopPropagation(); close(); }}>
          Awesome!
        </button>
        <span className="pn-lvl-hint small" aria-hidden="true">Tap anywhere to continue</span>
      </div>
      <div className="pn-lvl-timer" aria-hidden="true" style={{ animationDuration: `${AUTO_MS}ms` }} />
    </div>
  );
}
