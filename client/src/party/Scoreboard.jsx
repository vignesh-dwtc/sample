import { Avatar } from './common.jsx';

/** Live ranking. Rows slide when the order changes (CSS transform by rank). */
export default function Scoreboard({ room, me, gained = {}, compact = false }) {
  const ranked = [...room.players].sort((a, b) => b.score - a.score);
  const rankOf = new Map(ranked.map((p, i) => [p.id, i]));
  const ROW = compact ? 44 : 52;
  return (
    <section className={`card pt-board${compact ? ' is-compact' : ''}`} aria-label="Scoreboard">
      <h3 className="pt-board-title">Scoreboard</h3>
      <ol className="pt-board-list" style={{ height: room.players.length * ROW }}>
        {room.players.map((p) => {
          const r = rankOf.get(p.id);
          const g = gained[p.id];
          return (
            <li
              key={p.id}
              className={`pt-board-row${p.id === me ? ' is-me' : ''}${p.connected ? '' : ' is-away'}`}
              style={{ transform: `translateY(${r * ROW}px)`, height: ROW - 6 }}
              aria-label={`${r + 1}. ${p.username}, ${p.score} points`}
            >
              <span className={`pt-rank pt-rank-${r + 1}`}>{r + 1}</span>
              <Avatar player={p} size="sm" />
              <span className="pt-board-name">{p.username}</span>
              {g ? <span key={`${p.id}-${p.score}`} className={`pt-gain${g < 0 ? ' neg' : ''}`}>{g > 0 ? '+' : ''}{g}</span> : null}
              <span className="pt-board-score mono">{p.score.toLocaleString()}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
