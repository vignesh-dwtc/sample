import { useEffect, useState } from 'react';
import { msUntilUtcMidnight, tickCountdown } from './coreLogic.js';

/**
 * Ticks every second with the ms left until the next UTC midnight.
 * `rolled` counts how many times the day rolled over while the page is open (so callers can refresh).
 */
export function useUtcMidnightCountdown() {
  const [state, setState] = useState(() => ({ ms: msUntilUtcMidnight(), rolled: 0 }));
  useEffect(() => {
    const id = setInterval(() => {
      // Count rollovers so callers re-fetch on every new day, not just the first.
      setState((prev) => tickCountdown(prev, msUntilUtcMidnight()));
    }, 1000);
    return () => clearInterval(id);
  }, []);
  return state;
}
