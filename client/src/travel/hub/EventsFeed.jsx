import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { formatKm, formatTime } from '../geo.js';
import { challengeFor, countdownText } from './hubLogic.js';
import { useNow } from './useHubData.js';

const BIG = new Set(['sunrise', 'sunset', 'golden', 'moonrise', 'milestone', 'halfway', 'arrive']);

/** Pick one gentle challenge prompt for the top of the feed. */
function pickChallenge(events, now, kmh) {
  const soon = events.find((e) => e.at && challengeFor(e.kind) && e.at - now < 90 * 60000 && e.at - now > -60000);
  if (soon) {
    const c = challengeFor(soon.kind);
    const mins = Math.max(0, Math.round((soon.at - now) / 60000));
    return { ...c, icon: soon.icon, lead: `${soon.title} ${mins ? `in ${mins} min` : 'now'}` };
  }
  if (kmh != null && kmh > 15) return { to: '/travel/bingo', game: 'Window Bingo', icon: '🎯', lead: `Rolling at ${Math.round(kmh)} km/h`, text: 'Grab a bingo card and watch the window' };
  const h = now.getHours();
  if (h >= 19 || h < 5) return { to: '/travel/sky', game: 'Sky Compass', icon: '🌙', lead: 'Night sky time', text: 'Can you find the moon without looking it up?' };
  return { to: '/travel/quiz', game: 'Guess Where?', icon: '❓', lead: 'Feeling clever?', text: 'Test yourself on the places around you' };
}

export default function EventsFeed({ events, log, kmh, notifyState, onToggleNotify, onNotify }) {
  const now = useNow(1000);
  const seen = useRef(new Map());
  const fired = useRef(new Set());

  // Remember every upcoming event; when its moment arrives (while the page is open) send an alert once.
  useEffect(() => {
    for (const e of events) if (e.at) seen.current.set(e.key, e);
    for (const [key, e] of seen.current) {
      if (e.at > now) continue;
      seen.current.delete(key);
      if (now - e.at < 10 * 60000 && BIG.has(e.kind) && !fired.current.has(key)) {
        fired.current.add(key);
        onNotify?.(e);
      }
    }
  }, [events, now, onNotify]);

  const live = events.filter((e) => !e.at || e.at - now > -2 * 60000).slice(0, 7);
  const challenge = pickChallenge(events, now, kmh);

  return (
    <section className="card tvh-events" aria-labelledby="tv-events-h">
      <div className="spread">
        <h2 id="tv-events-h"><span className="tvh-live-dot" aria-hidden="true" /> Live events</h2>
        {notifyState !== 'unsupported' && (
          <button type="button" className={`btn small ${notifyState === 'on' ? 'accent' : 'secondary'}`} onClick={onToggleNotify}
            aria-pressed={notifyState === 'on'} disabled={notifyState === 'denied'}
            title={notifyState === 'denied' ? 'Notifications are blocked in your browser settings' : 'Alerts work while this page is open'}>
            {notifyState === 'on' ? '🔔 Alerts on' : notifyState === 'denied' ? '🔕 Blocked' : '🔔 Alert me'}
          </button>
        )}
      </div>

      <Link to={challenge.to} className="tvh-challenge">
        <span className="tvh-challenge-icon" aria-hidden="true">{challenge.icon}</span>
        <span className="tvh-challenge-text">
          <span className="tvh-eyebrow">Travel challenge</span>
          <strong>{challenge.lead}</strong>
          <span className="small muted">{challenge.text} — try <b>{challenge.game}</b></span>
        </span>
        <span aria-hidden="true" className="tvh-game-go">›</span>
      </Link>

      {live.length === 0 ? (
        <p className="muted small">Turn on location to see sunrise, sunset and moon times for where you are.</p>
      ) : (
        <ol className="tvh-feed">
          {live.map((e, i) => {
            const ms = e.at ? e.at - now : null;
            const c = challengeFor(e.kind);
            const happening = ms != null && ms <= 0;
            return (
              <li key={e.key} className={`tvh-ev${i === 0 ? ' is-next' : ''}${happening ? ' is-now' : ''}`}>
                <span className="tvh-ev-icon" aria-hidden="true">{e.icon}</span>
                <span className="tvh-ev-main">
                  <span className="tvh-ev-title">{e.title}</span>
                  <span className="small muted">
                    {e.at ? `${e.source === 'trip' ? '≈ ' : ''}${formatTime(e.at)}` : 'waiting for you to move'}
                    {e.distance != null && ` · ${formatKm(Math.max(0, e.distance))} to go`}
                    {c && i < 3 && <> · <Link to={c.to} className="tvh-ev-link">{c.game}</Link></>}
                  </span>
                </span>
                <span className="tvh-ev-count mono" aria-label={happening ? 'Happening now' : ms != null ? `in ${countdownText(ms)}` : 'no estimate yet'}>
                  {happening ? 'Now!' : ms != null ? countdownText(ms) : formatKm(Math.max(0, e.distance ?? 0))}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {log?.length > 0 && (
        <details className="tvh-log">
          <summary>Earlier on this trip ({log.length})</summary>
          <ul>
            {[...log].reverse().map((l) => (
              <li key={l.key}><span aria-hidden="true">{l.icon}</span> {l.title} <span className="muted small">· {formatTime(l.at)}</span></li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
