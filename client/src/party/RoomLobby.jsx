import { Avatar, GAME_INFO } from './common.jsx';

/** Waiting room: big code, invite actions, player list, host start. */
export default function RoomLobby({ room, me, isHost, send, toast }) {
  const game = GAME_INFO[room.game];
  const link = `${window.location.origin}/party/${room.code}`;
  const connected = room.players.filter((p) => p.connected).length;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast({ icon: '🔗', title: 'Invite link copied', body: link });
    } catch {
      toast({ icon: '⚠️', title: 'Could not copy', body: `Share this code: ${room.code}` });
    }
  };
  const share = async () => {
    try {
      await navigator.share({ title: `Join my ${game.name} room on PlayNest`, text: `Room code ${room.code}`, url: link });
    } catch (e) {
      if (e?.name !== 'AbortError') copy();
    }
  };
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  return (
    <div className="pt-lobby">
      <section className="card pt-invite pop" aria-label="Invite friends">
        <div className="pt-invite-game">
          <span className="pt-game-icon sm" aria-hidden="true">{game.icon}</span>
          <div>
            <div className="small muted">Game</div>
            <strong>{game.name}</strong>
          </div>
        </div>
        <div className="small muted">Room code</div>
        <div className="pt-bigcode mono" aria-label={`Room code ${room.code.split('').join(' ')}`}>
          {room.code.split('').map((c, i) => <span key={i} style={{ animationDelay: `${i * 70}ms` }}>{c}</span>)}
        </div>
        <div className="pt-invite-actions">
          <button className="btn secondary" onClick={copy}>🔗 Copy link</button>
          {canShare && <button className="btn secondary" onClick={share}>📤 Share</button>}
        </div>
        <ul className="pt-rules small muted">
          {game.rules.map((r) => <li key={r}>{r}</li>)}
        </ul>
      </section>

      <section className="card pt-players" aria-label="Players">
        <div className="spread">
          <h2>Players</h2>
          <span className="badge">{room.players.length}/12</span>
        </div>
        <ul className="pt-player-list">
          {room.players.map((p) => (
            <li key={p.id} className={`pt-player pop${p.id === me ? ' is-me' : ''}${p.connected ? '' : ' is-away'}`}>
              <Avatar player={p} />
              <span className="pt-player-name">
                {p.username}
                {p.id === me && <span className="muted small"> (you)</span>}
              </span>
              {p.id === room.hostId && <span className="badge gold" title="Host">👑 Host</span>}
              {!p.connected && <span className="badge" title="Reconnecting">⏳</span>}
            </li>
          ))}
        </ul>
        {room.players.length < 2 && (
          <p className="small muted pt-hint">Share the code to invite friends — or start solo to warm up.</p>
        )}
        {isHost ? (
          <button className="btn accent block pt-start" onClick={() => send({ type: 'start' })} disabled={connected < 1}>
            Start {game.name} ▶
          </button>
        ) : (
          <div className="pt-waiting small muted" aria-live="polite">
            <span className="pt-dots" aria-hidden="true"><i /><i /><i /></span>
            Waiting for the host to start
          </div>
        )}
      </section>
    </div>
  );
}
