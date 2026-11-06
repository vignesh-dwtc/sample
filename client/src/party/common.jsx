import { useEffect, useState } from 'react';

export const GAME_INFO = {
  trivia: {
    name: 'Trivia Blitz',
    icon: '🧠',
    tagline: '8 rapid-fire questions. Right answers score 500, speed adds up to 500 more.',
    rules: ['12 seconds per question', 'First answer locks in', 'Faster = more points'],
  },
  reaction: {
    name: 'Reaction Duel',
    icon: '🚦',
    tagline: '5 rounds of nerve. Wait for green, then tap faster than everyone else.',
    rules: ['Tap or press Space on green', 'First tap wins 1000', 'Jump early: −250'],
  },
};

/** Re-render every `ms` while `active`. Returns Date.now(). */
export function useTicker(active, ms = 100) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [active, ms]);
  return now;
}

const STATUS = {
  open: { label: 'Live', cls: 'ok' },
  connecting: { label: 'Connecting…', cls: 'wait' },
  reconnecting: { label: 'Reconnecting…', cls: 'wait' },
  offline: { label: 'Offline', cls: 'bad' },
  replaced: { label: 'Open in another tab', cls: 'bad' },
};

export function StatusPill({ status }) {
  const s = STATUS[status] || STATUS.connecting;
  return (
    <span className={`pt-status pt-status-${s.cls}`} role="status" aria-live="polite">
      <span className="pt-dot" aria-hidden="true" />
      {s.label}
    </span>
  );
}

export function Avatar({ player, size = 'md' }) {
  return (
    <span className={`pt-avatar pt-avatar-${size}${player.connected === false ? ' is-away' : ''}`} aria-hidden="true">
      {player.avatar || '🙂'}
    </span>
  );
}

/** A bar that shrinks from the remaining fraction to 0 over the remaining time (pure CSS animation). */
export function CountdownBar({ endsAt, duration, serverNow, paused, k }) {
  const remaining = Math.max(0, endsAt - serverNow());
  const frac = Math.min(1, remaining / duration);
  return (
    <div className={`pt-timebar${paused ? ' is-paused' : ''}${frac < 0.25 ? ' is-low' : ''}`} aria-hidden="true">
      <span
        key={k}
        style={{ '--from': frac, animationDuration: `${remaining}ms`, animationPlayState: paused ? 'paused' : 'running' }}
      />
    </div>
  );
}
