import { useId } from 'react';

/** PlayNest mark: a play button resting in a nest, with a little spark. Mirrors public/icon.svg. */
export function LogoMark({ size = 32, className = '' }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 512 512" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`pn-g-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8b6bff" />
          <stop offset="1" stopColor="#1fc9a0" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="128" fill={`url(#pn-g-${id})`} />
      <path d="M218 104c-14-8-30 2-30 18v150c0 16 16 26 30 18l128-75c14-8 14-28 0-36z" fill="#fff" />
      <path d="M112 300c28 108 260 108 288 0" fill="none" stroke="#fff" strokeWidth="30" strokeLinecap="round" />
      <path d="M162 344h188" fill="none" stroke="#fff" strokeOpacity=".55" strokeWidth="18" strokeLinecap="round" />
      <circle cx="380" cy="128" r="26" fill="#ffd166" />
    </svg>
  );
}

export default function Logo({ size = 32 }) {
  return (
    <span className="pn-logo">
      <LogoMark size={size} />
      <span className="pn-logo-text">Play<span>Nest</span></span>
    </span>
  );
}
