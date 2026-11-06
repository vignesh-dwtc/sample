// Clock abstraction so the room engine can run on real timers in production
// and on a deterministic, manually-advanced clock in tests.

export const realClock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h),
};

/** A fake clock: timers only fire when advance() is called. */
export function createFakeClock(start = 1_000_000) {
  let now = start;
  let seq = 0;
  const timers = new Map(); // id -> { at, fn, seq }
  return {
    now: () => now,
    setTimeout(fn, ms) {
      const id = ++seq;
      timers.set(id, { at: now + Math.max(0, ms), fn, seq: id });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
    /** Advance time by ms, firing due timers in chronological order. */
    advance(ms) {
      const end = now + ms;
      for (;;) {
        let next = null;
        for (const [id, t] of timers) {
          if (t.at <= end && (!next || t.at < next.t.at || (t.at === next.t.at && t.seq < next.t.seq))) next = { id, t };
        }
        if (!next) break;
        timers.delete(next.id);
        now = next.t.at;
        next.t.fn();
      }
      now = end;
    },
    pending: () => timers.size,
  };
}
