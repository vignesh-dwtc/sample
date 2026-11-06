import { useState } from 'react';
import { GAME_INFO } from './common.jsx';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const cleanCode = (v) => v.toUpperCase().split('').filter((c) => ALPHABET.includes(c)).join('').slice(0, 4);

/** Landing screen: create a room for a game, or join one by code. */
export default function PartyHome({ onCreate, onJoin, busy, error, ready }) {
  const [code, setCode] = useState('');
  const submit = (e) => {
    e.preventDefault();
    if (code.length === 4) onJoin(code);
  };
  return (
    <div className="stack pt-home">
      <header className="pt-hero pop">
        <span className="badge live">● Real-time</span>
        <h1>Party Room</h1>
        <p className="muted">Grab your friends, share a 4-letter code, and play together on any device. Up to 12 players.</p>
      </header>

      {error && <div className="alert error" role="alert">{error}</div>}

      <form className="card pt-join" onSubmit={submit} aria-label="Join a room">
        <label htmlFor="pt-code" className="pt-join-label">Got a code?</label>
        <div className="pt-join-row">
          <input
            id="pt-code"
            className="input pt-code-input"
            value={code}
            onChange={(e) => setCode(cleanCode(e.target.value))}
            placeholder="ABCD"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck="false"
            inputMode="text"
            maxLength={4}
            aria-describedby="pt-code-hint"
          />
          <button className="btn accent" disabled={code.length !== 4 || busy || !ready}>Join</button>
        </div>
        <span id="pt-code-hint" className="small muted">4 letters — ask the host or open their invite link.</span>
      </form>

      <h2 className="pt-section-title">Or host a new game</h2>
      <div className="pt-games">
        {Object.entries(GAME_INFO).map(([id, g]) => (
          <article key={id} className={`card pt-game-card pt-game-${id}`}>
            <div className="pt-game-icon" aria-hidden="true">{g.icon}</div>
            <h3>{g.name}</h3>
            <p className="muted small">{g.tagline}</p>
            <ul className="pt-rules small">
              {g.rules.map((r) => <li key={r}>{r}</li>)}
            </ul>
            <button className="btn block" onClick={() => onCreate(id)} disabled={busy || !ready}>
              Create room
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}
