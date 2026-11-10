import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { useSession } from '../lib/session.jsx';
import { ResultPanel, GameStatus, GameHeader, useDailyGame, siteUrl } from '../games/index.js';
import { confetti, haptic, sound } from '../fx/index.js';
import './Reflex.css';

const GAME_MS = 60000;
const MISS_PENALTY_MS = 2000;
const MAX_SCORE = 150;
const KEYS = ['1', '2', '3', '4', 'q', 'w', 'e', 'r', 'a', 's', 'd', 'f', 'z', 'x', 'c', 'v'];
const clamp01 = (x) => Math.max(0, Math.min(1, x));

/** Difficulty ramps over the run: shorter lifetimes, faster spawns, more targets at once. */
function difficulty(clock) {
  const p = clamp01(clock / GAME_MS);
  return {
    ttl: 1400 - 650 * p,
    gap: 700 - 380 * p,
    maxActive: 1 + Math.floor(p * 3.2),
    goldChance: 0.08 + 0.06 * p,
  };
}

function initialRun() {
  return {
    clock: 0, penalty: 0, last: 0, nextSpawn: 300, nextId: 1,
    score: 0, hits: 0, misses: 0,
    targets: new Map(), // cell -> { id, born, ttl, gold }
    fx: [],             // { id, cell, text, kind, born }
  };
}

export default function Reflex() {
  const { celebrate } = useSession() || {};
  const { data: stats, setData: setStats, error, loading, reload } = useDailyGame('/daily/reflex');
  const [phase, setPhase] = useState('ready'); // ready | countdown | playing | submitting | done
  const [count, setCount] = useState(3);
  const [, setFrame] = useState(0);
  const [result, setResult] = useState(null);
  const [submitError, setSubmitError] = useState(null);
  const run = useRef(initialRun());
  const raf = useRef(0);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const finish = useCallback(async () => {
    const r = run.current;
    cancelAnimationFrame(raf.current);
    setPhase('submitting');
    const body = {
      score: Math.min(MAX_SCORE, r.score),
      hits: r.hits,
      misses: r.misses,
      durationMs: Math.round(r.clock + r.penalty),
    };
    try {
      const res = await api('/daily/reflex/submit', { method: 'POST', body });
      const newBest = res.best === body.score && body.score > (stats?.best ?? 0);
      setResult({ ...body, progress: res.progress, best: res.best, newBest });
      sound(newBest ? 'success' : 'coin'); haptic(newBest ? 'success' : 'tap');
      if (newBest) setTimeout(() => confetti({ y: 0.3 }), 200);
      setStats((s) => ({ ...(s || {}), best: res.best, plays: res.plays }));
      celebrate?.(res.progress);
      setSubmitError(null);
    } catch (e) {
      setResult({ ...body, progress: null, best: stats?.best ?? 0 });
      setSubmitError(e.message);
    }
    setPhase('done');
  }, [celebrate, setStats, stats]);

  const tick = useCallback((now) => {
    const r = run.current;
    const dt = r.last ? Math.min(100, now - r.last) : 16; // backgrounded tabs pause the clock
    r.last = now;
    r.clock += dt;
    const d = difficulty(r.clock + r.penalty);

    for (const [cell, t] of r.targets) if (r.clock - t.born > t.ttl) r.targets.delete(cell);
    r.fx = r.fx.filter((f) => r.clock - f.born < 650);

    if (r.clock >= r.nextSpawn && r.targets.size < d.maxActive) {
      const free = [];
      for (let i = 0; i < 16; i++) if (!r.targets.has(i)) free.push(i);
      const cell = free[Math.floor(Math.random() * free.length)];
      r.targets.set(cell, { id: r.nextId++, born: r.clock, ttl: d.ttl, gold: Math.random() < d.goldChance });
      r.nextSpawn = r.clock + d.gap * (0.7 + Math.random() * 0.6);
    }

    if (r.clock + r.penalty >= GAME_MS) { setFrame((f) => f + 1); finish(); return; }
    setFrame((f) => f + 1);
    raf.current = requestAnimationFrame(tick);
  }, [finish]);

  const start = useCallback(() => {
    run.current = initialRun();
    setResult(null);
    setSubmitError(null);
    setCount(3);
    setPhase('countdown');
  }, []);

  // 3-2-1 countdown, then the loop.
  useEffect(() => {
    if (phase !== 'countdown') return;
    if (count === 0) {
      setPhase('playing');
      run.current.last = 0;
      raf.current = requestAnimationFrame(tick);
      return;
    }
    const id = setTimeout(() => setCount((c) => c - 1), 750);
    return () => clearTimeout(id);
  }, [phase, count, tick]);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const tap = useCallback((cell) => {
    if (phaseRef.current !== 'playing') return;
    const r = run.current;
    const t = r.targets.get(cell);
    if (t) {
      const pts = t.gold ? 3 : 1;
      r.score += pts;
      r.hits += 1;
      r.targets.delete(cell);
      r.fx.push({ id: r.nextId++, cell, text: `+${pts}`, kind: t.gold ? 'gold' : 'hit', born: r.clock });
    } else {
      r.misses += 1;
      r.penalty += MISS_PENALTY_MS;
      r.fx.push({ id: r.nextId++, cell, text: '−2s', kind: 'miss', born: r.clock });
    }
    setFrame((f) => f + 1);
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const p = phaseRef.current;
      if (p === 'playing') {
        const idx = KEYS.indexOf(e.key.toLowerCase());
        if (idx >= 0) { e.preventDefault(); tap(idx); }
      } else if ((p === 'ready') && (e.key === ' ' || e.key === 'Enter')) {
        if (e.target instanceof HTMLElement && e.target.tagName === 'BUTTON') return;
        e.preventDefault();
        start();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tap, start]);

  const r = run.current;
  const remaining = Math.max(0, GAME_MS - r.clock - r.penalty);
  const secs = Math.ceil(remaining / 1000);
  const active = phase === 'playing' || phase === 'countdown' || phase === 'submitting';

  return (
    <div className="container narrow rx-page">
      <GameHeader
        icon="⚡"
        title="Reflex"
        help={(
          <>
            <p>Targets pop up on the grid — tap them before they vanish. You have 60 seconds.</p>
            <ul>
              <li><span className="rx-demo" /> +1 point &nbsp; <span className="rx-demo gold" /> golden: +3 points</li>
              <li>Tapping an empty square costs 2 seconds.</li>
              <li>It speeds up as the clock runs down. Play as often as you like — your best run today counts.</li>
            </ul>
            <p className="muted small">Keyboard: 1 2 3 4 / Q W E R / A S D F / Z X C V map to the grid rows.</p>
          </>
        )}
      >
        {stats && <span>Today's best: <strong className="mono">{stats.best}</strong> · {stats.plays} {stats.plays === 1 ? 'run' : 'runs'}</span>}
      </GameHeader>

      <GameStatus loading={loading && !stats} error={!stats ? error : null} onRetry={reload} />

      {stats && (
        <div className="rx-game">
          {(active || phase === 'ready') && (
            <div className={`rx-hud${phase === 'playing' && secs <= 10 ? ' hurry' : ''}`}>
              <div className="rx-hud-item">
                <span className="rx-hud-n mono">{phase === 'ready' ? 60 : secs}</span>
                <span className="muted small">sec</span>
              </div>
              <div className="rx-timer" aria-hidden="true">
                <span style={{ transform: `scaleX(${phase === 'ready' ? 1 : remaining / GAME_MS})` }} />
              </div>
              <div className="rx-hud-item">
                <span className="rx-hud-n mono" key={r.score}>{r.score}</span>
                <span className="muted small">score</span>
              </div>
            </div>
          )}

          {(active || phase === 'ready') && (
            <div className="rx-arena">
              <div className={`rx-grid${phase !== 'playing' ? ' idle' : ''}`} role="group" aria-label="Reflex grid">
                {Array.from({ length: 16 }, (_, i) => {
                  const t = r.targets.get(i);
                  const life = t ? clamp01(1 - (r.clock - t.born) / t.ttl) : 0;
                  const fx = r.fx.filter((f) => f.cell === i);
                  return (
                    <button
                      key={i}
                      type="button"
                      className={`rx-cell${fx.some((f) => f.kind === 'miss') ? ' missed' : ''}`}
                      onPointerDown={(e) => { e.preventDefault(); tap(i); }}
                      onClick={(e) => { if (e.detail === 0) tap(i); /* keyboard activation */ }}
                      tabIndex={phase === 'playing' ? 0 : -1}
                      aria-label={t ? (t.gold ? 'Golden target' : 'Target') : 'Empty'}
                    >
                      {t && (
                        <span key={t.id} className={`rx-target${t.gold ? ' gold' : ''}`} style={{ '--life': life }}>
                          <svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="16" pathLength="100" strokeDasharray={`${life * 100} 100`} /></svg>
                        </span>
                      )}
                      {fx.map((f) => <span key={f.id} className={`rx-fx ${f.kind}`}>{f.text}</span>)}
                    </button>
                  );
                })}
              </div>

              {phase === 'ready' && (
                <div className="rx-overlay">
                  <button type="button" className="btn accent rx-start" onClick={start}>▶ Start</button>
                  <span className="muted small">or press Space</span>
                </div>
              )}
              {phase === 'countdown' && (
                <div className="rx-overlay" aria-live="assertive">
                  <span key={count} className="rx-count">{count || 'Go!'}</span>
                </div>
              )}
              {phase === 'submitting' && (
                <div className="rx-overlay">
                  <span className="rx-count small-text">Time!</span>
                </div>
              )}
            </div>
          )}

          {phase === 'done' && result && (
            <ResultPanel
              game="reflex"
              emoji={result.score >= 40 ? '⚡' : result.score >= 20 ? '🎯' : '🕹️'}
              title={result.newBest ? 'New personal best today!' : result.score >= 40 ? 'Lightning hands!' : 'Run complete'}
              subtitle={`${result.hits} hits · ${result.misses} ${result.misses === 1 ? 'miss' : 'misses'}`}
              stats={[
                { label: 'Score', value: result.score },
                { label: 'Best today', value: result.best },
              ]}
              progress={result.progress}
              shareText={`PlayNest Reflex ${stats.date || ''} ⚡ ${result.score} points (${result.hits} hits, ${result.misses} misses)\n\n${siteUrl()}/play/reflex`}
              countdown={false}
            >
              {submitError && <div className="alert error" role="alert">This run wasn't saved: {submitError}</div>}
              <button type="button" className="btn block" onClick={start} autoFocus>↻ Play again</button>
            </ResultPanel>
          )}
        </div>
      )}
    </div>
  );
}
