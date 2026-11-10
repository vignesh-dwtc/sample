import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../lib/session.jsx';
import { shareResult, siteUrl } from '../games/share.js';
import { submitArcadeScore, newRunId } from '../arcade/submit.js';
import { CarromGame } from '../arcade/carrom/game.js';
import { ROUND_SECONDS, TOTAL_WHITE, TOTAL_BLACK } from '../arcade/carrom/rules.js';
import { sound, useMuted, setMuted, haptic } from '../fx/index.js';
import './ArcadeCarrom.css';

const BEST_KEY = 'playnest.carrom.best';
const readBest = () => { try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch { return 0; } };
const writeBest = (v) => { try { localStorage.setItem(BEST_KEY, String(v)); } catch { /* ignore */ } };
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const INITIAL_HUD = { score: 0, time: ROUND_SECONDS, white: 0, black: 0, queen: 'board', state: 'idle' };

function shareTextFor(r) {
  const lines = [
    `🎯 PlayNest Carrom Strike — ${r.score} points`,
    `⚪ ${r.white}/${TOTAL_WHITE}  ⚫ ${r.black}/${TOTAL_BLACK}${r.queen ? '  👑 Queen covered' : ''}`,
  ];
  if (r.bestCombo >= 2) lines.push(`🔥 Best combo: ${r.bestCombo} coins in one shot`);
  lines.push(`Can you beat it? ${siteUrl()}/arcade/carrom`);
  return lines.join('\n');
}

function titleFor(r) {
  if (r.cleared) return { emoji: '🏆', title: 'Board cleared!' };
  if (r.score >= 300) return { emoji: '👑', title: 'Carrom King!' };
  if (r.score >= 120) return { emoji: '🎯', title: 'Great shooting!' };
  if (r.score > 0) return { emoji: '👏', title: 'Nice round' };
  return { emoji: '🪵', title: 'Keep practising' };
}

export default function ArcadeCarrom() {
  const { celebrate, toast } = useSession() || {};
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const gameRef = useRef(null);
  const runRef = useRef(null);
  const [phase, setPhase] = useState('intro'); // intro | playing | paused | done
  const [hud, setHud] = useState(INITIAL_HUD);
  const [banner, setBanner] = useState(null);
  const [result, setResult] = useState(null);
  const [save, setSave] = useState(null); // { status: 'saving'|'saved'|'queued'|'error', progress }
  const [best, setBest] = useState(readBest);
  const [shared, setShared] = useState(false);
  const muted = useMuted();
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const onEnd = useCallback((r) => {
    setResult(r);
    setPhase('done');
    const prev = readBest();
    const isBest = r.score > prev;
    if (isBest) { writeBest(r.score); setBest(r.score); }
    setResult({ ...r, isBest, prevBest: prev });
    sound(r.score > 0 ? 'levelup' : 'whoosh');
    haptic('success');
    setSave({ status: 'saving' });
    submitArcadeScore('arcade_carrom', r.score, { queen: r.queen, pocketed: r.pocketed }, runRef.current)
      .then((res) => {
        if (res?.queued) { setSave({ status: 'queued' }); return; }
        setSave({ status: 'saved', progress: res?.progress || null });
        if (res?.progress) celebrate?.(res.progress);
      })
      .catch(() => setSave({ status: 'error' }));
  }, [celebrate]);

  // create the game once; keep it sized to its wrapper
  const cbRef = useRef({});
  cbRef.current.onEnd = onEnd;
  useEffect(() => {
    const canvas = canvasRef.current, wrap = wrapRef.current;
    const game = new CarromGame(canvas, {
      onHud: (h) => setHud(h),
      onBanner: (text, tone) => setBanner({ text, tone, key: Math.random() }),
      onEnd: (r) => cbRef.current.onEnd(r),
    });
    gameRef.current = game;
    if (import.meta.env.DEV) window.__carrom = game; // test hook (dev server only)
    const fit = () => game.resize(wrap.clientWidth);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    const onDpr = () => fit();
    window.addEventListener('resize', onDpr);
    return () => { ro.disconnect(); window.removeEventListener('resize', onDpr); game.destroy(); gameRef.current = null; };
  }, []);

  useEffect(() => {
    if (!banner) return undefined;
    const id = setTimeout(() => setBanner(null), 1800);
    return () => clearTimeout(id);
  }, [banner]);

  const start = useCallback(() => {
    runRef.current = newRunId();
    setResult(null); setSave(null); setShared(false); setBanner(null);
    setPhase('playing');
    sound('whoosh');
    gameRef.current?.start();
  }, []);

  const pause = useCallback(() => {
    if (phaseRef.current !== 'playing') return;
    gameRef.current?.pause();
    setPhase('paused');
  }, []);
  const resume = useCallback(() => {
    if (phaseRef.current !== 'paused') return;
    setPhase('playing');
    gameRef.current?.resume();
  }, []);

  // pause when the tab is hidden
  useEffect(() => {
    const onVis = () => { if (document.hidden) pause(); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [pause]);

  // keyboard
  useEffect(() => {
    const isButton = (t) => t instanceof HTMLElement && (t.tagName === 'BUTTON' || t.tagName === 'A' || t.tagName === 'INPUT');
    const down = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const p = phaseRef.current;
      if (p === 'playing') {
        if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') { e.preventDefault(); pause(); return; }
        if (isButton(e.target) && (e.key === ' ' || e.key === 'Enter')) return;
        if (gameRef.current?.key(e, true)) e.preventDefault();
      } else if (p === 'paused' && (e.key === 'Escape' || e.key === 'p' || e.key === 'P')) {
        e.preventDefault(); resume();
      } else if ((p === 'intro') && (e.key === ' ' || e.key === 'Enter') && !isButton(e.target)) {
        e.preventDefault(); start();
      }
    };
    const up = (e) => {
      if (phaseRef.current !== 'playing') return;
      if (isButton(e.target) && (e.key === ' ' || e.key === 'Enter')) return;
      if (gameRef.current?.key(e, false)) e.preventDefault();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [pause, resume, start]);

  const onShare = async () => {
    const r = await shareResult(shareTextFor(result), toast);
    if (r === 'shared' || r === 'copied') { setShared(true); setTimeout(() => setShared(false), 2000); }
  };

  const low = hud.time <= 15 && phase === 'playing';
  const timePct = Math.max(0, Math.min(1, hud.time / ROUND_SECONDS));
  const head = result ? titleFor(result) : null;
  const progress = save?.progress;

  return (
    <div className="container cr-page">
      <header className="cr-head">
        <Link to="/arcade" className="cr-back" aria-label="Back to the arcade">←</Link>
        <h1 className="cr-title">Carrom <span>Strike</span></h1>
        <div className="cr-tools">
          <button type="button" className="cr-icon-btn" onClick={() => setMuted(!muted)} aria-label={muted ? 'Unmute sound' : 'Mute sound'} aria-pressed={muted}>
            {muted ? '🔇' : '🔊'}
          </button>
          {(phase === 'playing' || phase === 'paused') && (
            <button type="button" className="cr-icon-btn" onClick={phase === 'paused' ? resume : pause} aria-label={phase === 'paused' ? 'Resume' : 'Pause'}>
              {phase === 'paused' ? '▶' : '❚❚'}
            </button>
          )}
        </div>
      </header>

      <div className="cr-hud" aria-live="off">
        <div className={`cr-timer${low ? ' is-low' : ''}`} style={{ '--p': timePct }} role="timer" aria-label={`Time left ${fmtTime(hud.time)}`}>
          <span className="cr-timer-ring" aria-hidden="true" />
          <span className="cr-timer-text mono">{fmtTime(hud.time)}</span>
        </div>
        <div className="cr-score">
          <span className="cr-score-label">Score</span>
          <span key={hud.score} className="cr-score-value">{hud.score}</span>
        </div>
        <div className="cr-counts">
          <span className="cr-count" title="White coins pocketed"><i className="cr-coin white" aria-hidden="true" />{hud.white}<small>/{TOTAL_WHITE}</small></span>
          <span className="cr-count" title="Black coins pocketed"><i className="cr-coin black" aria-hidden="true" />{hud.black}<small>/{TOTAL_BLACK}</small></span>
          <span className={`cr-count cr-queen is-${hud.queen}`} title={hud.queen === 'covered' ? 'Queen covered' : hud.queen === 'pending' ? 'Queen pocketed — cover her!' : 'Queen on the board'}>
            <i className="cr-coin queen" aria-hidden="true" />{hud.queen === 'covered' ? '✓' : hud.queen === 'pending' ? '!' : '–'}
          </span>
        </div>
      </div>

      <div className="cr-stage">
        <div className="cr-board" ref={wrapRef}>
          <canvas ref={canvasRef} className="cr-canvas" aria-label="Carrom board. Drag the striker along your baseline, then pull back and release to shoot." role="img" />

          {banner && (
            <div key={banner.key} className={`cr-banner tone-${banner.tone}`} role="status">{banner.text}</div>
          )}

          {phase === 'intro' && (
            <div className="cr-overlay">
              <div className="cr-panel pop">
                <div className="cr-panel-badge" aria-hidden="true">🎯</div>
                <h2>Carrom Strike</h2>
                <p className="cr-how">
                  <strong>How to play:</strong> slide the striker along your baseline, then <strong>pull back and release</strong> to shoot.
                  Pocket as many coins as you can in 2 minutes.
                </p>
                <ul className="cr-points">
                  <li><i className="cr-coin white" aria-hidden="true" /> 20</li>
                  <li><i className="cr-coin black" aria-hidden="true" /> 10</li>
                  <li><i className="cr-coin queen" aria-hidden="true" /> 50 + cover 50</li>
                  <li>🔥 2+ in one shot ×2</li>
                </ul>
                <button type="button" className="btn cr-play" onClick={start} autoFocus>▶ Play</button>
                {best > 0 && <p className="muted small cr-best">Your best: <strong>{best}</strong></p>}
              </div>
            </div>
          )}

          {phase === 'paused' && (
            <div className="cr-overlay">
              <div className="cr-panel pop">
                <h2>Paused</h2>
                <p className="muted">The clock is stopped.</p>
                <button type="button" className="btn cr-play" onClick={resume} autoFocus>▶ Resume</button>
                <button type="button" className="btn ghost small" onClick={start}>Restart round</button>
              </div>
            </div>
          )}

          {phase === 'done' && result && (
            <div className="cr-overlay is-end">
              <section className="cr-panel cr-result" aria-labelledby="cr-result-title">
                <div className="cr-result-head">
                  <div className="cr-result-emoji" aria-hidden="true">{head.emoji}</div>
                  <div>
                    <h2 id="cr-result-title">{head.title}</h2>
                    <div className="cr-result-score"><strong>{result.score}</strong> points{result.isBest && result.score > 0 && <span className="badge gold">New best!</span>}</div>
                  </div>
                </div>
                <dl className="cr-stats">
                  <div><dt>Coins</dt><dd>{result.pocketed}</dd></div>
                  <div><dt>Queen</dt><dd>{result.queen ? '👑' : '—'}</dd></div>
                  <div><dt>Best combo</dt><dd>{result.bestCombo >= 2 ? `×${result.bestCombo}` : '—'}</dd></div>
                  <div><dt>Best</dt><dd>{Math.max(best, result.score)}</dd></div>
                </dl>
                <p className="muted small cr-save" aria-live="polite">
                  {result.queenLost && 'Queen not covered in time (−50). '}
                  {save?.status === 'saving' && 'Saving score…'}
                  {save?.status === 'saved' && (progress ? `Saved · +${progress.xpGained} XP` : 'Saved')}
                  {save?.status === 'queued' && 'Saved on this device — it will sync shortly.'}
                  {save?.status === 'error' && 'Could not save this score.'}
                </p>
                <div className="cr-actions">
                  <button type="button" className="btn accent" onClick={onShare}>{shared ? 'Copied ✓' : 'Share'}</button>
                  <button type="button" className="btn" onClick={start} autoFocus>Play again</button>
                </div>
                <Link to="/arcade" className="cr-more small">More arcade games →</Link>
              </section>
            </div>
          )}
        </div>
      </div>

      <p className="cr-hint muted small">
        {phase === 'playing' && hud.state === 'place' && 'Drag along the baseline to place · pull back anywhere and release to shoot'}
        {phase !== 'playing' && <span className="cr-kb">Keyboard: ← → move · ↑ ↓ aim · hold Space to power up · P to pause</span>}
      </p>
    </div>
  );
}
