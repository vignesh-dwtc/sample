// Pure game rules for "Find the Sun / Moon".
export const HOLD_MS = 3000;   // hold steady this long to lock (compass mode)
export const ZONE_DEG = 15;    // "in the zone" when within this many degrees

/** Targets for each round, alternating sun/moon starting with `first`. */
export function roundTargets(first = 'sun', n = 3) {
  const other = first === 'sun' ? 'moon' : 'sun';
  return Array.from({ length: n }, (_, i) => (i % 2 === 0 ? first : other));
}
