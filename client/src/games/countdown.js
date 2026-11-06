import { useEffect, useState } from 'react';

/** Milliseconds until the next UTC midnight (when every daily puzzle rolls over). */
export const msUntilUtcMidnight = (now = Date.now()) => {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) - now;
};

export const formatHms = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
};

/** Live countdown to the next UTC midnight: { ms, label, ready }. */
export function useNextPuzzleCountdown() {
  const [ms, setMs] = useState(() => msUntilUtcMidnight());
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const start = msUntilUtcMidnight();
    const id = setInterval(() => {
      const left = msUntilUtcMidnight();
      // Wrapped past midnight (left jumps back up to ~24h) → a new puzzle is out.
      if (left > start + 1000) setReady(true);
      setMs(left);
    }, 1000);
    return () => clearInterval(id);
  }, []);
  return { ms, label: formatHms(ms), ready };
}
