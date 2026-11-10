// Animated, decorative preview loops for the three arcade games (pure CSS/SVG, GPU-friendly).
// Used by the Arcade hub and the Home arcade hero. Loops pause off-screen / in hidden tabs and
// are static under prefers-reduced-motion. See ArcadePreviews.css.
import { useRef } from 'react';
import { useInView } from './Motion.jsx';
import './ArcadePreviews.css';

function Stage({ kind, className = '', children }) {
  const ref = useRef(null);
  const inView = useInView(ref);
  return (
    <div ref={ref} className={`ap-stage ap-${kind} pn-loop${inView ? '' : ' is-paused'} ${className}`} aria-hidden="true">
      {children}
    </div>
  );
}

export function CricketPreview({ className }) {
  return (
    <Stage kind="cricket" className={className}>
      <div className="ck-sky" />
      <div className="ck-stars" />
      {['l', 'r'].map((s) => (
        <div key={s} className={`ck-tower ${s}`}>
          <div className="ck-cone" />
          <div className="ck-pole" />
          <div className="ck-lamp"><span className="ck-flare" /></div>
        </div>
      ))}
      <div className="ck-stands">
        {[12, 27, 41, 58, 73, 88].map((x, i) => <span key={x} className="ck-flash" style={{ left: `${x}%`, top: `${20 + (i % 3) * 22}%`, animationDelay: `${i * 0.53}s` }} />)}
      </div>
      <div className="ck-field" />
      <div className="ck-pitch" />
      <div className="ck-crease" />
      <div className="ck-stumps"><i /><i /><i /></div>
      <div className="ck-bat" />
      <div className="ck-ballx"><div className="ck-bally"><span className="ck-ball" /></div></div>
      <div className="ck-ballx t1"><div className="ck-bally"><span className="ck-ball" /></div></div>
      <div className="ck-ballx t2"><div className="ck-bally"><span className="ck-ball" /></div></div>
      <div className="ck-six">SIX!</div>
    </Stage>
  );
}

const Car = ({ body = '#7c5cff', roof = '#4b33c9' }) => (
  <svg viewBox="0 0 100 64" className="hw-car-svg">
    <ellipse cx="50" cy="60" rx="46" ry="4" fill="rgba(0,0,0,.45)" />
    <rect x="8" y="44" width="16" height="16" rx="4" fill="#111" />
    <rect x="76" y="44" width="16" height="16" rx="4" fill="#111" />
    <path d="M22 18 Q26 6 38 5 H62 Q74 6 78 18 Z" fill={roof} />
    <path d="M27 18 Q30 9 39 8 H61 Q70 9 73 18 Z" fill="#9fd8ff" opacity=".55" />
    <rect x="4" y="18" width="92" height="34" rx="10" fill={body} />
    <rect x="4" y="34" width="92" height="6" fill="rgba(0,0,0,.18)" />
    <rect x="9" y="23" width="20" height="8" rx="3" fill="#ff3b5c" className="hw-tail" />
    <rect x="71" y="23" width="20" height="8" rx="3" fill="#ff3b5c" className="hw-tail" />
    <rect x="38" y="40" width="24" height="7" rx="2" fill="#f4f4f8" />
  </svg>
);

export function HighwayPreview({ className }) {
  return (
    <Stage kind="highway" className={className}>
      <div className="hw-sky" />
      <div className="hw-sun" />
      <svg className="hw-city" viewBox="0 0 320 40" preserveAspectRatio="none">
        <path d="M0 40 V26 h14 V18 h10 V28 h12 V12 h8 V6 h6 V12 h8 V30 h16 V20 h12 V24 h10 V8 h12 V30 h14 V22 h18 V14 h8 V26 h16 V18 h10 V10 h6 V18 h10 V28 h18 V20 h12 V30 h14 V16 h10 V26 h18 V22 h12 V40 Z" />
      </svg>
      <div className="hw-ground" />
      <svg className="hw-road" viewBox="0 0 100 100" preserveAspectRatio="none">
        <polygon points="47,0 53,0 125,100 -25,100" fill="url(#hwAsphalt)" />
        <polygon points="47,0 47.6,0 -16,100 -25,100" fill="#ffd166" opacity=".9" />
        <polygon points="52.4,0 53,0 125,100 116,100" fill="#ffd166" opacity=".9" />
        <defs>
          <linearGradient id="hwAsphalt" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#3a3260" />
            <stop offset="1" stopColor="#15132b" />
          </linearGradient>
        </defs>
      </svg>
      <div className="hw-vp">
        {[0, 1, 2, 3, 4].map((i) => <span key={`a${i}`} className="hw-dash l" style={{ animationDelay: `${-i * 0.18}s` }} />)}
        {[0, 1, 2, 3, 4].map((i) => <span key={`b${i}`} className="hw-dash r" style={{ animationDelay: `${-i * 0.18}s` }} />)}
        <span className="hw-streak s1" /><span className="hw-streak s2" /><span className="hw-streak s3" /><span className="hw-streak s4" />
        <div className="hw-traffic t1"><Car body="#ff9f43" roof="#c56a12" /></div>
        <div className="hw-traffic t2"><Car body="#22d3a6" roof="#12907a" /></div>
      </div>
      <div className="hw-player"><Car /></div>
      <div className="hw-pop">NEAR MISS +50</div>
      <div className="hw-speed"><b>212</b> km/h</div>
    </Stage>
  );
}

// Mid-game board: a scattered layout, the striker cuts a white coin into the top-right pocket.
const COINS = [
  ['white', 30, 40], ['black', 40, 63], ['white', 44, 27], ['black', 24, 67],
  ['black', 79, 58], ['white', 33, 19], ['black', 57, 16], ['queen', 49, 47],
];

export function CarromPreview({ className }) {
  return (
    <Stage kind="carrom" className={className}>
      <div className="cr-bg" />
      <div className="cr-tilt">
        <div className="cr-board">
          <div className="cr-surface">
            <span className="cr-pocket p1" /><span className="cr-pocket p2" /><span className="cr-pocket p3" /><span className="cr-pocket p4" />
            <span className="cr-line top" /><span className="cr-line bottom" /><span className="cr-line left" /><span className="cr-line right" />
            <span className="cr-circle" /><span className="cr-circle small" />
            <span className="cr-arrow a1" /><span className="cr-arrow a2" />
            {COINS.map(([k, x, y]) => <span key={`${x}-${y}`} className={`cr-coin ${k}`} style={{ left: `${x}%`, top: `${y}%` }} />)}
            <span className="cr-coin white is-hit" style={{ left: '72%', top: '28%' }} />
            <span className="cr-aim" />
            <span className="cr-striker" />
            <span className="cr-glow" />
            <span className="cr-pop">+20</span>
          </div>
        </div>
      </div>
    </Stage>
  );
}

export const PREVIEWS = { cricket: CricketPreview, highway: HighwayPreview, carrom: CarromPreview };
