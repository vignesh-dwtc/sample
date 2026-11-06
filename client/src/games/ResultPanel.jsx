import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../lib/session.jsx';
import { shareResult } from './share.js';
import { useNextPuzzleCountdown } from './countdown.js';
import './games.css';

export const DAILY_LINKS = [
  { game: 'lexicon', name: 'Lexicon', icon: '🔤', to: '/play/lexicon', blurb: 'Guess the word' },
  { game: 'target', name: 'Target', icon: '🎯', to: '/play/target', blurb: 'Hit the number' },
  { game: 'flip', name: 'Flip', icon: '💡', to: '/play/flip', blurb: 'Lights out' },
  { game: 'reflex', name: 'Reflex', icon: '⚡', to: '/play/reflex', blurb: '60s arcade' },
];

/** "Next puzzle in hh:mm:ss" (UTC midnight). */
export function NextPuzzleCountdown({ label = 'Next puzzle in' }) {
  const { label: time, ready } = useNextPuzzleCountdown();
  if (ready) {
    return (
      <div className="gm-countdown">
        <span className="muted small">A new puzzle is ready</span>
        <button type="button" className="btn small" onClick={() => location.reload()}>Play it</button>
      </div>
    );
  }
  return (
    <div className="gm-countdown" aria-live="off">
      <span className="muted small">{label}</span>
      <span className="gm-countdown-time mono">{time}</span>
    </div>
  );
}

/** Links to the other games with today's status (from profile.daily). */
export function NextPuzzleLinks({ current }) {
  const { profile } = useSession() || {};
  const status = profile?.daily || {};
  const links = DAILY_LINKS.filter((l) => l.game !== current);
  return (
    <nav className="gm-next" aria-label="More games">
      {links.map((l) => {
        const s = status[l.game];
        return (
          <Link key={l.game} to={l.to} className={`gm-next-link${s === 'done' ? ' is-done' : ''}`}>
            <span className="gm-next-icon" aria-hidden="true">{l.icon}</span>
            <span className="gm-next-text">
              <strong>{l.name}</strong>
              <span className="muted small">{s === 'done' ? 'Done ✓' : s === 'in_progress' ? 'In progress' : l.blurb}</span>
            </span>
            <span className="gm-next-arrow" aria-hidden="true">→</span>
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Shared end-of-game panel.
 * @param {object} p
 * @param {string} p.game       current game key (hidden from "next" links)
 * @param {string} p.emoji      big header emoji
 * @param {string} p.title      e.g. "Solved!" / "So close"
 * @param {React.ReactNode} [p.subtitle]
 * @param {Array<{label:string,value:React.ReactNode}>} [p.stats]
 * @param {object} [p.progress] server progress object (xpGained, streak…)
 * @param {string} [p.shareText]
 * @param {boolean} [p.countdown=true] show the next-puzzle countdown
 * @param {React.ReactNode} [p.children] extra content (e.g. the answer, a play-again button)
 */
export default function ResultPanel({ game, emoji, title, subtitle, stats = [], progress, shareText, countdown = true, children }) {
  const { toast } = useSession() || {};
  const [shared, setShared] = useState(false);
  const onShare = async () => {
    const r = await shareResult(shareText, toast);
    if (r === 'shared' || r === 'copied') {
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    }
  };
  return (
    <section className="card gm-result" aria-labelledby="gm-result-title">
      <div className="gm-result-head">
        <div className="gm-result-emoji" aria-hidden="true">{emoji}</div>
        <div>
          <h2 id="gm-result-title" className="gm-result-title">{title}</h2>
          {subtitle && <div className="muted">{subtitle}</div>}
        </div>
      </div>

      {(stats.length > 0 || progress) && (
        <dl className="gm-stats">
          {stats.map((s) => (
            <div key={s.label} className="gm-stat">
              <dt>{s.label}</dt>
              <dd>{s.value}</dd>
            </div>
          ))}
          {progress && (
            <div className="gm-stat gm-stat-xp">
              <dt>XP</dt>
              <dd>+{progress.xpGained}</dd>
            </div>
          )}
          {progress?.streak?.current > 0 && (
            <div className="gm-stat">
              <dt>Streak</dt>
              <dd>🔥 {progress.streak.current}</dd>
            </div>
          )}
        </dl>
      )}

      {children}

      <div className="gm-result-actions">
        {shareText && (
          <button type="button" className="btn accent" onClick={onShare}>
            {shared ? 'Copied ✓' : 'Share result'}
          </button>
        )}
      </div>

      {countdown && <NextPuzzleCountdown />}
      <NextPuzzleLinks current={game} />
    </section>
  );
}

/** Centered loading / error states used by every daily page. */
export function GameStatus({ loading, error, onRetry }) {
  if (error) {
    return (
      <div className="alert error gm-status" role="alert">
        <span>{error}</span>
        {onRetry && <button type="button" className="btn small secondary" onClick={onRetry}>Try again</button>}
      </div>
    );
  }
  if (loading) {
    return (
      <div className="gm-status gm-loading" aria-busy="true" aria-live="polite">
        <span className="gm-spinner" aria-hidden="true" /> <span className="muted">Loading today's puzzle…</span>
      </div>
    );
  }
  return null;
}

/** Page header with title, date and a "how to play" toggle. */
export function GameHeader({ icon, title, date, children, help }) {
  const [open, setOpen] = useState(false);
  return (
    <header className="gm-header">
      <div className="gm-header-row">
        <h1 className="gm-title"><span aria-hidden="true">{icon}</span> {title}</h1>
        {help && (
          <button type="button" className="btn small ghost gm-help-btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? 'Close' : 'How to play'}
          </button>
        )}
      </div>
      <div className="gm-header-meta muted small">
        {date && <span className="mono">{date}</span>}
        {children}
      </div>
      {help && open && <div className="gm-help card pop">{help}</div>}
    </header>
  );
}
