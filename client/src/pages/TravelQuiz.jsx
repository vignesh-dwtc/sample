import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { TravelShell, useTravel, NeedsLocation } from '../travel/TravelShell.jsx';
import { useSession } from '../lib/session.jsx';
import ResultPanel from '../games/ResultPanel.jsx';
import { formatKm, compassName } from '../travel/geo.js';
import { fetchNearbyPlaces } from '../travel/places/wiki.js';
import { CITIES } from '../travel/places/cities.js';
import { buildQuiz, scoreAnswer, totalScore, verdict, QUESTION_COUNT } from '../travel/places/quiz.js';
import { useQuizSubmit } from '../travel/places/submit.js';
import './TravelQuiz.css';

const LOAD_TIMEOUT_MS = 15000;
const GRID8 = ['NW', 'N', 'NE', 'W', null, 'E', 'SW', 'S', 'SE'];
const GRID4 = [null, 'N', null, 'W', null, 'E', null, 'S', null];
const DEG = { N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315 };

export default function TravelQuiz() {
  return (
    <TravelShell title="Guess Where?" icon="🧭">
      <Quiz />
    </TravelShell>
  );
}

/** Best position we have: live GPS, else the last recorded trip point. */
function useBestPosition() {
  const { position, trip } = useTravel();
  if (position) return { lat: position.lat, lon: position.lon, live: true };
  const last = trip?.points?.[trip.points.length - 1];
  return last ? { lat: last[0], lon: last[1], live: false } : null;
}

function Quiz() {
  const { online } = useTravel();
  const here = useBestPosition();
  const { celebrate } = useSession() || {};
  const { state: saveState, submit } = useQuizSubmit(celebrate);
  const [phase, setPhase] = useState('intro'); // intro | loading | play | done
  const [quiz, setQuiz] = useState(null); // { questions, source, note, from }
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState([]); // [{ choice, points }]
  const loadRef = useRef(null);
  const fromRef = useRef(null);
  const submittedRef = useRef(null);

  useEffect(() => () => loadRef.current?.abort(), []);

  const startCities = useCallback((from, note) => {
    loadRef.current?.abort();
    loadRef.current = null;
    const questions = buildQuiz(CITIES, from, Date.now());
    setQuiz({ questions, source: 'cities', note, from });
    setIdx(0); setAnswers([]); setPhase('play');
  }, []);

  const start = useCallback(async () => {
    if (!here) return;
    const from = { lat: here.lat, lon: here.lon }; // snapshot: he may be moving
    fromRef.current = from;
    if (navigator.onLine === false) { startCities(from, 'You’re offline, so this round uses big cities instead of nearby places.'); return; }
    setPhase('loading');
    const ctrl = new AbortController();
    loadRef.current?.abort();
    loadRef.current = ctrl;
    const timer = setTimeout(() => ctrl.abort(), LOAD_TIMEOUT_MS);
    try {
      const { places, source } = await fetchNearbyPlaces(from, { signal: ctrl.signal });
      if (loadRef.current !== ctrl) return; // skipped / left the page
      const questions = buildQuiz(places, from, Date.now());
      if (questions.length < QUESTION_COUNT) {
        startCities(from, 'Not many landmarks around here, so this round uses big cities.');
        return;
      }
      loadRef.current = null;
      setQuiz({
        questions, source: 'wiki', from,
        note: `${places.length} real places within about 10 km of you${source === 'cache' ? ' (saved earlier)' : ''}.`,
      });
      setIdx(0); setAnswers([]); setPhase('play');
    } catch {
      if (loadRef.current !== ctrl) return; // replaced by a newer start / skip
      startCities(from, 'Couldn’t reach Wikipedia, so this round uses big cities instead.');
    } finally { clearTimeout(timer); }
  }, [here, startCities]);

  const answer = (choice) => {
    if (answers[idx]) return;
    const q = quiz.questions[idx];
    setAnswers((a) => { const n = [...a]; n[idx] = { choice, points: scoreAnswer(q, choice) }; return n; });
  };

  const next = () => {
    if (idx + 1 < quiz.questions.length) { setIdx(idx + 1); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    if (submittedRef.current === quiz) return; // double tap on "See my score"
    submittedRef.current = quiz;
    const pts = answers.map((a) => a?.points || 0);
    const score = totalScore(pts, quiz.questions.length);
    setPhase('done');
    window.scrollTo({ top: 0 });
    submit(score, { source: quiz.source, correct: answers.filter((a) => a?.points === 1).length, questions: quiz.questions.length });
  };

  // Bring the explanation into view on small screens after answering.
  const revealRef = useRef(null);
  const answered = !!answers[idx];
  useEffect(() => {
    if (answered && revealRef.current) revealRef.current.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  }, [answered, idx]);

  if (phase === 'intro') {
    if (!here) return <NeedsLocation why="Guess Where? asks about places around you, so it needs your location." />;
    return (
      <section className="card stack tq-intro pop">
        <div className="tq-intro-art" aria-hidden="true">🗺️</div>
        <h2>How well do you know where you are?</h2>
        <p className="muted">
          Six quick questions about real places near you: which is closest, which way it is and how far.
          {online ? ' Places come live from Wikipedia.' : ' You’re offline, so you’ll get a world-cities round — it still works!'}
        </p>
        {!here.live && <p className="small muted">📍 Using your last recorded position. Turn on GPS for a fresher fix.</p>}
        <button type="button" className="btn block tq-big" onClick={start}>Start quiz</button>
        <button type="button" className="btn secondary block" onClick={() => startCities({ lat: here.lat, lon: here.lon }, 'World-cities round: big Indian and world cities.')}>
          🌏 Play the world-cities round
        </button>
      </section>
    );
  }

  if (phase === 'loading') {
    return (
      <section className="card stack center tq-loading" aria-busy="true" aria-live="polite">
        <span className="tq-spinner" aria-hidden="true" />
        <p>Finding real places near you…</p>
        <button type="button" className="btn secondary" onClick={() => startCities(fromRef.current, 'World-cities round: big Indian and world cities.')}>
          Skip — play world cities
        </button>
      </section>
    );
  }

  const qs = quiz.questions;
  const points = answers.reduce((s, a) => s + (a?.points || 0), 0);

  if (phase === 'done') {
    const score = totalScore(answers.map((a) => a?.points || 0), qs.length);
    const v = verdict(score);
    const correct = answers.filter((a) => a?.points === 1).length;
    const squares = answers.map((a) => (a?.points === 1 ? '🟩' : a?.points ? '🟨' : '⬛')).join('');
    return (
      <ResultPanel
        game="travel_quiz"
        emoji={v.emoji}
        title={v.title}
        subtitle={quiz.source === 'wiki' ? 'Nearby places round' : 'World-cities round'}
        stats={[{ label: 'Score', value: `${score}/100` }, { label: 'Correct', value: `${correct}/${qs.length}` }]}
        progress={saveState.progress}
        shareText={`🧭 PlayNest Guess Where? ${score}/100\n${squares}\n${location.origin}/travel/quiz`}
        countdown={false}
      >
        <SaveStatus state={saveState} />
        <div className="tq-done-actions">
          <button type="button" className="btn" onClick={() => { setPhase('intro'); setQuiz(null); }}>Play again</button>
          <Link to="/travel" className="btn secondary">Back to Travel</Link>
        </div>
      </ResultPanel>
    );
  }

  const q = qs[idx];
  const a = answers[idx];
  return (
    <section className="stack tq-play">
      <div className="tq-head">
        <span className="badge">Question {idx + 1}/{qs.length}</span>
        <div className="tq-dots" aria-hidden="true">
          {qs.map((_, i) => (
            <span key={i} className={`tq-dot${i === idx ? ' cur' : ''}${answers[i] ? (answers[i].points === 1 ? ' ok' : answers[i].points ? ' half' : ' bad') : ''}`} />
          ))}
        </div>
        <span className="badge gold">⭐ {Number.isInteger(points) ? points : points.toFixed(1)}</span>
      </div>
      {idx === 0 && !a && quiz.note && <p className="small muted tq-note">{quiz.note}</p>}

      <div className="card tq-question pop" key={idx}>
        <div className="tq-qicon" aria-hidden="true">{q.icon}</div>
        <h2 className="tq-prompt">{q.prompt}</h2>
        {q.type === 'direction'
          ? <CompassChoices q={q} a={a} onPick={answer} />
          : <ListChoices q={q} a={a} onPick={answer} />}
      </div>

      {a && (
        <div ref={revealRef} className={`card tq-reveal pop ${a.points === 1 ? 'ok' : a.points ? 'half' : 'bad'}`} role="status">
          <div className="tq-reveal-head">
            <strong>{a.points === 1 ? '✅ Correct!' : a.points ? '🟡 Close — half a point' : '❌ Not quite'}</strong>
            <DirectionArrow deg={q.subject.deg} />
          </div>
          <p>{q.explain}</p>
          <div className="tq-reveal-actions">
            {q.subject.url && (
              <a className="btn secondary tq-wiki" href={q.subject.url} target="_blank" rel="noopener noreferrer">
                Open on Wikipedia ↗
              </a>
            )}
            <button type="button" className="btn tq-next" onClick={next}>
              {idx + 1 < qs.length ? 'Next question →' : 'See my score'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function ListChoices({ q, a, onPick }) {
  const byId = useMemo(() => Object.fromEntries((q.places || []).map((p) => [p.id, p])), [q]);
  return (
    <div className="tq-options">
      {q.options.map((o) => {
        const state = !a ? '' : o.id === q.answer ? ' correct' : o.id === a.choice ? ' wrong' : ' dim';
        const p = byId[o.id];
        return (
          <button key={o.id} type="button" className={`tq-option${state}`} onClick={() => onPick(o.id)} disabled={!!a} aria-pressed={a?.choice === o.id}>
            <span className="tq-option-label">{o.label}</span>
            {a && p && <span className="tq-option-km mono">{formatKm(p.km)}</span>}
          </button>
        );
      })}
    </div>
  );
}

function CompassChoices({ q, a, onPick }) {
  const grid = q.compass === 4 ? GRID4 : GRID8;
  return (
    <div className={`tq-compass${q.compass === 4 ? ' four' : ''}`} role="group" aria-label="Compass directions">
      {grid.map((pt, i) => {
        if (i === 4) return <div key="you" className="tq-compass-you" aria-hidden="true">📍<span>You</span></div>;
        if (!pt) return <div key={i} className="tq-compass-gap" />;
        const state = !a ? '' : pt === q.answer ? ' correct' : pt === a.choice ? ' wrong' : ' dim';
        return (
          <button key={pt} type="button" className={`tq-compass-btn${state}`} onClick={() => onPick(pt)} disabled={!!a}
            aria-label={compassName(DEG[pt])}>
            {pt}
          </button>
        );
      })}
    </div>
  );
}

function DirectionArrow({ deg }) {
  if (!Number.isFinite(deg)) return null;
  return (
    <span className="tq-arrow" title={`${Math.round(deg)}° from north`} aria-hidden="true">
      <span className="tq-arrow-n">N</span>
      <span className="tq-arrow-needle" style={{ transform: `rotate(${deg}deg)` }}>↑</span>
    </span>
  );
}

function SaveStatus({ state }) {
  const map = {
    saving: ['', '⏳ Saving your score…'],
    saved: ['ok', '✅ Score saved'],
    waiting: ['', `⏳ ${state.message}`],
    queued: ['', `📴 ${state.message}`],
    error: ['bad', `⚠️ ${state.message}`],
  };
  const m = map[state.status];
  if (!m) return null;
  return <p className={`small tq-save ${m[0]}`} role="status">{m[1]}</p>;
}
