import { Link } from 'react-router-dom';
import { useSession } from '../lib/session.jsx';
import { CricketPreview, HighwayPreview, CarromPreview } from '../components/ArcadePreviews.jsx';
import { CountUp } from '../components/Motion.jsx';
import { formatNumber } from '../components/coreLogic.js';
import './Arcade.css';

export const ARCADE_GAMES = [
  {
    id: 'cricket', game: 'arcade_cricket', to: '/arcade/cricket', name: 'Cricket Blitz', icon: '🏏',
    tagline: 'Time your shot. Clear the ropes.',
    blurb: 'Face 12 balls under the floodlights. Swipe to swing, read the bowler, and send it into the stands.',
    feats: ['3D stadium', 'Ball physics', 'Crowd roar'], unit: 'runs', hue: 'gold', Preview: CricketPreview,
  },
  {
    id: 'highway', game: 'arcade_highway', to: '/arcade/highway', name: 'Highway Rush', icon: '🏎️',
    tagline: 'Faster. Closer. Don’t blink.',
    blurb: 'Weave through traffic at full throttle. Near misses build your combo — one bump and it’s over.',
    feats: ['3D highway', 'Near-miss combos', 'Engine sound'], unit: 'pts', hue: 'pink', Preview: HighwayPreview,
  },
  {
    id: 'carrom', game: 'arcade_carrom', to: '/arcade/carrom', name: 'Carrom Strike', icon: '🎯',
    tagline: 'Aim, flick, pocket.',
    blurb: 'The classic board, with real collisions. Drag to aim, release to strike, and cover the queen.',
    feats: ['Real physics', 'Queen & cover', 'Satisfying clacks'], unit: 'pts', hue: 'teal', Preview: CarromPreview,
  },
];

// The game pages save their own local best; read the most likely keys defensively.
function localBest(id) {
  const keys = [`playnest.arcade.${id}.best`, `playnest.arcade.best.${id}`, `playnest.${id}.best`, `arcade_${id}_best`, `playnest.arcade_${id}.best`];
  try {
    for (const k of keys) {
      const raw = localStorage.getItem(k);
      if (raw == null) continue;
      let v = Number(raw);
      if (!Number.isFinite(v)) { try { const j = JSON.parse(raw); v = Number(j?.best ?? j?.score); } catch { v = NaN; } }
      if (Number.isFinite(v) && v > 0) return v;
    }
  } catch { /* storage blocked */ }
  return null;
}

function GameCard({ g, best, index }) {
  const { Preview } = g;
  return (
    <article className={`card ar-card hue-${g.hue} pn-tilt`} style={{ '--d': `${index * 110}ms` }} aria-labelledby={`ar-${g.id}-h`}>
      <Link to={g.to} className="ar-preview" tabIndex={-1} aria-hidden="true">
        <Preview />
        <span className="ar-preview-shade" />
      </Link>
      <div className="ar-body">
        <div className="ar-title-row">
          <span className="ar-icon" aria-hidden="true">{g.icon}</span>
          <div>
            <h2 id={`ar-${g.id}-h`}>{g.name}</h2>
            <p className="ar-tagline">{g.tagline}</p>
          </div>
        </div>
        <p className="muted small ar-blurb">{g.blurb}</p>
        <ul className="ar-feats" aria-label="Features">
          {g.feats.map((f) => <li key={f}>{f}</li>)}
        </ul>
        <div className="ar-foot">
          {best != null
            ? <span className="ar-best"><span className="muted small">Your best</span><strong><CountUp value={best} format={(n) => formatNumber(Math.round(n))} /> <small>{g.unit}</small></strong></span>
            : <span className="ar-best is-empty muted small">No score yet — set the bar!</span>}
          <Link to={g.to} className="btn ar-play">
            <span aria-hidden="true">▶</span> Play<span className="pn-sr-only"> {g.name}</span>
          </Link>
        </div>
      </div>
    </article>
  );
}

export default function Arcade() {
  const { profile } = useSession() || {};
  const stats = profile?.stats || [];
  const bestFor = (g) => {
    const server = stats.find((s) => s.game === g.game)?.best;
    const local = localBest(g.id);
    const vals = [server, local].filter((v) => v != null && Number.isFinite(Number(v)));
    return vals.length ? Math.max(...vals.map(Number)) : null;
  };

  return (
    <div className="container ar-page">
      <header className="ar-hero">
        <div className="ar-hero-bg" aria-hidden="true">
          <span className="ar-beam b1" /><span className="ar-beam b2" /><span className="ar-beam b3" />
          <span className="ar-grid" />
        </div>
        <span className="ar-kicker"><span className="ar-dot" aria-hidden="true" /> New · Arcade</span>
        <h1 className="ar-title">
          <span className="ar-title-line">Play it</span>
          <span className="ar-title-big">for real.</span>
        </h1>
        <p className="ar-lede">
          Three fast, full-screen games built for your phone — real <strong>3D</strong>, real <strong>physics</strong> and punchy <strong>sound</strong>.
          Quick rounds, big moments, and XP for every run.
        </p>
        <ul className="ar-pills" aria-label="Highlights">
          <li><span aria-hidden="true">🧊</span> 3D graphics</li>
          <li><span aria-hidden="true">⚙️</span> Physics</li>
          <li><span aria-hidden="true">🔊</span> Sound &amp; haptics</li>
          <li><span aria-hidden="true">✨</span> Earn XP</li>
        </ul>
      </header>

      <section className="ar-grid-cards" aria-label="Arcade games">
        {ARCADE_GAMES.map((g, i) => <GameCard key={g.id} g={g} best={bestFor(g)} index={i} />)}
      </section>

      <section className="card ar-board">
        <span className="ar-board-icon" aria-hidden="true">🏆</span>
        <div className="ar-board-text">
          <h2>Climb the Arcade leaderboard</h2>
          <p className="muted small">Your best score each day counts. Tip: turn on sound <span aria-hidden="true">🔊</span> for the full experience.</p>
        </div>
        <Link to="/leaderboard?game=arcade&period=week" className="btn secondary">See rankings</Link>
      </section>
    </div>
  );
}
