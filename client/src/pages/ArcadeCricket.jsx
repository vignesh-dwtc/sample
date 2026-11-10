import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../lib/session.jsx';
import { ResultPanel, siteUrl } from '../games/index.js';
import { confetti, sound, haptic, useMuted, setMuted } from '../fx/index.js';
import { submitArcadeScore, newRunId } from '../arcade/submit.js';
import { createEngine, webglAvailable } from '../arcade/cricket/engine.js';
import { newInnings, flavour, ballsLeft, oversText, strikeRate, shareText, resultTitle, meterPos, MAX_BALLS } from '../arcade/cricket/logic.js';
import './ArcadeCricket.css';

const BEST_KEY = 'playnest.cricket.best';
const readBest = () => { try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch { return 0; } };
const writeBest = (n) => { try { localStorage.setItem(BEST_KEY, String(n)); } catch { /* ignore */ } };

function Chip({ c }) {
  const cls = c === 'W' ? 'w' : c === '6' ? 'six' : c === '4' ? 'four' : c === '•' ? 'dot' : 'run';
  return <span className={`ck-chip ${cls}`}>{c}</span>;
}

function TimingMeter({ shot }) {
  if (!shot) return null;
  const pos = meterPos(shot.diff);
  const grade = shot.timing?.grade || 'none';
  return (
    <div className={`ck-meter ck-grade-${grade}`} aria-live="polite">
      <div className="ck-meter-bar">
        <span className="ck-meter-zone" />
        {pos != null && <span className="ck-meter-mark" style={{ left: `${50 + pos * 50}%` }} />}
      </div>
      <div className="ck-meter-labels"><span>Early</span><strong>{shot.timing ? shot.timing.label : 'No shot'}</strong><span>Late</span></div>
    </div>
  );
}

export default function ArcadeCricket() {
  const { celebrate } = useSession() || {};
  const muted = useMuted();
  const stageRef = useRef(null);
  const mountRef = useRef(null);
  const engineRef = useRef(null);
  const runIdRef = useRef(null);
  const [supported] = useState(() => typeof window !== 'undefined' && webglAvailable());
  const [failed, setFailed] = useState(false);
  const [mode, setMode] = useState('intro'); // intro | play | over
  const [paused, setPaused] = useState(false);
  const [innings, setInnings] = useState(newInnings);
  const [release, setRelease] = useState(null);
  const [shot, setShot] = useState(null);
  const [banner, setBanner] = useState(null);
  const [best, setBest] = useState(readBest);
  const [result, setResult] = useState(null); // { innings, best, newBest, progress, saving, error }
  const [height, setHeight] = useState(null);
  const bestRef = useRef(best);
  bestRef.current = best;

  // Fill the screen below the header (and above the phone tab bar).
  useLayoutEffect(() => {
    const fit = () => {
      const el = stageRef.current; if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      const tab = document.querySelector('.pn-tabbar');
      const tabH = tab && getComputedStyle(tab).display !== 'none' ? tab.offsetHeight : 0;
      setHeight(Math.max(440, window.innerHeight - top - tabH));
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  const finish = useCallback(async (inn) => {
    const prevBest = bestRef.current;
    const newBest = inn.runs > prevBest;
    if (newBest) { writeBest(inn.runs); setBest(inn.runs); }
    setResult({ innings: inn, best: Math.max(prevBest, inn.runs), newBest, progress: null, saving: true });
    setMode('over');
    if (inn.runs >= 24 || newBest) { confetti({ count: 180 }); sound('levelup'); haptic('success'); }
    try {
      const res = await submitArcadeScore('arcade_cricket', inn.runs, { sixes: inn.sixes, fours: inn.fours }, runIdRef.current);
      if (res?.progress) celebrate?.(res.progress);
      setResult((r) => r && { ...r, progress: res?.progress || null, saving: false, queued: !!res?.queued });
    } catch {
      setResult((r) => r && { ...r, saving: false, error: true });
    }
  }, [celebrate]);
  const finishRef = useRef(finish);
  finishRef.current = finish;

  // Engine lifecycle.
  useEffect(() => {
    if (!supported || !mountRef.current) return undefined;
    let engine;
    let bannerTimer;
    try {
      engine = createEngine(mountRef.current, {
        onEvent(ev) {
          if (ev.type === 'innings') setInnings(ev.innings);
          else if (ev.type === 'ball') { setRelease(null); setShot(null); }
          else if (ev.type === 'release') setRelease(ev);
          else if (ev.type === 'shot') setShot(ev);
          else if (ev.type === 'banner') {
            clearTimeout(bannerTimer);
            setBanner({ ...ev, id: Math.random() });
            bannerTimer = setTimeout(() => setBanner(null), ev.kind === 'six' ? 2200 : 1600);
            if (ev.kind === 'six') confetti({ count: 220, y: 0.3, colors: ['#ffd166', '#ff5c7a', '#22d3a6', '#7c5cff', '#ffffff'] });
            else if (ev.kind === 'four') confetti({ count: 110, y: 0.32 });
          } else if (ev.type === 'end') finishRef.current(ev.innings);
        },
      });
    } catch (e) {
      console.warn('Cricket Blitz: WebGL init failed', e);
      setFailed(true);
      return undefined;
    }
    engineRef.current = engine;
    if (import.meta.env.DEV) window.__ckEngine = engine;
    return () => {
      clearTimeout(bannerTimer);
      engine.dispose();
      engineRef.current = null;
      if (import.meta.env.DEV) delete window.__ckEngine;
    };
  }, [supported]);

  useEffect(() => { engineRef.current?.setPaused(paused); }, [paused]);
  useEffect(() => {
    const onVis = () => { if (document.hidden) setPaused((p) => p || mode === 'play'); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [mode]);
  useEffect(() => {
    const onKey = (e) => {
      if ((e.key === 'p' || e.key === 'Escape') && mode === 'play') setPaused((p) => !p);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode]);

  const play = () => {
    sound('tap'); haptic('tap');
    runIdRef.current = newRunId();
    setResult(null); setShot(null); setRelease(null); setBanner(null); setPaused(false);
    setInnings(newInnings());
    setMode('play');
    engineRef.current?.start();
  };

  const best0 = best;
  const left = ballsLeft(innings);
  const showFallback = !supported || failed;

  return (
    <div className="ck-page">
      <div ref={stageRef} className={`ck-stage ck-mode-${mode}`} style={height ? { height } : undefined}>
        <div ref={mountRef} className="ck-mount" aria-label="Cricket Blitz 3D stadium" role="img" />

        {showFallback && (
          <div className="ck-overlay ck-fallback">
            <div className="card ck-card pop">
              <div className="ck-fallback-icon" aria-hidden="true">🏏</div>
              <h1 className="ck-title">Cricket Blitz</h1>
              <p className="muted">This game needs 3D graphics (WebGL), which your browser or device has turned off. Try another browser such as Chrome, or switch on hardware acceleration.</p>
              <Link to="/arcade" className="btn secondary">Back to Arcade</Link>
            </div>
          </div>
        )}

        {mode === 'play' && !showFallback && (
          <>
            <div className="ck-hud-top">
              <div className="ck-board" aria-live="polite">
                <div className="ck-board-team">BLITZ XI</div>
                <div className="ck-board-score"><span key={innings.runs} className="ck-pop">{innings.runs}</span><small>/{innings.wickets}</small></div>
                <div className="ck-board-meta">
                  <span>{oversText(innings.balls)} ov</span>
                  <span>{left} ball{left === 1 ? '' : 's'} left</span>
                </div>
              </div>
              <div className="ck-buttons">
                <button type="button" className="ck-icon-btn" onClick={() => setMuted(!muted)} aria-label={muted ? 'Unmute' : 'Mute'}>{muted ? '🔇' : '🔊'}</button>
                <button type="button" className="ck-icon-btn" onClick={() => setPaused(true)} aria-label="Pause">❚❚</button>
              </div>
            </div>
            <div className="ck-chips" aria-label="Last six balls">
              {Array.from({ length: 6 }, (_, i) => {
                const c = innings.chips[i];
                return c ? <Chip key={`${innings.balls}-${i}`} c={c} /> : <span key={i} className="ck-chip empty" />;
              })}
            </div>
            <div className="ck-hud-bottom">
              {release && (
                <div className="ck-speed" key={`${innings.balls}-r`}>
                  <strong>{release.speedKmh}</strong> km/h <span className="ck-dot">·</span> {release.length} <span className="ck-dot">·</span> {release.swing}
                </div>
              )}
              <TimingMeter shot={shot} />
              <div className="ck-flavour">{flavour(innings, best0)}</div>
            </div>
          </>
        )}

        {banner && (
          <div key={banner.id} className={`ck-banner ck-banner-${banner.kind}`} aria-live="assertive">
            <span>{banner.text}</span>
          </div>
        )}

        {mode === 'intro' && !showFallback && (
          <div className="ck-overlay ck-intro">
            <div className="ck-intro-inner pop">
              <div className="ck-kicker">PlayNest Arcade · 3D</div>
              <h1 className="ck-title ck-title-big">Cricket <span>Blitz</span></h1>
              <p className="ck-sub">2 overs. 3 wickets. Floodlights on. How many can you smash?</p>
              <ul className="ck-how">
                <li><b>Tap</b> or press <kbd>Space</kbd> just as the ball reaches you.</li>
                <li><b>Aim:</b> swipe, tap left/right, or use <kbd>←</kbd> <kbd>→</kbd>.</li>
                <li><b>Go big:</b> swipe up, tap high, or hold <kbd>↑</kbd> for a six (risky!).</li>
              </ul>
              <button type="button" className="btn accent ck-play" onClick={play}>▶ Play</button>
              {best0 > 0 && <div className="ck-best">Your best: <b>{best0}</b> runs</div>}
            </div>
          </div>
        )}

        {paused && mode === 'play' && (
          <div className="ck-overlay ck-pause">
            <div className="card ck-card pop">
              <h2>Paused</h2>
              <p className="muted">{innings.runs}/{innings.wickets} after {oversText(innings.balls)} overs</p>
              <div className="ck-pause-actions">
                <button type="button" className="btn accent" onClick={() => setPaused(false)}>Resume</button>
                <button type="button" className="btn secondary" onClick={() => setMuted(!muted)}>{muted ? '🔇 Sound off' : '🔊 Sound on'}</button>
                <Link to="/arcade" className="btn ghost">Quit to Arcade</Link>
              </div>
            </div>
          </div>
        )}

        {mode === 'over' && result && (
          <div className="ck-overlay ck-over">
            <div className="ck-result-wrap">
              <ResultPanel
                game="arcade_cricket"
                emoji={result.innings.runs >= 50 ? '🏆' : result.innings.sixes >= 3 ? '💥' : '🏏'}
                title={resultTitle(result.innings)}
                subtitle={<>{result.innings.runs}/{result.innings.wickets} in {oversText(result.innings.balls)} overs{result.newBest ? <span className="badge gold ck-newbest">New best!</span> : null}</>}
                stats={[
                  { label: 'Runs', value: result.innings.runs },
                  { label: 'Balls', value: `${result.innings.balls}/${MAX_BALLS}` },
                  { label: '4s', value: result.innings.fours },
                  { label: '6s', value: result.innings.sixes },
                  { label: 'SR', value: strikeRate(result.innings) },
                  { label: 'Best', value: result.best },
                ]}
                progress={result.progress}
                shareText={shareText(result.innings, siteUrl())}
                countdown={false}
              >
                <div className="ck-chips ck-chips-result" aria-label="Every ball">
                  {(result.innings.all || []).map((c, i) => <Chip key={i} c={c} />)}
                </div>
                {result.saving && <p className="muted small ck-saving">Saving your score…</p>}
                {result.queued && <p className="muted small ck-saving">You're offline. Your score will be saved when you reconnect.</p>}
                {result.error && <p className="muted small ck-saving">Could not save this score.</p>}
                <div className="ck-result-actions">
                  <button type="button" className="btn ck-again" onClick={play}>🏏 Play again</button>
                  <Link to="/arcade" className="btn secondary">Arcade</Link>
                </div>
              </ResultPanel>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
