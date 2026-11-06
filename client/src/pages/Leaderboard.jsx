import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useSession } from '../lib/session.jsx';
import {
  BOARD_GAMES, PERIODS, boardRows, formatNumber, isValidBoardGame, isValidPeriod, medal,
} from '../components/coreLogic.js';
import './Leaderboard.css';

const PLAY_LINK = {
  lexicon: '/play/lexicon', target: '/play/target', flip: '/play/flip', reflex: '/play/reflex',
  party: '/party', detective: '/detective', travel: '/travel', xp: '/',
};

function Row({ r, unit, pinned }) {
  return (
    <li className={`lb-row${r.me ? ' is-me' : ''}${pinned ? ' is-pinned' : ''}`} aria-current={r.me ? 'true' : undefined}>
      <span className="lb-rank">{medal(r.rank) || `#${r.rank}`}</span>
      <span className="lb-avatar" aria-hidden="true">{r.avatar}</span>
      <span className="lb-name">
        {r.username}
        {r.me && <span className="badge lb-you">You</span>}
      </span>
      <span className="lb-score mono">{formatNumber(r.score)} <span className="muted small">{unit}</span></span>
    </li>
  );
}

function Podium({ rows, unit }) {
  // Visual order: 2nd, 1st, 3rd.
  const order = [rows[1], rows[0], rows[2]].filter(Boolean);
  return (
    <ol className="lb-podium" aria-label="Top three">
      {order.map((r) => (
        <li key={r.id} className={`lb-pod lb-pod-${r.rank}${r.me ? ' is-me' : ''}`}>
          <span className="lb-pod-medal" aria-hidden="true">{medal(r.rank)}</span>
          <span className="lb-pod-avatar" aria-hidden="true">{r.avatar}</span>
          <span className="lb-pod-name">{r.username}{r.me && ' (you)'}</span>
          <span className="lb-pod-score mono">{formatNumber(r.score, true)} <span className="muted small">{unit}</span></span>
          <span className="lb-pod-step"><span className="pn-sr-only">Rank </span>{r.rank}</span>
        </li>
      ))}
    </ol>
  );
}

export default function Leaderboard() {
  const { user } = useSession() || {};
  const userId = user?.id;
  const [params, setParams] = useSearchParams();
  const game = isValidBoardGame(params.get('game')) ? params.get('game') : 'xp';
  const period = isValidPeriod(params.get('period')) ? params.get('period') : 'today';
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const reqId = useRef(0);

  const load = useCallback(() => {
    if (!userId) return;
    const id = ++reqId.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    api(`/leaderboard?game=${game}&period=${period}`)
      .then((data) => id === reqId.current && setState({ loading: false, data, error: null }))
      .catch((e) => id === reqId.current && setState({ loading: false, data: null, error: e.message }));
  }, [game, period, userId]);

  useEffect(() => { load(); }, [load]);

  // Keep the selected game tab visible in the horizontally scrolling strip (e.g. deep links to ?game=travel).
  const tabsRef = useRef(null);
  useEffect(() => {
    const strip = tabsRef.current;
    const tab = strip?.querySelector('.lb-tab.is-active');
    if (!strip || !tab) return;
    const left = strip.scrollLeft + tab.getBoundingClientRect().left - strip.getBoundingClientRect().left - (strip.clientWidth - tab.offsetWidth) / 2;
    strip.scrollTo?.({ left: Math.max(0, left), behavior: 'smooth' });
  }, [game]);

  const set = (patch) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) next.set(k, v);
    setParams(next, { replace: true });
  };

  // Arrow-key navigation within a tablist (roving focus).
  const onTabKey = (e, list, current, key) => {
    const i = list.findIndex((x) => x.id === current);
    let j = null;
    if (e.key === 'ArrowRight') j = (i + 1) % list.length;
    if (e.key === 'ArrowLeft') j = (i - 1 + list.length) % list.length;
    if (e.key === 'Home') j = 0;
    if (e.key === 'End') j = list.length - 1;
    if (j == null) return;
    e.preventDefault();
    set({ [key]: list[j].id });
    const el = e.currentTarget.parentElement.children[j];
    el?.focus();
    el?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  };

  const meta = BOARD_GAMES.find((g) => g.id === game);
  const isXp = game === 'xp';
  const { rows, pinned } = boardRows(state.data);
  const showPodium = rows.length >= 3;
  const listRows = showPodium ? rows.slice(3) : rows;
  const fresh = state.data && state.data.game === game && (isXp || state.data.period === period);

  return (
    <div className="container lb-page">
      <header className="lb-head">
        <div>
          <h1>Leaderboard</h1>
          <p className="muted">
            {isXp ? 'Total XP earned across every game, all time.' : 'Best score per day, added up over the period.'}
          </p>
        </div>
      </header>

      <div className="lb-tabs" role="tablist" aria-label="Game" ref={tabsRef}>
        {BOARD_GAMES.map((g) => (
          <button
            key={g.id} type="button" role="tab" aria-selected={g.id === game} aria-controls="lb-board" tabIndex={g.id === game ? 0 : -1}
            className={`lb-tab${g.id === game ? ' is-active' : ''}`}
            onClick={() => set({ game: g.id })} onKeyDown={(e) => onTabKey(e, BOARD_GAMES, game, 'game')}
          >
            <span aria-hidden="true">{g.icon}</span> {g.name}
          </button>
        ))}
      </div>

      <div className="lb-periods" role="tablist" aria-label="Period">
        {PERIODS.map((p) => {
          const active = isXp ? p.id === 'all' : p.id === period;
          return (
            <button
              key={p.id} type="button" role="tab" aria-selected={active} aria-controls="lb-board" tabIndex={active ? 0 : -1}
              className={`lb-period${active ? ' is-active' : ''}`} disabled={isXp && p.id !== 'all'}
              onClick={() => set({ period: p.id })} onKeyDown={(e) => !isXp && onTabKey(e, PERIODS, period, 'period')}
              title={isXp && p.id !== 'all' ? 'XP is an all-time total' : undefined}
            >
              {p.name}
            </button>
          );
        })}
      </div>

      <section id="lb-board" role="tabpanel" aria-label={`${meta.name} leaderboard`} className={`lb-board${state.loading && fresh ? ' is-refreshing' : ''}`} aria-live="polite" aria-busy={state.loading}>
        {state.error && (
          <div className="alert error lb-error" role="alert">
            <span>Couldn’t load the leaderboard: {state.error}</span>
            <button type="button" className="btn small secondary" onClick={load}>Retry</button>
          </div>
        )}

        {state.loading && !fresh && (
          <div className="lb-list">{Array.from({ length: 6 }, (_, i) => <div key={i} className="lb-skel" />)}</div>
        )}

        {!state.error && fresh && rows.length === 0 && (
          <div className="card lb-empty center">
            <div className="lb-empty-icon" aria-hidden="true">{meta.icon}</div>
            <h2>No scores yet</h2>
            <p className="muted">
              {isXp
                ? 'Nobody has earned XP yet.'
                : `Nobody has played ${meta.name} ${period === 'today' ? 'today' : period === 'week' ? 'this week' : 'yet'}.`} Claim the top spot!
            </p>
            <Link to={PLAY_LINK[game]} className="btn">Play {isXp ? 'now' : meta.name}</Link>
          </div>
        )}

        {!state.error && fresh && rows.length > 0 && (
          <>
            {showPodium && <Podium rows={rows} unit={meta.unit} />}
            {listRows.length > 0 && (
              <ol className="lb-list" start={showPodium ? 4 : 1}>
                {listRows.map((r) => <Row key={r.id} r={r} unit={meta.unit} />)}
              </ol>
            )}
            {pinned && (
              <div className="lb-pinned">
                <span className="lb-gap" aria-hidden="true">⋯</span>
                <ol className="lb-list" start={pinned.rank}><Row r={pinned} unit={meta.unit} pinned /></ol>
              </div>
            )}
            {!state.data.me && (
              <p className="muted small center lb-notyet">
                You’re not on this board yet. <Link to={PLAY_LINK[game]}>Play {isXp ? 'a game' : meta.name}</Link> to get ranked.
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
