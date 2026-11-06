import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useSession } from '../lib/session.jsx';
import { useUtcMidnightCountdown } from '../components/useCountdown.js';
import {
  DAILIES, achievementTeaser, dailiesDone, formatHms, formatNumber, greeting, levelPercent,
  medal, nextAction, normalizeRoomCode, streakStatus,
} from '../components/coreLogic.js';
import './Home.css';

const STATUS_LABEL = { new: 'New', in_progress: 'In progress', done: 'Done' };

function HomeSkeleton({ slow, onRetry }) {
  return (
    <div className="container hm-page" aria-busy="true">
      <div className="card hm-hero hm-skel" style={{ height: 220 }} />
      <div className="hm-dailies">
        {[0, 1, 2].map((i) => <div key={i} className="card hm-skel" style={{ height: 180 }} />)}
      </div>
      {slow && (
        <div className="alert error hm-slow" role="alert">
          <span>We’re having trouble reaching PlayNest.</span>
          <button type="button" className="btn small secondary" onClick={onRetry}>Try again</button>
        </div>
      )}
    </div>
  );
}

function Hero({ profile, countdown }) {
  const { user, level, levelXp, streak } = profile;
  const st = streakStatus(streak);
  const next = nextAction(profile.daily);
  const pct = levelPercent(levelXp);
  const name = user.username;

  const cta = next.kind === 'resume' ? `Continue ${next.name}`
    : next.kind === 'start' ? `Play ${next.name}`
    : 'Play Reflex';
  const ctaSub = next.kind === 'resume' ? 'Pick up where you left off'
    : next.kind === 'start' ? (st.state === 'at_risk' ? 'Saves your streak' : "Today's puzzle is waiting")
    : 'All dailies done — chase a high score';

  return (
    <section className="card hm-hero pop" aria-labelledby="hm-greet">
      <div className="hm-hero-glow" aria-hidden="true" />
      <div className="hm-hero-top">
        <div className="hm-avatar" aria-hidden="true">{user.avatar}</div>
        <div className="hm-hero-text">
          <p className="muted hm-eyebrow">{greeting(new Date().getHours())},</p>
          <h1 id="hm-greet" className="hm-name">{name}</h1>
        </div>
      </div>

      <div className="hm-hero-stats">
        <div className={`hm-streak is-${st.state}`}>
          <span className="hm-streak-flame" aria-hidden="true">🔥</span>
          <span className="hm-streak-num">{st.current}</span>
          <span className="hm-streak-label">day streak</span>
        </div>
        <div className="hm-level">
          <div className="spread small">
            <strong>Level {level}</strong>
            <span className="muted mono">{formatNumber(levelXp.current)} / {formatNumber(levelXp.needed)} XP</span>
          </div>
          <div className="progress" role="progressbar" aria-label={`Level ${level} progress`}
            aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
            <span style={{ width: `${pct}%` }} />
          </div>
          <div className="small muted">{formatNumber(levelXp.needed - levelXp.current)} XP to level {level + 1} · 🪙 {formatNumber(user.coins)}</div>
        </div>
      </div>

      {st.state === 'at_risk' && (
        <div className="hm-banner is-risk" role="status">
          <span className="hm-banner-icon" aria-hidden="true">⏳</span>
          <span>
            <strong>Your {st.current}-day streak is at risk!</strong>{' '}
            Play any daily puzzle in the next <span className="mono">{formatHms(countdown.ms)}</span> to keep it.
          </span>
        </div>
      )}
      {st.state === 'none' && (
        <div className="hm-banner" role="status">
          <span className="hm-banner-icon" aria-hidden="true">🌱</span>
          <span>Solve a daily puzzle to start a streak — bonus XP grows every day you keep it going.</span>
        </div>
      )}
      {st.state === 'safe' && (
        <div className="hm-banner is-safe" role="status">
          <span className="hm-banner-icon" aria-hidden="true">✅</span>
          <span>Streak safe for today. Come back tomorrow for day {st.current + 1}!</span>
        </div>
      )}

      <Link to={next.to} className="btn hm-cta">
        <span className="hm-cta-icon" aria-hidden="true">{next.icon}</span>
        <span className="hm-cta-text">
          <span>{cta}</span>
          <small>{ctaSub}</small>
        </span>
        <span aria-hidden="true" className="hm-cta-arrow">→</span>
      </Link>
    </section>
  );
}

function Dailies({ daily, countdown }) {
  const done = dailiesDone(daily);
  const next = nextAction(daily);
  return (
    <section aria-labelledby="hm-today">
      <div className="spread hm-section-head">
        <div>
          <h2 id="hm-today">Today’s puzzles</h2>
          <p className="muted small hm-sub">Same puzzles for everyone. {done}/3 done.</p>
        </div>
        <div className="hm-clock" title="Puzzles refresh at midnight UTC">
          <span className="muted small">New in</span>
          <span className="mono">{formatHms(countdown.ms)}</span>
        </div>
      </div>
      <div className="hm-dailies">
        {DAILIES.map((g, i) => {
          const s = daily?.[g.game] || 'new';
          const isNext = next.game === g.game;
          return (
            <Link key={g.game} to={g.to}
              className={`card interactive hm-daily hue-${g.hue} is-${s}${isNext ? ' is-next' : ''}`}
              style={{ animationDelay: `${80 + i * 70}ms` }}>
              <div className="spread">
                <span className="hm-daily-icon" aria-hidden="true">{g.icon}</span>
                <span className={`badge${s === 'done' ? ' done' : s === 'in_progress' ? ' gold' : ''}`}>
                  {s === 'done' ? '✓ ' : ''}{STATUS_LABEL[s]}
                </span>
              </div>
              <h3>{g.name}</h3>
              <p className="muted small">{g.blurb}</p>
              <span className="hm-daily-go">
                {s === 'done' ? 'See result' : s === 'in_progress' ? 'Continue' : 'Play now'} <span aria-hidden="true">→</span>
              </span>
            </Link>
          );
        })}
      </div>
      {done === 3 && (
        <div className="hm-sweep pop" role="status">🧹 Clean sweep! Every daily is done — new ones in {formatHms(countdown.ms)}.</div>
      )}
    </section>
  );
}

function MoreGames({ stats }) {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const reflexBest = stats?.find((s) => s.game === 'reflex')?.best;
  const join = (e) => {
    e.preventDefault();
    if (code.length === 4) navigate(`/party/${code}`);
  };
  return (
    <section aria-labelledby="hm-more">
      <h2 id="hm-more" className="hm-section-head">More ways to play</h2>
      <div className="hm-more">
        <Link to="/play/reflex" className="card interactive hm-game hm-reflex">
          <span className="badge">Arcade · unlimited</span>
          <div className="hm-game-icon" aria-hidden="true">⚡</div>
          <h3>Reflex</h3>
          <p className="muted small">60 seconds. Tap the targets before they vanish. Misses cost time.</p>
          <span className="hm-game-foot">
            {reflexBest != null ? <span className="badge gold">Best {reflexBest}</span> : <span className="muted small">No score yet</span>}
            <span className="hm-daily-go">Play <span aria-hidden="true">→</span></span>
          </span>
        </Link>

        <div className="card hm-game hm-party">
          <span className="badge live">● Multiplayer</span>
          <div className="hm-game-icon" aria-hidden="true">🎉</div>
          <h3>Party</h3>
          <p className="muted small">Trivia Blitz or Reaction Duel with up to 12 friends — just share a code.</p>
          <form className="hm-join" onSubmit={join} aria-label="Join a party room">
            <input
              className="input mono" value={code} placeholder="CODE"
              aria-label="Room code" autoComplete="off" autoCapitalize="characters" spellCheck="false"
              onChange={(e) => setCode(normalizeRoomCode(e.target.value))}
            />
            <button className="btn accent" disabled={code.length !== 4}>Join</button>
          </form>
          <div className="hm-host" role="group" aria-label="Host a room">
            <Link to="/party?create=trivia" className="btn secondary">🧠 Host Trivia</Link>
            <Link to="/party?create=reaction" className="btn secondary">⚡ Host Reaction</Link>
          </div>
        </div>

        <Link to="/detective" className="card interactive hm-game hm-detective">
          <span className="badge">AI mystery</span>
          <div className="hm-game-icon" aria-hidden="true">🕵️</div>
          <h3>Detective</h3>
          <p className="muted small">Interrogate four suspects, catch the lie, and name the culprit.</p>
          <span className="hm-game-foot">
            <span className="muted small">15 questions per case</span>
            <span className="hm-daily-go">Investigate <span aria-hidden="true">→</span></span>
          </span>
        </Link>
      </div>
    </section>
  );
}

function MiniLeaderboard({ userId, xp }) {
  const [state, setState] = useState({ loading: true, rows: [], error: null });
  useEffect(() => {
    let alive = true;
    api('/leaderboard?game=xp&period=all')
      .then((d) => alive && setState({ loading: false, rows: d.rows.slice(0, 5), error: null }))
      .catch((e) => alive && setState({ loading: false, rows: [], error: e.message }));
    return () => { alive = false; };
  }, [userId, xp]);

  return (
    <section className="card hm-board" aria-labelledby="hm-board">
      <div className="spread">
        <h2 id="hm-board">Top players</h2>
        <Link to="/leaderboard" className="small">See all →</Link>
      </div>
      {state.loading && <div className="hm-board-list">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="hm-skel hm-board-skel" />)}</div>}
      {state.error && <p className="muted small">Couldn’t load the leaderboard.</p>}
      {!state.loading && !state.error && (
        state.rows.length ? (
          <ol className="hm-board-list">
            {state.rows.map((r) => (
              <li key={r.id} className={`hm-board-row${r.id === userId ? ' is-me' : ''}`}>
                <span className="hm-board-rank">{medal(r.rank) || r.rank}</span>
                <span className="hm-board-avatar" aria-hidden="true">{r.avatar}</span>
                <span className="hm-board-name">{r.username}{r.id === userId && <span className="muted"> (you)</span>}</span>
                <span className="mono hm-board-score">{formatNumber(r.score, true)}</span>
              </li>
            ))}
          </ol>
        ) : <p className="muted small">No players yet — be the first!</p>
      )}
    </section>
  );
}

function AchievementTeaser({ achievements }) {
  const { unlocked, total, next } = achievementTeaser(achievements, 3);
  const pct = total ? (unlocked / total) * 100 : 0;
  return (
    <section className="card hm-ach" aria-labelledby="hm-ach">
      <div className="spread">
        <h2 id="hm-ach">Achievements</h2>
        <Link to="/profile" className="small">View all →</Link>
      </div>
      <div className="spread small"><span className="muted">{unlocked} of {total} unlocked</span><span className="mono muted">{Math.round(pct)}%</span></div>
      <div className="progress" aria-hidden="true"><span style={{ width: `${pct}%` }} /></div>
      {next.length ? (
        <ul className="hm-ach-list">
          {next.map((a) => (
            <li key={a.code} className="hm-ach-item">
              <span className="hm-ach-icon" aria-hidden="true">{a.icon}</span>
              <span><strong>{a.title}</strong><span className="muted small">{a.desc}</span></span>
              <span className="hm-ach-lock" aria-label="Locked">🔒</span>
            </li>
          ))}
        </ul>
      ) : <p className="hm-ach-all">🏆 You’ve unlocked everything. Legendary.</p>}
    </section>
  );
}

export default function Home() {
  const { profile, refresh } = useSession() || {};
  const countdown = useUtcMidnightCountdown();
  const [slow, setSlow] = useState(false);

  // Day rolled over while the page was open → fetch the new daily statuses.
  useEffect(() => { if (countdown.rolled) refresh?.().catch(() => {}); }, [countdown.rolled, refresh]);

  // Profile is refreshed on mount too, so statuses are fresh after finishing a game.
  useEffect(() => { if (profile) refresh?.().catch(() => {}); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (profile) return undefined;
    const t = setTimeout(() => setSlow(true), 6000);
    return () => clearTimeout(t);
  }, [profile]);

  if (!profile) {
    return <HomeSkeleton slow={slow} onRetry={() => (refresh ? refresh().catch(() => location.reload()) : location.reload())} />;
  }

  const isGuest = profile.user.is_guest;
  const plays = (profile.stats || []).reduce((n, s) => n + s.plays, 0);

  return (
    <div className="container hm-page">
      <Hero profile={profile} countdown={countdown} />
      <Dailies daily={profile.daily} countdown={countdown} />
      {isGuest && (
        <div className="hm-nudge" role="note">
          <span className="hm-nudge-icon" aria-hidden="true">🔐</span>
          <span className="hm-nudge-text">
            <strong>Claim your account to save progress across devices.</strong>
            <span className="muted small">{plays ? `Keep your ${formatNumber(profile.user.xp)} XP and ${profile.streak.current}-day streak safe.` : 'It takes 20 seconds and unlocks an achievement.'}</span>
          </span>
          <Link to="/profile#account" className="btn small secondary">Claim</Link>
        </div>
      )}
      <MoreGames stats={profile.stats} />
      <div className="hm-bottom">
        <MiniLeaderboard userId={profile.user.id} xp={profile.user.xp} />
        <AchievementTeaser achievements={profile.achievements} />
      </div>
    </div>
  );
}
