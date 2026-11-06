import { Link } from 'react-router-dom';

export const TRAVEL_GAMES = [
  { to: '/travel/sky', icon: '🧭', name: 'Sky Compass', blurb: 'Point your phone at the real sun or moon. How close can you get?', offline: true, hue: 'gold' },
  { to: '/travel/map', icon: '🗺️', name: 'Live Map', blurb: 'Your route drawn live, with interesting places nearby.', offline: false, hue: 'teal' },
  { to: '/travel/quiz', icon: '❓', name: 'Guess Where?', blurb: 'Quick questions about the places you are passing right now.', offline: false, hue: 'violet' },
  { to: '/travel/bingo', icon: '🎯', name: 'Window Bingo', blurb: 'Spot cows, chai stalls and toll booths out of the window.', offline: true, hue: 'rose' },
  { to: '/travel/predict', icon: '⏱️', name: 'Distance Predictor', blurb: 'Guess when you’ll hit the next kilometre mark. Beat the clock.', offline: true, hue: 'blue' },
];

export default function GameTiles({ online }) {
  return (
    <section aria-labelledby="tv-games-h" className="tvh-games-wrap">
      <div className="spread tvh-section-head">
        <h2 id="tv-games-h">Travel games</h2>
        <span className="muted small">Scores earn XP &amp; badges</span>
      </div>
      <ul className="tvh-games">
        {TRAVEL_GAMES.map((g, i) => {
          const blocked = !g.offline && !online;
          return (
            <li key={g.to} style={{ animationDelay: `${60 + i * 50}ms` }}>
              <Link to={g.to} className={`card interactive tvh-game hue-${g.hue}${blocked ? ' is-dim' : ''}`}>
                <span className="tvh-game-icon" aria-hidden="true">{g.icon}</span>
                <span className="tvh-game-text">
                  <strong>{g.name}</strong>
                  <span className="muted small">{g.blurb}</span>
                  <span className={`badge tvh-tag${g.offline ? ' done' : ''}`}>
                    {g.offline ? '✓ Works offline' : blocked ? '📶 Needs internet — you’re offline' : '📶 Needs internet'}
                  </span>
                </span>
                <span className="tvh-game-go" aria-hidden="true">›</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
