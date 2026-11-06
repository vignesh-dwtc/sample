import { useEffect, useRef, useState } from 'react';
import ResultPanel from '../../games/ResultPanel.jsx';
import CompassDial from './CompassDial.jsx';
import { useScoreSubmit } from './submitQueue.js';
import {
  absDiff, bestTarget, describeBody, directionName, finalScore, nearestPlace, roundScore, shareTextFor, verdict, warmth,
} from './skyLogic.js';
import { roundTargets, HOLD_MS, ZONE_DEG } from './gameLogic.js';

const ROUNDS = 3;
const NAMES = { sun: 'Sun', moon: 'Moon' };

/**
 * "Find the Sun / Moon" game.
 * sky: live sky data (sun, moon), heading: { heading, status, request }, pos: { lat, lon }.
 * onActive(bool): tells the page a game is running (so it can hide its own dial).
 */
export default function SkyGame({ sky, heading, pos, celebrate, onActive }) {
  const [phase, setPhase] = useState('idle'); // idle | play | reveal | done
  const [first, setFirst] = useState(null);
  const [mode, setMode] = useState(null); // 'compass' | 'tap'
  const [targets, setTargets] = useState([]);
  const [rounds, setRounds] = useState([]);
  const [guess, setGuess] = useState(null);
  const [hold, setHold] = useState(0);
  const { state: submitState, submit } = useScoreSubmit(celebrate);
  const cardRef = useRef(null);
  const nextRef = useRef(null);
  useEffect(() => { if (phase === 'reveal') nextRef.current?.focus({ preventScroll: true }); }, [phase, rounds.length]);
  // Bring the round's dial into view at the start of every round.
  useEffect(() => {
    if (phase !== 'play') return undefined;
    const id = setTimeout(() => {
      const el = cardRef.current;
      if (!el || el.getBoundingClientRect().top >= 0 && el.getBoundingClientRect().top < 120) return;
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      el.scrollIntoView?.({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
    }, 80);
    return () => clearTimeout(id);
  }, [phase, rounds.length]);

  const sunUp = sky.sun.altitude > -0.833, moonUp = sky.moon.altitude > 0;
  const defaultFirst = sunUp ? 'sun' : moonUp ? 'moon' : 'sun';
  const chosen = first || defaultFirst;
  const compassOk = heading.status === 'active' && heading.heading != null;
  const playMode = mode || (compassOk ? 'compass' : 'tap');

  const idx = rounds.length - (phase === 'reveal' ? 1 : 0);
  const target = targets[Math.min(idx, ROUNDS - 1)];
  const body = target ? sky[target] : null;
  const isUp = (t) => (t === 'sun' ? sky.sun.altitude > -0.833 : sky.moon.altitude > 0);

  useEffect(() => { onActive?.(phase === 'play' || phase === 'reveal'); }, [phase, onActive]);

  const start = () => {
    setTargets(roundTargets(chosen, ROUNDS));
    setRounds([]); setGuess(null); setHold(0);
    setMode(compassOk && playMode === 'compass' ? 'compass' : 'tap');
    setPhase('play');
  };

  const lock = (g) => {
    if (phase !== 'play' || g == null || !body) return;
    const err = absDiff(g, body.azimuth);
    const r = { body: target, guess: g, az: body.azimuth, alt: body.altitude, error: err, score: roundScore(err) };
    setGuess(g); setHold(0);
    setRounds((rs) => [...rs, r]);
    setPhase('reveal');
  };

  // Compass mode: live warmth + hold-to-lock.
  const headingRef = useRef(null);
  headingRef.current = heading.heading;
  const lockRef = useRef(lock);
  lockRef.current = lock;
  const azRef = useRef(null);
  azRef.current = body?.azimuth ?? null;
  useEffect(() => {
    if (phase !== 'play' || mode !== 'compass') return undefined;
    let since = null;
    const id = setInterval(() => {
      const h = headingRef.current, az = azRef.current;
      if (h == null || az == null) { since = null; setHold(0); return; }
      if (absDiff(h, az) <= ZONE_DEG) {
        since ??= Date.now();
        const p = Math.min(1, (Date.now() - since) / HOLD_MS);
        setHold(p);
        if (p >= 1) { clearInterval(id); lockRef.current(h); }
      } else { since = null; setHold(0); }
    }, 100);
    return () => clearInterval(id);
  }, [phase, mode, idx]);

  const next = () => {
    if (rounds.length >= ROUNDS) {
      const score = finalScore(rounds);
      setPhase('done');
      submit(score, { target: bestTarget(rounds), rounds: rounds.map((r) => r.score), mode });
    } else { setGuess(null); setPhase('play'); }
  };

  // ---------- idle ----------
  if (phase === 'idle') {
    return (
      <section className="card sk-card sk-game-intro" aria-labelledby="sk-game-h">
        <h2 id="sk-game-h">🎯 Find the Sun &amp; Moon</h2>
        <p className="muted">3 rounds. Point to where the {NAMES[chosen].toLowerCase()} really is — even through a roof, a cloud or the floor! Score up to 100 per round.</p>
        <div className="sk-choice" role="radiogroup" aria-label="Start with">
          {['sun', 'moon'].map((t) => (
            <button key={t} type="button" role="radio" aria-checked={chosen === t} className={`sk-choice-btn${chosen === t ? ' is-on' : ''}`} onClick={() => setFirst(t)}>
              <span aria-hidden="true">{t === 'sun' ? '☀️' : sky.moon.emoji}</span> {NAMES[t]}
              <span className="sk-choice-sub">{isUp(t) ? 'in the sky' : 'below the horizon'}</span>
            </button>
          ))}
        </div>
        {!isUp(chosen) && <p className="sk-twist">🌏 Twist: the {NAMES[chosen].toLowerCase()} is below the horizon — point where it is <strong>under your feet</strong>.</p>}
        <div className="sk-choice" role="radiogroup" aria-label="How to play">
          <button type="button" role="radio" aria-checked={playMode === 'compass'} disabled={!compassOk}
            className={`sk-choice-btn${playMode === 'compass' ? ' is-on' : ''}`} onClick={() => setMode('compass')}>
            <span aria-hidden="true">📱</span> Point phone
            <span className="sk-choice-sub">{compassOk ? 'uses compass' : 'no compass yet'}</span>
          </button>
          <button type="button" role="radio" aria-checked={playMode === 'tap'}
            className={`sk-choice-btn${playMode === 'tap' ? ' is-on' : ''}`} onClick={() => setMode('tap')}>
            <span aria-hidden="true">👆</span> Tap the dial
            <span className="sk-choice-sub">works anywhere</span>
          </button>
        </div>
        {heading.status === 'needs-permission' && (
          <button type="button" className="btn secondary block" onClick={heading.request}>🧭 Enable compass to point your phone</button>
        )}
        <button type="button" className="btn block sk-start" onClick={start}>Play 3 rounds</button>
      </section>
    );
  }

  // ---------- done ----------
  if (phase === 'done') {
    const score = finalScore(rounds);
    const v = verdict(score);
    const place = nearestPlace(pos?.lat, pos?.lon);
    const origin = typeof location !== 'undefined' ? location.origin : '';
    return (
      <div className="stack">
        <ResultPanel game="travel_sky" emoji={v.emoji} title={`${score}/100 — ${v.text}`}
          subtitle={`Sky Compass · ${mode === 'compass' ? 'pointing the phone' : 'tapping the dial'}`}
          stats={rounds.map((r, i) => ({ label: `Round ${i + 1} ${r.body === 'sun' ? '☀️' : '🌙'}`, value: `${r.score} (${Math.round(r.error)}° off)` }))}
          progress={submitState.progress} shareText={shareTextFor(score, rounds, place, origin)} countdown={false}>
          <SubmitNote state={submitState} />
          <button type="button" className="btn block" onClick={() => { setPhase('idle'); setRounds([]); }}>Play again</button>
        </ResultPanel>
      </div>
    );
  }

  // ---------- play / reveal ----------
  const last = rounds[rounds.length - 1];
  const below = body.altitude < (target === 'sun' ? -0.833 : 0);
  const live = mode === 'compass' && phase === 'play' ? heading.heading : null;
  const err = live != null ? absDiff(live, body.azimuth) : null;
  const w = err != null ? warmth(err) : null;
  const emoji = target === 'sun' ? '☀️' : sky.moon.emoji;
  const shownGuess = phase === 'reveal' ? last.guess : mode === 'tap' ? guess : null;

  return (
    <section ref={cardRef} className="card sk-card sk-game" aria-labelledby="sk-round-h">
      <div className="sk-game-head">
        <h2 id="sk-round-h">Round {Math.min(idx + 1, ROUNDS)} of {ROUNDS}: find the {NAMES[target].toLowerCase()} <span aria-hidden="true">{emoji}</span></h2>
        <div className="sk-pips" aria-hidden="true">
          {Array.from({ length: ROUNDS }, (_, i) => <span key={i} className={`sk-pip${i < rounds.length ? ' is-done' : i === idx ? ' is-now' : ''}`} />)}
        </div>
      </div>
      {below && <p className="sk-twist">🌏 It’s below the horizon — point where it is <strong>under your feet</strong>.</p>}

      <div className="sk-dial-wrap">
        <CompassDial
          rotation={mode === 'compass' && heading.heading != null ? heading.heading : 0}
          pointer={mode === 'compass'}
          sunAlt={sky.sun.altitude}
          guess={shownGuess}
          onPick={phase === 'play' && mode === 'tap' ? setGuess : undefined}
          warmth={w}
          hold={hold}
          reveal={phase === 'reveal' ? { az: last.az, alt: last.alt, emoji } : null}
          label={phase === 'play' && mode === 'tap' ? `Tap or drag where the ${NAMES[target].toLowerCase()} is` : 'Sky compass'}
        />
      </div>

      {phase === 'play' && mode === 'compass' && (
        <div className="sk-game-live" aria-live="polite">
          <p className={`sk-warm-label sk-w-${w?.key || 'none'}`}>{w ? w.label : 'Waiting for compass…'}</p>
          <p className="muted small">Hold steady within {ZONE_DEG}° for 3 s to lock in. Keep the phone flat, top pointing out.</p>
          <div className="row sk-game-btns">
            <button type="button" className="btn secondary" disabled={live == null} onClick={() => lock(live)}>Lock here</button>
            <button type="button" className="btn ghost" onClick={() => { setMode('tap'); setGuess(null); }}>Tap mode instead</button>
          </div>
        </div>
      )}
      {phase === 'play' && mode === 'tap' && (
        <div className="sk-game-live">
          <p className="muted small">{guess == null
            ? 'Tap or drag on the dial towards where you think it is. North is up.'
            : `Your pick: ${Math.round(guess)}° (${directionName(guess)})`}</p>
          <button type="button" className="btn block" disabled={guess == null} onClick={() => lock(guess)}>Lock in my guess</button>
        </div>
      )}
      {phase === 'reveal' && (
        <div className="sk-reveal pop" aria-live="polite">
          <div className="sk-reveal-score"><span aria-hidden="true">{verdict(last.score).emoji}</span> <strong className="mono">{last.score}</strong><span className="muted">/100</span></div>
          <p><strong>{verdict(last.score).text}</strong> You were {Math.round(last.error)}° off.</p>
          <p className="muted small">{describeBody(NAMES[last.body], last.az, last.alt)} ({Math.round(last.az)}°, {Math.round(last.alt)}° {last.alt >= 0 ? 'up' : 'below'}).</p>
          <button type="button" className="btn block" onClick={next} ref={nextRef}>{rounds.length >= ROUNDS ? 'See my score' : 'Next round'}</button>
        </div>
      )}
      {phase === 'play' && (
        <button type="button" className="btn ghost small sk-quit" onClick={() => setPhase('idle')}>Quit game</button>
      )}
    </section>
  );
}

function SubmitNote({ state }) {
  const map = {
    saving: ['', 'Saving your score…'],
    saved: ['ok', 'Score saved ✓'],
    queued: ['', state.message],
    waiting: ['', state.message],
    error: ['error', `Couldn’t save the score: ${state.message}`],
  };
  const m = map[state.status];
  if (!m) return null;
  return <p className={`sk-submit-note ${m[0]}`} role="status">{m[1]}</p>;
}

