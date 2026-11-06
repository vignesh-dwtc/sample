import { useEffect, useRef } from 'react';
import { Avatar } from './common.jsx';

/** Full-width tap zone: red while waiting, green on go. Space / Enter taps too. */
export default function Reaction({ room, me, reaction, send }) {
  const state = reaction?.state || 'ready';
  const tapped = reaction?.tapped;
  const zoneRef = useRef(null);

  const tap = () => {
    if (state !== 'wait' && state !== 'go') return;
    if (tapped) return;
    send({ type: 'tap' });
    navigator.vibrate?.(20);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.code !== 'Space' && e.key !== 'Enter') return;
      if (e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|BUTTON|A)$/.test(e.target.tagName) && e.target !== zoneRef.current) return;
      e.preventDefault();
      if (!e.repeat) tap();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const byId = new Map(room.players.map((p) => [p.id, p]));
  let zoneCls = 'pt-zone';
  let big = 'Get ready…';
  let sub = 'Wait for green, then tap as fast as you can';
  if (state === 'wait') {
    zoneCls += tapped?.falseStart ? ' is-foul' : ' is-wait';
    big = tapped?.falseStart ? 'Too soon!' : 'Wait for it…';
    sub = tapped?.falseStart ? '−250 · you sit this round out' : 'Don’t tap until it turns green';
  } else if (state === 'go') {
    if (tapped && !tapped.falseStart) {
      zoneCls += ' is-done';
      big = `${tapped.ms} ms`;
      sub = tapped.order === 1 ? 'First! Waiting for the others…' : `#${tapped.order} — waiting for the others…`;
    } else if (tapped?.falseStart) {
      zoneCls += ' is-foul'; big = 'Too soon!'; sub = '−250 · you sit this round out';
    } else {
      zoneCls += ' is-go'; big = 'TAP!'; sub = 'Now now now!';
    }
  } else if (state === 'ended') {
    zoneCls += ' is-ended';
    const mine = reaction.results?.find((r) => r.id === me);
    big = mine?.falseStart ? 'Too soon!' : mine?.ms != null ? `${mine.ms} ms` : 'No tap';
    if (mine && mine.points > 0) big += reaction.results.indexOf(mine) === 0 ? ' 🏆' : '';
    sub = `Round ${reaction.round} done · ${reaction.round < room.totalRounds ? 'next round in a moment…' : 'final scores coming up…'}`;
  }

  return (
    <section className="pt-reaction" aria-label={`Reaction round ${reaction?.round || 1} of ${room.totalRounds}`}>
      <div className="spread pt-q-meta">
        <span className="badge">Round {Math.max(1, reaction?.round || room.round || 1)}/{room.totalRounds}</span>
        <span className="small muted">Space / Enter / tap</span>
      </div>
      <button
        ref={zoneRef}
        type="button"
        className={zoneCls}
        onPointerDown={(e) => { e.preventDefault(); tap(); }}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.code === 'Space') e.preventDefault(); }}
        aria-live="assertive"
      >
        <span key={`${state}-${reaction?.round}-${tapped ? 1 : 0}`} className="pt-zone-big pop">{big}</span>
        <span className="pt-zone-sub">{sub}</span>
      </button>

      {state === 'ended' && reaction.results && (
        <ol className="card pt-results-list pop" aria-label="Round results">
          {reaction.results.map((r, i) => {
            const p = byId.get(r.id);
            if (!p) return null;
            return (
              <li key={r.id} className={r.id === me ? 'is-me' : ''}>
                <span className="pt-rank">{r.ms != null ? i + 1 : '–'}</span>
                <Avatar player={p} size="sm" />
                <span className="pt-board-name">{p.username}</span>
                <span className="mono small muted">{r.falseStart ? 'false start' : r.ms != null ? `${r.ms} ms` : 'no tap'}</span>
                <span className={`pt-gain${r.points < 0 ? ' neg' : ''}`}>{r.points > 0 ? '+' : ''}{r.points}</span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
