import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../lib/session.jsx';
import { submitArcadeScore, newRunId } from '../arcade/submit.js';
import { sound, haptic, useMuted, setMuted, confetti, reducedMotion } from '../fx/index.js';
import { shareResult, siteUrl } from '../games/share.js';
import { formatKm, kmh, shareText as makeShareText } from '../arcade/highway/logic.js';
import '../games/games.css';
import './ArcadeHighway.css';

const BEST_KEY = 'playnest.highway.best';
const readBest = () => { try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch { return 0; } };
const writeBest = (v) => { try { localStorage.setItem(BEST_KEY, String(v)); } catch { /* ignore */ } };

const GAUGE_MAX = 320; // km/h
const ARC = 240; // degrees of the speedometer sweep
const R = 44;
const ARC_LEN = (2 * Math.PI * R * ARC) / 360;

function webglOk() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch { return false; }
}

export default function ArcadeHighway() {
  const { celebrate, toast } = useSession() || {};
  const muted = useMuted();
  const stageRef = useRef(null);
  const sceneRef = useRef(null);
  const gameRef = useRef(null);
  const runRef = useRef(null);
  const phaseRef = useRef('loading');
  const [phase, setPhase] = useState('loading'); // loading | intro | play | paused | over | nogl | error
  const [best, setBest] = useState(readBest);
  const [result, setResult] = useState(null);
  const [save, setSave] = useState({ state: 'idle' });
  const [shared, setShared] = useState(false);
  const hud = useRef({});
  const floatsRef = useRef(null);
  const lastHud = useRef({ score: -1, dist: -1, kmh: -1, nitro: -1, combo: -1 });

  const go = useCallback((p) => { phaseRef.current = p; setPhase(p); }, []);

  // ---- fit the stage between the header and the phone tab bar
  useEffect(() => {
    const fit = () => {
      const el = stageRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      const tab = document.querySelector('.pn-tabbar');
      const tabH = tab && getComputedStyle(tab).display !== 'none' ? tab.getBoundingClientRect().height : 0;
      const h = Math.max(360, window.innerHeight - top - tabH);
      el.style.height = `${h}px`;
    };
    fit();
    window.addEventListener('resize', fit);
    const t = setTimeout(fit, 300);
    return () => { window.removeEventListener('resize', fit); clearTimeout(t); };
  }, []);

  // ---- HUD writer (no React re-render per frame)
  const onFrame = useCallback((h) => {
    const r = hud.current, l = lastHud.current;
    if (!r.score) return;
    if (h.score !== l.score) { l.score = h.score; r.score.textContent = h.score.toLocaleString('en-IN'); }
    const dist = Math.floor(h.distance / 10);
    if (dist !== l.dist) { l.dist = dist; r.dist.textContent = `${formatKm(h.distance)} km`; }
    const k = Math.round(h.speedKmh);
    if (k !== l.kmh) {
      l.kmh = k;
      r.kmh.textContent = k;
      const f = Math.min(1, k / GAUGE_MAX);
      r.needle.style.transform = `rotate(${-ARC / 2 + f * ARC}deg)`;
      r.arc.style.strokeDashoffset = String(ARC_LEN * (1 - f));
    }
    const n = Math.round(h.nitro * 100);
    if (n !== l.nitro || h.nitroActive !== l.na) {
      l.nitro = n; l.na = h.nitroActive;
      r.nitro.style.setProperty('--fill', `${n}%`);
      r.nitroBtn.classList.toggle('is-ready', h.nitro >= 0.22 && !h.nitroActive);
      r.nitroBtn.classList.toggle('is-active', h.nitroActive);
    }
    if (h.combo !== l.combo) {
      l.combo = h.combo;
      r.combo.classList.toggle('is-on', h.combo >= 2);
      if (h.combo >= 2) {
        r.comboVal.textContent = `x${h.mult}`;
        r.combo.classList.remove("hw-pop"); void r.combo.offsetWidth; r.combo.classList.add("hw-pop");
      }
    }
    if (h.combo >= 2) r.comboBar.style.transform = `scaleX(${h.comboLeft.toFixed(3)})`;
  }, []);

  const floatText = useCallback((text, cls) => {
    const host = floatsRef.current;
    if (!host) return;
    const el = document.createElement('div');
    el.className = `hw-float ${cls || ''}`;
    el.textContent = text;
    host.appendChild(el);
    setTimeout(() => el.remove(), 1100);
  }, []);

  const finish = useCallback(async (stats) => {
    const prevBest = readBest();
    const isBest = stats.score > prevBest;
    if (isBest) { writeBest(stats.score); setBest(stats.score); }
    setResult({ ...stats, isBest, prevBest });
    setShared(false);
    go('over');
    if (isBest && stats.score > 0 && !reducedMotion()) setTimeout(() => confetti({ y: 0.3 }), 350);
    setSave({ state: 'saving' });
    try {
      const res = await submitArcadeScore('arcade_highway', stats.score, { nearMisses: stats.nearMisses }, runRef.current);
      if (res?.queued) setSave({ state: 'queued' });
      else if (res?.duplicate) setSave({ state: 'saved' });
      else {
        setSave({ state: 'saved', progress: res?.progress });
        if (res?.progress) celebrate?.(res.progress);
      }
    } catch (e) {
      setSave({ state: 'error', message: e.message });
    }
  }, [celebrate, go]);

  const onEvent = useCallback((type, data) => {
    if (type === 'near') floatText(`+${data.points} NEAR MISS${data.mult > 1 ? ` x${data.mult}` : ''}`, data.mult > 2 ? 'is-hot' : '');
    else if (type === 'coin') floatText(`+${data.points}`, 'is-coin');
    else if (type === 'over') finish(data);
  }, [floatText, finish]);

  // ---- create / dispose the engine
  useEffect(() => {
    if (!webglOk()) { go('nogl'); return undefined; }
    let game = null;
    let cancelled = false;
    import('../arcade/highway/engine.js').then(({ HighwayGame }) => {
      if (cancelled || !sceneRef.current) return;
      try {
        game = new HighwayGame(sceneRef.current, { onFrame: (h) => onFrame(h), onEvent: (t, d) => onEvent(t, d) });
        gameRef.current = game;
        if (import.meta.env.DEV) window.__highway = game; // test hook (dev server only)
        go('intro');
      } catch (e) {
        console.warn('Highway Rush: WebGL init failed', e);
        go('nogl');
      }
    }).catch(() => { if (!cancelled) go('error'); });
    return () => { cancelled = true; game?.dispose(); gameRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    runRef.current = newRunId();
    lastHud.current = { score: -1, dist: -1, kmh: -1, nitro: -1, combo: -1 };
    setResult(null);
    setSave({ state: 'idle' });
    sound('tap'); haptic('tap');
    g.start();
    go('play');
    floatText('GO!', 'is-go');
    stageRef.current?.focus({ preventScroll: true });
  }, [go, floatText]);

  const pause = useCallback(() => {
    if (phaseRef.current !== 'play') return;
    gameRef.current?.pause();
    go('paused');
  }, [go]);
  const resume = useCallback(() => {
    if (phaseRef.current !== 'paused') return;
    gameRef.current?.resume();
    go('play');
  }, [go]);

  // pause when the tab is hidden or the window loses focus
  useEffect(() => {
    const vis = () => { if (document.hidden) pause(); };
    document.addEventListener('visibilitychange', vis);
    window.addEventListener('blur', pause);
    return () => { document.removeEventListener('visibilitychange', vis); window.removeEventListener('blur', pause); };
  }, [pause]);

  // keyboard
  useEffect(() => {
    const down = (e) => {
      if (e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      const g = gameRef.current;
      const ph = phaseRef.current;
      const key = e.key;
      if (ph === 'play') {
        if (key === 'ArrowLeft' || key === 'a' || key === 'A') { e.preventDefault(); if (!e.repeat) g?.steer(-1); }
        else if (key === 'ArrowRight' || key === 'd' || key === 'D') { e.preventDefault(); if (!e.repeat) g?.steer(1); }
        else if (key === ' ' || key === 'ArrowUp' || key === 'w' || key === 'W') { e.preventDefault(); g?.boost(); }
        else if (key === 'p' || key === 'P' || key === 'Escape') { e.preventDefault(); pause(); }
        else if (key === 'ArrowDown') e.preventDefault();
      } else if (ph === 'paused' && (key === 'p' || key === 'P' || key === 'Escape' || key === ' ')) { e.preventDefault(); resume(); }
      else if ((ph === 'intro') && (key === 'Enter' || key === ' ')) { e.preventDefault(); start(); }
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, [pause, resume, start]);

  // touch / mouse: swipe left/right/up or tap a half of the screen
  const ptr = useRef(null);
  const onPointerDown = (e) => {
    if (phaseRef.current !== 'play') return;
    ptr.current = { id: e.pointerId, x: e.clientX, y: e.clientY, done: false };
  };
  const onPointerMove = (e) => {
    const p = ptr.current;
    if (!p || p.id !== e.pointerId || p.done) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    if (Math.abs(dx) > 28 && Math.abs(dx) > Math.abs(dy)) { p.done = true; gameRef.current?.steer(dx < 0 ? -1 : 1); }
    else if (dy < -36 && Math.abs(dy) > Math.abs(dx)) { p.done = true; gameRef.current?.boost(); }
  };
  const onPointerUp = (e) => {
    const p = ptr.current;
    ptr.current = null;
    if (!p || p.id !== e.pointerId || p.done || phaseRef.current !== 'play') return;
    const r = stageRef.current.getBoundingClientRect();
    gameRef.current?.steer(e.clientX < r.left + r.width / 2 ? -1 : 1);
  };

  const onShare = async () => {
    if (!result) return;
    const r = await shareResult(makeShareText(result, `${siteUrl()}/arcade/highway`), toast);
    if (r === 'shared' || r === 'copied') { setShared(true); setTimeout(() => setShared(false), 2000); }
  };

  const toggleMute = () => { setMuted(!muted); gameRef.current?.setMuted(!muted); if (muted) sound('click'); };

  const playing = phase === 'play' || phase === 'paused';
  const setRef = (k) => (el) => { hud.current[k] = el; };

  return (
    <div className="hw-page">
      <div
        ref={stageRef}
        className={`hw-stage phase-${phase}`}
        tabIndex={-1}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { ptr.current = null; }}
      >
        <div ref={sceneRef} className="hw-scene" aria-hidden="true">
          <div className="hw-vignette" />
          <div className="hw-streaks" />
        </div>

        {/* HUD */}
        <div className={`hw-hud${playing ? ' is-on' : ''}`} aria-hidden={!playing}>
          <div className="hw-hud-top">
            <div className="hw-scorebox">
              <span className="hw-label">Score</span>
              <strong ref={setRef('score')} className="hw-score">0</strong>
              <span ref={setRef('dist')} className="hw-dist">0.00 km</span>
            </div>
            <div ref={setRef('combo')} className="hw-combo">
              <span className="hw-combo-label">Combo</span>
              <strong ref={setRef('comboVal')}>x2</strong>
              <span className="hw-combo-bar"><span ref={setRef('comboBar')} /></span>
            </div>
            <div className="hw-hud-btns">
              <button type="button" className="hw-round" onPointerDown={(e) => e.stopPropagation()} onClick={toggleMute} aria-label={muted ? 'Unmute' : 'Mute'}>
                {muted ? '🔇' : '🔊'}
              </button>
              <button type="button" className="hw-round" onPointerDown={(e) => e.stopPropagation()} onClick={phase === 'paused' ? resume : pause} aria-label={phase === 'paused' ? 'Resume' : 'Pause'}>
                {phase === 'paused' ? '▶' : '❚❚'}
              </button>
            </div>
          </div>

          <div className="hw-hud-bottom">
            <div className="hw-speedo" role="img" aria-label="Speedometer">
              <svg viewBox="0 0 120 120" aria-hidden="true">
                <defs>
                  <linearGradient id="hw-g" x1="0" y1="1" x2="1" y2="0">
                    <stop offset="0" stopColor="#22d3a6" />
                    <stop offset="0.6" stopColor="#ffd166" />
                    <stop offset="1" stopColor="#ff5c7a" />
                  </linearGradient>
                </defs>
                <circle cx="60" cy="60" r={R} className="hw-speedo-track" strokeDasharray={`${ARC_LEN} 999`} transform="rotate(150 60 60)" />
                <circle ref={setRef('arc')} cx="60" cy="60" r={R} className="hw-speedo-arc" strokeDasharray={`${ARC_LEN} 999`} strokeDashoffset={ARC_LEN} transform="rotate(150 60 60)" />
                {Array.from({ length: 9 }, (_, i) => {
                  const a = ((-ARC / 2 + (i * ARC) / 8 - 90) * Math.PI) / 180;
                  return <line key={i} x1={60 + Math.cos(a) * 34} y1={60 + Math.sin(a) * 34} x2={60 + Math.cos(a) * 38} y2={60 + Math.sin(a) * 38} className="hw-tick" />;
                })}
              </svg>
              <div ref={setRef('needle')} className="hw-needle" />
              <div className="hw-speedo-read">
                <strong ref={setRef('kmh')}>0</strong>
                <span>km/h</span>
              </div>
            </div>

            <button
              ref={setRef('nitroBtn')}
              type="button"
              className="hw-nitro"
              onPointerDown={(e) => { e.stopPropagation(); gameRef.current?.boost(); }}
              aria-label="Nitro boost"
            >
              <span ref={setRef('nitro')} className="hw-nitro-fill" />
              <span className="hw-nitro-icon" aria-hidden="true">🔥</span>
              <span className="hw-nitro-label">NITRO</span>
            </button>
          </div>
          <div ref={floatsRef} className="hw-floats" aria-live="off" />
        </div>

        {/* Intro */}
        {(phase === 'intro' || phase === 'loading') && (
          <div className="hw-overlay hw-intro">
            <div className="hw-intro-inner">
              <span className="badge gold">Arcade · 3D</span>
              <h1 className="hw-title">Highway <span>Rush</span></h1>
              <p className="hw-tag">Weave through trucks, buses and autos on an endless highway from sunset into the night.</p>
              <button type="button" className="hw-play" onClick={start} disabled={phase === 'loading'}>
                <span aria-hidden="true">▶</span> {phase === 'loading' ? 'Loading…' : 'Play'}
              </button>
              <p className="hw-howto">
                <strong>How to play:</strong> swipe or tap left/right to change lanes, swipe up for nitro.
                On a keyboard use ←/→ or A/D and Space. Pass close for <strong>near-miss</strong> bonuses and grab coins.
              </p>
              {best > 0 && <p className="hw-best">Your best: <strong>{best.toLocaleString('en-IN')}</strong></p>}
            </div>
          </div>
        )}

        {phase === 'paused' && (
          <div className="hw-overlay hw-pause">
            <div className="card hw-card pop">
              <h2>Paused</h2>
              <div className="hw-actions">
                <button type="button" className="btn" onClick={resume}>▶ Resume</button>
                <Link to="/arcade" className="btn secondary">Arcade</Link>
              </div>
            </div>
          </div>
        )}

        {phase === 'over' && result && (
          <div className="hw-overlay hw-over">
            <section className="card hw-card hw-result" aria-labelledby="hw-result-title">
              <div className="hw-result-head">
                <div className="hw-result-emoji" aria-hidden="true">{result.isBest ? '🏆' : '💥'}</div>
                <div>
                  <h2 id="hw-result-title">{result.isBest && result.score > 0 ? 'New best!' : 'Crashed!'}</h2>
                  <div className="muted small">{result.isBest ? `Previous best ${result.prevBest.toLocaleString('en-IN')}` : `Best ${best.toLocaleString('en-IN')}`}</div>
                </div>
              </div>
              <div className="hw-bigscore">{result.score.toLocaleString('en-IN')}<span>pts</span></div>
              <dl className="gm-stats hw-stats">
                <div className="gm-stat"><dt>Distance</dt><dd>{formatKm(result.distance)}<small> km</small></dd></div>
                <div className="gm-stat"><dt>Top speed</dt><dd>{Math.round(result.topSpeed)}<small> km/h</small></dd></div>
                <div className="gm-stat"><dt>Near misses</dt><dd>{result.nearMisses}</dd></div>
                <div className="gm-stat"><dt>Coins</dt><dd>{result.coins}</dd></div>
              </dl>
              <p className="hw-save muted small" role="status">
                {save.state === 'saving' && 'Saving your score…'}
                {save.state === 'saved' && (save.progress ? <>Saved ✓ <strong className="hw-xp">+{save.progress.xpGained} XP</strong> · arcade leaderboard</> : 'Score saved to the arcade leaderboard ✓')}
                {save.state === 'queued' && 'Saved on this device — it will sync automatically.'}
                {save.state === 'error' && `Could not save: ${save.message}`}
              </p>
              <div className="hw-actions">
                <button type="button" className="btn" onClick={start} autoFocus>↻ Play again</button>
                <button type="button" className="btn accent" onClick={onShare}>{shared ? 'Copied ✓' : 'Share'}</button>
              </div>
              <div className="hw-links small">
                <Link to="/arcade">← Arcade</Link>
                <Link to="/leaderboard?game=arcade">Leaderboard</Link>
              </div>
            </section>
          </div>
        )}

        {(phase === 'nogl' || phase === 'error') && (
          <div className="hw-overlay hw-nogl">
            <div className="card hw-card">
              <div className="hw-result-emoji" aria-hidden="true">🛣️</div>
              <h2>3D isn’t available here</h2>
              <p className="muted">
                {phase === 'nogl'
                  ? 'Highway Rush needs WebGL, which this browser or device has turned off. Try Chrome or Safari, or turn on hardware acceleration.'
                  : 'The game could not load. Check your connection and try again.'}
              </p>
              <div className="hw-actions">
                {phase === 'error' && <button type="button" className="btn" onClick={() => location.reload()}>Try again</button>}
                <Link to="/arcade" className="btn secondary">Back to Arcade</Link>
              </div>
            </div>
          </div>
        )}
      </div>
      <p className="pn-sr-only" aria-live="polite">{phase === 'over' && result ? `Crashed. Score ${result.score}. ${result.nearMisses} near misses. Top speed ${kmh(result.topSpeed / 3.6)} km/h.` : ''}</p>
    </div>
  );
}
