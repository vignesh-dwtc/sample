import { useRef } from 'react';
import { absDiff, norm360, pointToBearing, polar, signedDiff } from './skyLogic.js';

const C = 160;          // centre (viewBox 320)
const SKY_R = 100;      // horizon circle; centre = straight overhead
const BELOW_R = 110;    // ring for bodies below the horizon
const LABEL_R = 126;
const TICK_OUT = 152;

/** Radius on the dial for an altitude: zenith in the middle, horizon at SKY_R. */
export const altRadius = (alt) => (alt >= 0 ? SKY_R * (1 - Math.min(90, alt) / 90) : BELOW_R);

const TICKS = Array.from({ length: 72 }, (_, i) => i * 5);
const CARDINALS = [['N', 0], ['E', 90], ['S', 180], ['W', 270]];
const INTER = [['NE', 45], ['SE', 135], ['SW', 225], ['NW', 315]];

function skyTone(sunAlt) {
  if (sunAlt == null) return 'night';
  if (sunAlt > 6) return 'day';
  if (sunAlt > -6) return 'twilight';
  return 'night';
}

/**
 * SVG compass dial. Rotates by -rotation (phone heading) so N points to real north.
 * markers: [{ id, emoji, az, alt, color, label }]. guess: bearing (deg) of the player's pick.
 * reveal: { az, alt, emoji } true position to show with an error arc from guess.
 * onPick(bearing): makes the dial tappable/draggable (tap mode).
 */
export default function CompassDial({ rotation = 0, markers = [], guess = null, reveal = null, onPick, pointer = false,
  warmth = null, hold = 0, sunAlt = null, label = 'Sky compass' }) {
  const ref = useRef(null);
  const dragging = useRef(false);
  const rot = norm360(rotation || 0);
  const tone = skyTone(sunAlt);

  const pick = (e) => {
    if (!onPick || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const b = pointToBearing(e.clientX, e.clientY, r.left + r.width / 2, r.top + r.height / 2);
    onPick(norm360(b + rot));
  };
  const handlers = onPick ? {
    onPointerDown: (e) => { dragging.current = true; e.currentTarget.setPointerCapture?.(e.pointerId); pick(e); },
    onPointerMove: (e) => { if (dragging.current) pick(e); },
    onPointerUp: () => { dragging.current = false; },
    onPointerCancel: () => { dragging.current = false; },
    onKeyDown: (e) => {
      const step = e.shiftKey ? 1 : 5;
      const g = guess ?? 0;
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); onPick(norm360(g + step)); }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); onPick(norm360(g - step)); }
    },
    tabIndex: 0,
    role: 'slider',
    'aria-valuemin': 0, 'aria-valuemax': 359, 'aria-valuenow': guess == null ? 0 : Math.round(guess),
    'aria-valuetext': guess == null ? 'No direction picked yet' : `${Math.round(guess)} degrees`,
  } : { role: 'img' };

  // Error arc between the guess and the true bearing (drawn on the horizon ring).
  let arc = null;
  if (reveal && guess != null) {
    const d = signedDiff(guess, reveal.az);
    const a = polar(C, C, BELOW_R + 18, guess), b = polar(C, C, BELOW_R + 18, guess + d);
    if (Math.abs(d) > 0.5) arc = `M ${a.x} ${a.y} A ${BELOW_R + 18} ${BELOW_R + 18} 0 0 ${d > 0 ? 1 : 0} ${b.x} ${b.y}`;
  }
  const warmColor = warmth ? { hot: 'var(--danger)', warm: 'var(--warn)', mild: 'var(--gold)', cold: '#5fb3ff', freezing: '#8fa2ff' }[warmth.key] : null;
  const holdLen = 2 * Math.PI * 156;

  return (
    <svg ref={ref} className={`sk-dial sk-tone-${tone}${onPick ? ' is-pickable' : ''}`} viewBox="0 0 320 320" aria-label={label} {...handlers}>
      <defs>
        <radialGradient id="sk-sky-day" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#4fa8ff" /><stop offset="100%" stopColor="#1b4f9a" />
        </radialGradient>
        <radialGradient id="sk-sky-twilight" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#3b2f7a" /><stop offset="85%" stopColor="#8a4f8f" /><stop offset="100%" stopColor="#f29a6b" />
        </radialGradient>
        <radialGradient id="sk-sky-night" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#1a1d45" /><stop offset="100%" stopColor="#0b0c22" />
        </radialGradient>
        <radialGradient id="sk-bezel" cx="50%" cy="50%" r="50%">
          <stop offset="80%" stopColor="#1d2040" /><stop offset="100%" stopColor="#262a52" />
        </radialGradient>
      </defs>

      {/* warmth ring (compass game) — fixed, not rotating */}
      {warmth && <circle cx={C} cy={C} r={158} fill="none" stroke={warmColor} strokeWidth="4" opacity={0.35 + warmth.level * 0.65} className="sk-warm-ring" />}
      {hold > 0 && (
        <circle cx={C} cy={C} r={156} fill="none" stroke="var(--accent)" strokeWidth="6" strokeLinecap="round"
          strokeDasharray={`${holdLen * hold} ${holdLen}`} transform={`rotate(-90 ${C} ${C})`} />
      )}

      <g transform={`rotate(${-rot} ${C} ${C})`}>
        <circle cx={C} cy={C} r={TICK_OUT} fill="url(#sk-bezel)" stroke="var(--border)" strokeWidth="1.5" />
        <circle cx={C} cy={C} r={SKY_R} fill={`url(#sk-sky-${tone})`} stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" />
        {tone === 'night' && (
          <g fill="#fff" opacity="0.7">
            {[[30, 40], [80, 70], [150, 30], [200, 85], [250, 55], [310, 75], [120, 88], [20, 92], [270, 25]].map(([az, rr]) => {
              const p = polar(C, C, rr, az); return <circle key={az} cx={p.x} cy={p.y} r={az % 3 ? 0.9 : 1.4} />;
            })}
          </g>
        )}
        {/* altitude rings: 30°, 60° */}
        {[30, 60].map((a) => <circle key={a} cx={C} cy={C} r={altRadius(a)} fill="none" stroke="rgba(255,255,255,0.18)" strokeDasharray="3 4" />)}
        <circle cx={C} cy={C} r={BELOW_R} fill="none" stroke="rgba(255,255,255,0.10)" strokeDasharray="2 5" />
        <line x1={C} y1={C - SKY_R} x2={C} y2={C + SKY_R} stroke="rgba(255,255,255,0.10)" />
        <line x1={C - SKY_R} y1={C} x2={C + SKY_R} y2={C} stroke="rgba(255,255,255,0.10)" />

        {TICKS.map((t) => {
          const len = t % 90 === 0 ? 14 : t % 30 === 0 ? 10 : t % 10 === 0 ? 7 : 4;
          const a = polar(C, C, TICK_OUT - 2, t), b = polar(C, C, TICK_OUT - 2 - len, t);
          return <line key={t} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={t === 0 ? 'var(--danger)' : t % 30 === 0 ? 'var(--text)' : 'var(--text-dim)'} strokeWidth={t % 30 === 0 ? 2 : 1} opacity={t % 10 === 0 ? 1 : 0.6} />;
        })}
        {CARDINALS.map(([l, az]) => {
          const p = polar(C, C, LABEL_R, az);
          return (
            <text key={l} x={p.x} y={p.y} transform={`rotate(${rot} ${p.x} ${p.y})`} className={`sk-card-label${l === 'N' ? ' is-n' : ''}`} textAnchor="middle" dominantBaseline="central">{l}</text>
          );
        })}
        {INTER.map(([l, az]) => {
          const p = polar(C, C, LABEL_R + 2, az);
          return <text key={l} x={p.x} y={p.y} transform={`rotate(${rot} ${p.x} ${p.y})`} className="sk-inter-label" textAnchor="middle" dominantBaseline="central">{l}</text>;
        })}

        {markers.map((m) => <Marker key={m.id} m={m} rot={rot} />)}

        {guess != null && (() => {
          const tip = polar(C, C, BELOW_R + 26, guess);
          return (
            <g className="sk-guess">
              <line x1={C} y1={C} x2={tip.x} y2={tip.y} stroke="var(--primary-2)" strokeWidth="3" strokeLinecap="round" />
              <circle cx={tip.x} cy={tip.y} r="7" fill="var(--primary)" stroke="#fff" strokeWidth="2" />
            </g>
          );
        })()}
        {arc && <path d={arc} fill="none" stroke={absDiff(guess, reveal.az) <= 10 ? 'var(--hit)' : 'var(--warn)'} strokeWidth="5" strokeLinecap="round" className="sk-err-arc" />}
        {reveal && <Marker m={{ id: 'reveal', ...reveal, big: true }} rot={rot} />}
        <circle cx={C} cy={C} r="4" fill="var(--text)" />
      </g>

      {/* fixed phone pointer (top of phone) */}
      {pointer && (
        <g className="sk-pointer" aria-hidden="true">
          <path d={`M ${C} 2 L ${C - 9} 20 L ${C + 9} 20 Z`} fill="var(--accent)" />
          <line x1={C} y1={22} x2={C} y2={C - 8} stroke="var(--accent)" strokeWidth="2" strokeDasharray="4 5" opacity="0.8" />
        </g>
      )}
    </svg>
  );
}

function Marker({ m, rot }) {
  const below = m.alt < 0;
  const r = altRadius(m.alt);
  const p = polar(C, C, r, m.az);
  const size = m.big ? 30 : below ? 18 : 24;
  return (
    <g className={`sk-marker${below ? ' is-below' : ''}${m.big ? ' is-reveal' : ''}`}>
      <circle cx={p.x} cy={p.y} r={size * 0.72} fill={m.color || 'rgba(255,209,102,0.25)'} opacity={below ? 0.35 : 0.9}
        stroke={below ? 'rgba(255,255,255,0.5)' : 'none'} strokeDasharray={below ? '3 3' : undefined} />
      <text x={p.x} y={p.y} fontSize={size} textAnchor="middle" dominantBaseline="central" transform={`rotate(${rot} ${p.x} ${p.y})`}
        opacity={below ? 0.55 : 1}>{m.emoji}</text>
      {m.label && <title>{m.label}</title>}
    </g>
  );
}
