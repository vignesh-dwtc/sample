import { useMemo } from 'react';
import { Avatar, GAME_INFO } from './common.jsx';

const CONFETTI_COLORS = ['var(--primary-2)', 'var(--accent)', 'var(--gold)', 'var(--danger)', 'var(--warn)'];

/** Final podium + full standings + play again. */
export default function Results({ room, me, standings, isHost, progress, send, onLeave }) {
  const list = standings || [...room.players].sort((a, b) => b.score - a.score).map((p, i) => ({ ...p, rank: i + 1 }));
  const top = list.slice(0, 3);
  const podium = [top[1], top[0], top[2]]; // 2nd, 1st, 3rd
  const mine = list.find((s) => s.id === me);
  const iWon = mine && mine.rank === 1 && mine.score > 0;
  const confetti = useMemo(() => Array.from({ length: 28 }, (_, i) => ({
    left: `${(i * 37) % 100}%`, delay: `${(i % 7) * 0.12}s`, dur: `${2.2 + (i % 5) * 0.35}s`,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length], rot: `${(i * 47) % 360}deg`,
  })), []);

  return (
    <section className="pt-results" aria-label="Final results">
      {iWon && (
        <div className="pt-confetti" aria-hidden="true">
          {confetti.map((c, i) => (
            <i key={i} style={{ left: c.left, animationDelay: c.delay, animationDuration: c.dur, background: c.color, '--rot': c.rot }} />
          ))}
        </div>
      )}
      <header className="center pt-results-head pop">
        <div className="small muted">{GAME_INFO[room.game].name} · final</div>
        <h2>{iWon ? 'You win! 👑' : mine ? `You placed #${mine.rank}` : 'Final standings'}</h2>
        {progress && (
          <div className="pt-xp pop">
            <span className="badge gold">+{progress.xpGained} XP</span>
            {progress.coinsGained ? <span className="badge">+{progress.coinsGained} coins</span> : null}
            {progress.levelUp && <span className="badge done">Level {progress.level}!</span>}
          </div>
        )}
      </header>

      <div className="pt-podium" role="list">
        {podium.map((s, i) => s ? (
          <div key={s.id} role="listitem" className={`pt-step pt-step-${s.rank <= 3 ? s.rank : 3} ${s.id === me ? 'is-me' : ''}`}
            style={{ animationDelay: `${[0.25, 0.5, 0][i]}s` }}>
            <div className="pt-step-who">
              {s.rank === 1 && <span className="pt-crown" aria-hidden="true">👑</span>}
              <Avatar player={s} size="lg" />
              <span className="pt-step-name">{s.username}</span>
              <span className="mono small">{s.score.toLocaleString()}</span>
            </div>
            <div className="pt-step-block"><span>{s.rank}</span></div>
          </div>
        ) : <div key={`empty-${i}`} className="pt-step is-empty" aria-hidden="true" />)}
      </div>

      {list.length > 3 && (
        <ol className="card pt-results-list" start={4}>
          {list.slice(3).map((s) => (
            <li key={s.id} className={s.id === me ? 'is-me' : ''}>
              <span className="pt-rank">{s.rank}</span>
              <Avatar player={s} size="sm" />
              <span className="pt-board-name">{s.username}</span>
              <span className="mono">{s.score.toLocaleString()}</span>
            </li>
          ))}
        </ol>
      )}

      <div className="pt-results-actions">
        {isHost ? (
          <button className="btn accent" onClick={() => send({ type: 'again' })} autoFocus>↻ Play again</button>
        ) : (
          <div className="pt-waiting small muted"><span className="pt-dots" aria-hidden="true"><i /><i /><i /></span>Waiting for the host to start another round</div>
        )}
        <button className="btn secondary" onClick={onLeave}>Leave room</button>
      </div>
    </section>
  );
}
