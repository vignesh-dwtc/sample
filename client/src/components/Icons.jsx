// Small stroke icons for navigation (24×24, currentColor).
const base = {
  width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, focusable: 'false',
};

export const IconPlay = (p) => (
  <svg {...base} {...p}>
    <rect x="2.5" y="6.5" width="19" height="12" rx="6" />
    <path d="M7.5 10.5v4M5.5 12.5h4" />
    <circle cx="15.5" cy="11.5" r=".6" fill="currentColor" />
    <circle cx="17.5" cy="13.5" r=".6" fill="currentColor" />
  </svg>
);

export const IconParty = (p) => (
  <svg {...base} {...p}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5" />
    <path d="M16 4.8a3.3 3.3 0 0 1 0 6.4M18 14.8c2 .7 3.2 2.4 3.5 5.2" />
  </svg>
);

export const IconDetective = (p) => (
  <svg {...base} {...p}>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="M15.5 15.5 21 21" />
    <path d="M8 9.5a3 3 0 0 1 3-2.5" />
  </svg>
);

export const IconTrophy = (p) => (
  <svg {...base} {...p}>
    <path d="M7 4h10v5a5 5 0 0 1-10 0z" />
    <path d="M7 6H4.5a2.5 2.5 0 0 0 2.6 3.4M17 6h2.5a2.5 2.5 0 0 1-2.6 3.4" />
    <path d="M12 14v3.5M8.5 20.5h7M9.5 20.5c0-1.7 1.1-3 2.5-3s2.5 1.3 2.5 3" />
  </svg>
);

export const IconUser = (p) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="8.5" r="4" />
    <path d="M4 20.5c1-4 4.2-6 8-6s7 2 8 6" />
  </svg>
);

export const IconClose = (p) => (
  <svg {...base} width={16} height={16} {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

export const IconTravel = (p) => (
  <svg {...base} {...p}>
    <rect x="5" y="7" width="14" height="13" rx="2.5" />
    <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    <path d="M9 11v5M15 11v5" />
  </svg>
);

export const IconArcade = (p) => (
  <svg {...base} {...p}>
    <path d="M12 13.5V8" />
    <circle cx="12" cy="5.5" r="2.5" />
    <path d="M4.5 15.5 12 12l7.5 3.5L12 19z" />
    <path d="M4.5 15.5V17l7.5 3.5 7.5-3.5v-1.5" />
  </svg>
);

export const IconSoundOn = (p) => (
  <svg {...base} width={20} height={20} {...p}>
    <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" fillOpacity=".15" />
    <path className="pn-wave" d="M15.5 9a4 4 0 0 1 0 6" />
    <path className="pn-wave w2" d="M18 6.5a7.5 7.5 0 0 1 0 11" />
  </svg>
);

export const IconSoundOff = (p) => (
  <svg {...base} width={20} height={20} {...p}>
    <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" fillOpacity=".15" />
    <path d="M16 9.5l5 5M21 9.5l-5 5" />
  </svg>
);
