import { useId } from 'react';
import { moonLitPath } from './skyLogic.js';

/** Moon phase drawn as SVG from illumination (0–1) and waxing/waning. */
export default function MoonDisc({ fraction, waxing, size = 72, label }) {
  const id = useId().replace(/:/g, '');
  const lit = moonLitPath(fraction, waxing, 46, 50, 50);
  return (
    <svg className="sk-moon-disc" width={size} height={size} viewBox="0 0 100 100" role="img"
      aria-label={label || `Moon ${Math.round(fraction * 100)}% lit, ${waxing ? 'waxing' : 'waning'}`}>
      <defs>
        <radialGradient id={`lit-${id}`} cx="45%" cy="40%" r="65%">
          <stop offset="0%" stopColor="#fffbe8" />
          <stop offset="70%" stopColor="#f1e6c4" />
          <stop offset="100%" stopColor="#cdbf98" />
        </radialGradient>
        <radialGradient id={`glow-${id}`} cx="50%" cy="50%" r="50%">
          <stop offset="70%" stopColor="rgba(255,240,200,0.18)" />
          <stop offset="100%" stopColor="rgba(255,240,200,0)" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="50" fill={`url(#glow-${id})`} opacity={0.4 + fraction * 0.6} />
      <circle cx="50" cy="50" r="46" fill="#2a2d52" stroke="#3d4278" strokeWidth="1" />
      {lit && <path d={lit} fill={`url(#lit-${id})`} />}
      {/* a few soft craters, clipped to the lit area by low opacity */}
      <g fill="#000" opacity={0.07 * Math.min(1, fraction * 3)}>
        <circle cx="38" cy="36" r="7" /><circle cx="60" cy="58" r="9" /><circle cx="44" cy="66" r="5" /><circle cx="66" cy="34" r="4" />
      </g>
    </svg>
  );
}
