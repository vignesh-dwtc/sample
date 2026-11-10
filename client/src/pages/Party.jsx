import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useSession } from '../lib/session.jsx';
import { useParty } from '../party/useParty.js';
import { GAME_INFO, StatusPill, useTicker } from '../party/common.jsx';
import PartyHome from '../party/PartyHome.jsx';
import RoomLobby from '../party/RoomLobby.jsx';
import Trivia from '../party/Trivia.jsx';
import Reaction from '../party/Reaction.jsx';
import Scoreboard from '../party/Scoreboard.jsx';
import Results from '../party/Results.jsx';
import { confetti, haptic, sound } from '../fx/index.js';
import './Party.css';

const CODE_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/;
const ROOM_ERRORS = new Set(['not_found', 'full', 'closed']);

export default function Party() {
  const params = useParams();
  const urlCode = params.code ? params.code.toUpperCase() : null;
  const code = urlCode && CODE_RE.test(urlCode) ? urlCode : null;
  const navigate = useNavigate();
  const { user, celebrate, toast } = useSession() || {};
  const [progress, setProgress] = useState(null);
  const [busy, setBusy] = useState(false);
  const [homeError, setHomeError] = useState(urlCode && !code ? `“${params.code}” is not a valid room code.` : null);

  const onProgress = useCallback((p) => { setProgress(p); celebrate?.(p); }, [celebrate]);
  const party = useParty({ enabled: Boolean(user), onProgress });
  const { room, me, status, send, error, clearError } = party;
  const notify = useCallback((t) => (toast ? toast(t) : undefined), [toast]);

  const leavingRef = useRef(false);
  const prevCodeRef = useRef(code);

  // Join the room in the URL on every (re)connect — that re-attaches our seat —
  // and whenever the URL points at a different room.
  const joinedRef = useRef({ connId: 0, code: null });
  useEffect(() => {
    if (status !== 'open' || !code || leavingRef.current) return;
    const j = joinedRef.current;
    if (j.connId === party.connId && (j.code === code || room?.code === code)) return;
    joinedRef.current = { connId: party.connId, code };
    send({ type: 'join', code });
  }, [status, code, room?.code, party.connId, send]);

  // Room created/joined → reflect it in the URL so it can be shared/reloaded.
  useEffect(() => {
    if (room?.code && room.code !== code && !leavingRef.current) navigate(`/party/${room.code}`);
  }, [room?.code, code, navigate]);

  // Browser back from /party/ABCD to /party leaves the room.
  useEffect(() => {
    const prev = prevCodeRef.current;
    prevCodeRef.current = code;
    if (!code) leavingRef.current = false;
    if (prev && !code && room) send({ type: 'leave' });
  }, [code, room, send]);

  // New game → forget last game's XP.
  useEffect(() => { if (room?.phase === 'playing') setProgress(null); }, [room?.phase]);

  // Podium moment: fanfare + confetti when the final standings arrive (bigger if I made the top 3).
  useEffect(() => {
    if (room?.phase !== 'results') return undefined;
    const list = party.final || [];
    const mine = list.find((x) => x.id === me);
    const podium = mine && mine.rank <= 3 && mine.score > 0;
    sound(podium ? 'success' : 'coin');
    if (podium) haptic('success');
    const t = setTimeout(() => confetti({ y: 0.3, count: podium ? 160 : 70 }), 250);
    return () => clearTimeout(t);
  }, [room?.phase]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (room) setBusy(false); }, [room]);

  // Errors: room-level problems go back to the home screen; others become toasts.
  useEffect(() => {
    if (!error) return;
    setBusy(false);
    if (ROOM_ERRORS.has(error.code)) {
      setHomeError(error.message);
      if (code) { leavingRef.current = true; navigate('/party', { replace: true }); }
    } else if (error.code !== 'replaced') {
      notify({ kind: 'error', icon: '⚠️', title: error.message });
    }
    clearError();
  }, [error, code, navigate, notify, clearError]);

  const create = (game) => {
    setHomeError(null);
    setBusy(true);
    if (!send({ type: 'create', game })) { setBusy(false); setHomeError('Still connecting — try again in a second.'); }
  };
  const join = (c) => {
    setHomeError(null);
    leavingRef.current = false;
    navigate(`/party/${c}`);
  };
  const leave = () => {
    leavingRef.current = true;
    send({ type: 'leave' });
    navigate('/party');
  };

  // /party?create=trivia|reaction (e.g. from the Home page) creates a room right away.
  const [search, setSearch] = useSearchParams();
  const autoCreate = search.get('create');
  // The ref guards against a second render (before the URL update lands) creating
  // a second room — which would destroy the first and briefly put a dead code in the URL.
  const autoCreatedRef = useRef(false);
  useEffect(() => {
    if (!autoCreate) { autoCreatedRef.current = false; return; }
    if (autoCreatedRef.current || code || room || status !== 'open') return;
    autoCreatedRef.current = true;
    setSearch({}, { replace: true });
    if (Object.hasOwn(GAME_INFO, autoCreate)) create(autoCreate);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const isHost = room && room.hostId === me;

  let body;
  if (status === 'replaced') {
    body = (
      <div className="card pt-center stack pop">
        <div className="pt-game-icon" aria-hidden="true">🪟</div>
        <h2>Open in another tab</h2>
        <p className="muted">Party play is active in another tab or window. Continue here instead?</p>
        <button className="btn" onClick={() => window.location.reload()}>Play here</button>
      </div>
    );
  } else if (!room) {
    if (!user || (code && !homeError)) {
      body = (
        <div className="card pt-center stack" aria-busy="true">
          <div className="pt-spinner" aria-hidden="true" />
          <p className="muted">{code ? <>Joining room <strong className="mono">{code}</strong>…</> : 'Getting things ready…'}</p>
          {status !== 'open' && user && <StatusPill status={status} />}
        </div>
      );
    } else {
      body = <PartyHome onCreate={create} onJoin={join} busy={busy} ready={status === 'open'}
        error={homeError || (status !== 'open' && status !== 'connecting' ? 'Connection lost — reconnecting…' : null)} />;
    }
  } else {
    body = (
      <>
        <div className="pt-topbar">
          <span className="pt-room-chip" title="Room code">
            <span aria-hidden="true">{GAME_INFO[room.game].icon}</span>
            <span className="mono">{room.code}</span>
          </span>
          <StatusPill status={status} />
          <button className="btn ghost small" onClick={leave}>Leave</button>
        </div>
        {room.phase === 'lobby' && <RoomLobby room={room} me={me} isHost={isHost} send={send} toast={notify} />}
        {room.phase === 'playing' && (
          <div className="pt-play">
            <div className="pt-main">
              {party.countdown && <GetReady endsAt={party.countdown.endsAt} serverNow={party.serverNow} game={room.game} />}
              {room.game === 'trivia' && !party.countdown && (
                <Trivia room={room} me={me} question={party.question} myChoice={party.myChoice}
                  answeredIds={party.answeredIds} reveal={party.reveal} send={send} serverNow={party.serverNow} />
              )}
              {room.game === 'reaction' && !party.countdown && (
                <Reaction room={room} me={me} reaction={party.reaction} send={send} />
              )}
            </div>
            <aside className="pt-side">
              <Scoreboard room={room} me={me} gained={party.lastGained} />
            </aside>
          </div>
        )}
        {room.phase === 'results' && (
          <Results room={room} me={me} standings={party.final} isHost={isHost} progress={progress} send={send} onLeave={leave} />
        )}
      </>
    );
  }

  return <div className="container pt-page">{body}</div>;
}

function GetReady({ endsAt, serverNow, game }) {
  useTicker(true, 100);
  const left = Math.max(0, endsAt - serverNow());
  const n = Math.ceil(left / 1000);
  return (
    <div className="pt-getready card" role="status" aria-live="assertive">
      <div className="small muted">{GAME_INFO[game].name} starts in</div>
      <div key={n} className="pt-getready-n mono">{n > 0 ? n : 'Go!'}</div>
      <div className="small muted">{game === 'trivia' ? 'Answer fast for bonus points' : 'Remember: wait for green'}</div>
    </div>
  );
}
