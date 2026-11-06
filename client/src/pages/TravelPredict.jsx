import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { TravelShell, NeedsLocation, useTravel } from '../travel/TravelShell.jsx';
import { distanceKm, formatKm, formatTime, formatDuration } from '../travel/geo.js';
import { useSession } from '../lib/session.jsx';
import {
  ROUND_MINUTES, PRACTICE_MINUTES, EXPERT_BONUS, STILL_KMH, finalPredictScore, predictScore, windowDistance, predictFeedback,
  recentSpeedKmh, sliderMaxKm, countdownLabel, nextClockTime, arrivalScore, arrivalFeedback, arrivalTimeFromPoints, ARRIVE_RADIUS_KM,
} from '../travel/fun/predictLogic.js';
import { queueScore, useScoreQueue } from '../travel/fun/scoreQueue.js';
import './TravelPredict.css';

const RKEY = 'playnest.predict.round';
const HKEY = 'playnest.predict.history';
const AKEY = 'playnest.predict.arrival';
const SKEY = 'playnest.predict.setup';
const load = (k, fb = null) => { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } };
const store = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch { /* blocked */ } };
const uid = () => Math.random().toString(36).slice(2, 10);

function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(id); }, [ms]);
  return now;
}

export default function TravelPredict() {
  return (
    <TravelShell title="Distance Predictor" icon="🔮">
      <Predictor />
    </TravelShell>
  );
}

function Predictor() {
  const { position, geoStatus, trip } = useTravel();
  const { celebrate } = useSession() || {};
  const now = useNow();
  const [round, setRoundState] = useState(() => load(RKEY));
  const [arrival, setArrivalState] = useState(() => load(AKEY));
  const [history, setHistory] = useState(() => load(HKEY, []));
  const setRound = (r) => { store(RKEY, r); setRoundState(r); };
  const setArrival = (a) => { store(AKEY, a); setArrivalState(a); };
  const [saved, setSaved] = useState({});

  const onResult = useCallback(({ item, progress, ok, error }) => {
    if (item.game !== 'travel_predict') return;
    setSaved((s) => ({ ...s, [item.key]: ok ? 'saved' : `error:${error}` }));
    if (ok) celebrate?.(progress);
  }, [celebrate]);
  const q = useScoreQueue(onResult);

  const tripPoints = trip?.points || [];
  const recent = useRef([]);
  useEffect(() => {
    if (!position || (position.accuracy && position.accuracy > 300)) return;
    const at = position.at || Date.now();
    recent.current = [...recent.current.filter((p) => p[2] > at - 300000 && p[2] < at), [position.lat, position.lon, at]].slice(-60);
  }, [position]);

  // Record our own track while a round runs (covers players without an active trip).
  useEffect(() => {
    if (!position || !round || round.status !== 'running') return;
    if (position.accuracy && position.accuracy > 300) return;
    const track = round.track || [];
    const last = track[track.length - 1];
    const at = position.at || Date.now();
    if (at < round.startAt || at > round.endAt + 90000) return;
    if (last && at - last[2] < 5000 && distanceKm({ lat: last[0], lon: last[1] }, position) < 0.03) return;
    setRound({ ...round, startPos: round.startPos || { lat: position.lat, lon: position.lon, at }, track: [...track, [position.lat, position.lon, at]].slice(-600) });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position]);

  const pointsFor = (r) => {
    const fromTrip = tripPoints.filter((p) => p[2] >= r.startAt && p[2] <= r.endAt);
    return fromTrip.length >= (r.track || []).length ? tripPoints : (r.track || []);
  };

  // Resolve a finished round.
  useEffect(() => {
    if (!round || round.status !== 'running' || now < round.endAt) return;
    const pts = pointsFor(round);
    const latest = position && position.at && position.at - round.endAt < 90000 && position.at >= round.startAt ? position : null;
    const res = windowDistance({ points: pts, startAt: round.startAt, endAt: round.endAt, startPos: round.startPos, endPos: latest && !pts.some((p) => p[2] > round.endAt - 20000) ? latest : null });
    const actualKm = Math.round(res.km * 100) / 100;
    const noData = res.method === 'none';
    // Standing still (avg < STILL_KMH) would make "predict 0 km" a free 100 — such rounds aren't scored.
    const still = !noData && actualKm / (round.minutes / 60) < STILL_KMH;
    const score = noData ? 0 : finalPredictScore(round.predictedKm, actualKm, round.expert);
    const done = { ...round, status: 'done', actualKm, method: res.method, score, noData, still, base: noData ? 0 : predictScore(round.predictedKm, actualKm), track: [] };
    setRound(done);
    if (!round.practice && !noData && !still) queueScore('travel_predict', score, { kind: 'distance', minutes: round.minutes, predictedKm: round.predictedKm, actualKm, expert: !!round.expert }, `predict:${round.id}`);
    const h = [{ id: round.id, at: round.endAt, minutes: round.minutes, predictedKm: round.predictedKm, actualKm, score, practice: !!round.practice, noData, still }, ...history].slice(0, 8);
    store(HKEY, h); setHistory(h);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, round]);

  // Resolve an arrival guess when within 1 km of the destination.
  const dest = trip?.destination;
  const destKm = dest && position ? distanceKm(position, dest) : null;
  useEffect(() => {
    if (!arrival || arrival.status !== 'waiting' || !dest || arrival.tripId !== trip?.id) return;
    let at = arrivalTimeFromPoints(tripPoints, dest, arrival.guessedAt);
    if (!at && destKm != null && destKm <= ARRIVE_RADIUS_KM) at = position.at || Date.now();
    if (!at) return;
    const score = arrivalScore(arrival.predictedAt, at, arrival.guessedAt);
    setArrival({ ...arrival, status: 'done', actualAt: at, score });
    queueScore('travel_predict', score, { kind: 'arrival', errorMin: Math.round(Math.abs(at - arrival.predictedAt) / 60000) }, `arrive:${arrival.id}`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrival, destKm, tripPoints.length]);

  const gpsOff = !position && geoStatus !== 'watching' && geoStatus !== 'prompt';
  const gpsSpeed = position?.speed != null && position.speed >= 0 ? position.speed * 3.6 : null;
  const trackSpeed = recentSpeedKmh(recent.current, now, 180000) ?? recentSpeedKmh(tripPoints, now, 180000);
  const speedKmh = gpsSpeed ?? trackSpeed;
  const moving = speedKmh != null && speedKmh >= STILL_KMH;

  return (
    <div className="pd-wrap stack">
      {gpsOff && <NeedsLocation why="The predictor measures how far you really travel using GPS (no internet needed)." />}
      {round?.status === 'running' && <RunningRound round={round} now={now} points={pointsFor(round)} position={position} onCancel={() => setRound(null)} />}
      {round?.status === 'done' && <RoundResult round={round} saveState={saved[`predict:${round.id}`]} queue={q} onAgain={() => setRound(null)} />}
      {!round && (
        <SetupRound disabled={gpsOff} position={position} speedKmh={speedKmh} moving={moving}
          onStart={(cfg) => {
            const t = Date.now();
            setRound({ id: uid(), status: 'running', ...cfg, startAt: t, endAt: t + cfg.minutes * 60000,
              startPos: position ? { lat: position.lat, lon: position.lon, at: position.at || t } : null,
              track: position ? [[position.lat, position.lon, t]] : [] });
          }} />
      )}
      <ArrivalGuess trip={trip} dest={dest} destKm={destKm} speedKmh={speedKmh} arrival={arrival} setArrival={setArrival} now={now} saveState={arrival && saved[`arrive:${arrival.id}`]} />
      {history.length > 0 && <History items={history} />}
    </div>
  );
}

function SetupRound({ disabled, position, speedKmh, moving, onStart }) {
  const init = load(SKEY, {});
  const [minutes, setMinutes] = useState(ROUND_MINUTES.includes(init.minutes) ? init.minutes : 10);
  const [expert, setExpert] = useState(!!init.expert);
  const [km, setKm] = useState('');
  const max = sliderMaxKm(minutes, speedKmh && speedKmh > 5 ? speedKmh : 60);
  const val = km === '' ? null : Number(km);
  const valid = val != null && Number.isFinite(val) && val >= 0 && val <= 2000;
  useEffect(() => { store(SKEY, { minutes, expert }); }, [minutes, expert]);

  const start = (practice) => {
    if (!valid) return;
    onStart({ minutes: practice ? PRACTICE_MINUTES : minutes, predictedKm: Math.round(val * 100) / 100, expert, practice, hintKmh: expert ? null : speedKmh });
  };

  return (
    <section className="card stack pd-setup" aria-labelledby="pd-q">
      <h2 id="pd-q" className="pd-h">How far will you go in the next…</h2>
      <div className="pd-chips" role="radiogroup" aria-label="Round length">
        {ROUND_MINUTES.map((m) => (
          <button key={m} type="button" role="radio" aria-checked={m === minutes} className={`pd-chip ${m === minutes ? 'on' : ''}`} onClick={() => setMinutes(m)}>
            {m} min
          </button>
        ))}
      </div>

      {expert ? (
        <div className="pd-hint expert">🕶️ Expert mode: speed hidden · +{EXPERT_BONUS} bonus on any score</div>
      ) : (
        <div className="pd-hint">
          <span className="pd-hint-big">{speedKmh == null ? '—' : `${Math.round(speedKmh)} km/h`}</span>
          <span className="muted small">{speedKmh == null ? (position ? 'Measuring your speed…' : 'Speed appears once GPS is on') : 'current speed'}</span>
        </div>
      )}
      <label className="pd-toggle">
        <input type="checkbox" checked={expert} onChange={(e) => setExpert(e.target.checked)} />
        <span>Expert mode (hide speed, +{EXPERT_BONUS} points)</span>
      </label>

      <div className="pd-input-row">
        <input className="input pd-km" type="number" inputMode="decimal" min="0" max="2000" step="0.1" placeholder="0.0"
          aria-label="Your prediction in kilometres" value={km} onChange={(e) => setKm(e.target.value)} />
        <span className="pd-unit">km</span>
      </div>
      <input type="range" className="pd-slider" min="0" max={max} step={max > 50 ? 1 : 0.1} aria-label="Prediction slider"
        value={Math.min(max, val || 0)} onChange={(e) => setKm(e.target.value)} />

      {!moving && !disabled && (
        <p className="alert pd-still">🛑 You don't seem to be moving right now{speedKmh != null ? ` (${Math.round(speedKmh)} km/h)` : ''}. Rounds are most fun on the move — try a 1-minute practice round (not scored) or start anyway.</p>
      )}
      <button type="button" className="btn block pd-go" disabled={disabled || !valid} onClick={() => start(false)}>
        {valid ? `Lock in ${formatKm(val)} · start ${minutes} min` : 'Enter your prediction'}
      </button>
      {!moving && (
        <button type="button" className="btn secondary block" disabled={disabled || !valid} onClick={() => start(true)}>
          🧪 Practice round (1 min, not scored)
        </button>
      )}
      <p className="muted small">The round keeps running if you switch pages or lock your phone — come back to see your result.</p>
    </section>
  );
}

function RunningRound({ round, now, points, position, onCancel }) {
  const [sure, setSure] = useState(false);
  const left = round.endAt - now;
  const soFar = useMemo(() => windowDistance({ points, startAt: round.startAt, endAt: Math.min(now, round.endAt), startPos: round.startPos, endPos: null }).km, [points, round, now]);
  const pct = Math.min(100, Math.max(0, ((now - round.startAt) / (round.endAt - round.startAt)) * 100));
  return (
    <section className="card stack center pd-running" aria-live="off">
      <div className="badge">{round.practice ? '🧪 Practice round' : `🔮 ${round.minutes}-minute round`}{round.expert ? ' · 🕶️ Expert' : ''}</div>
      <div className="pd-count mono" role="timer" aria-label="Time left">{countdownLabel(left)}</div>
      <div className="progress pd-bar" aria-hidden="true"><span style={{ width: `${pct}%` }} /></div>
      <div className="pd-pair">
        <div><span className="muted small">Your guess</span><b>{formatKm(round.predictedKm)}</b></div>
        <div><span className="muted small">So far</span><b>{round.expert ? '???' : formatKm(soFar)}</b></div>
      </div>
      {!position && <p className="muted small">Waiting for GPS… keep the screen on for the best tracking.</p>}
      <p className="muted small">Ends at {formatTime(round.endAt)}. You can leave this page — the result will be waiting.</p>
      <button type="button" className={`btn small ${sure ? 'danger' : 'ghost'}`} onClick={() => (sure ? onCancel() : setSure(true))}>
        {sure ? 'Tap again to cancel round' : 'Cancel round'}
      </button>
    </section>
  );
}

function SaveLine({ practice, noData, still, saveState, queue }) {
  if (practice) return <p className="muted small">Practice round — not scored.</p>;
  if (still) return <p className="alert">You were barely moving this round, so it wasn't scored. Try again once you're on the move!</p>;
  if (noData) return <p className="alert">No GPS readings during the round, so it wasn't scored. Keep location on and try again.</p>;
  if (saveState === 'saved') return <p className="pd-saved small">✓ Score saved</p>;
  if (saveState?.startsWith('error:')) return <p className="alert error small">{saveState.slice(6)}</p>;
  return <p className="muted small">{queue.offline ? '📴 Offline — score saved on this phone, it will sync when you have signal.' : 'Saving score…'}</p>;
}

function RoundResult({ round, saveState, queue, onAgain }) {
  const fb = round.noData ? { title: 'No GPS data', line: 'We could not measure this round.', emoji: '📡' } : predictFeedback(round.predictedKm, round.actualKm);
  return (
    <section className="card stack center pd-result">
      <div className="pd-emoji pop" aria-hidden="true">{fb.emoji}</div>
      <h2 className="pd-h">{fb.title}</h2>
      <p>{fb.line}</p>
      <div className="pd-pair">
        <div><span className="muted small">You guessed</span><b>{formatKm(round.predictedKm)}</b></div>
        <div><span className="muted small">Actual</span><b>{formatKm(round.actualKm)}</b></div>
      </div>
      {!round.noData && (
        <div className="pd-score"><b>{round.score}</b><span>/100{round.expert && round.base > 0 ? ` (incl. +${round.score - round.base} expert)` : ''}</span></div>
      )}
      {round.method === 'straight' && <p className="muted small">Measured as a straight line (few GPS points).</p>}
      <SaveLine practice={round.practice} noData={round.noData} still={round.still} saveState={saveState} queue={queue} />
      <button type="button" className="btn block" onClick={onAgain}>🔁 Next round</button>
    </section>
  );
}

function ArrivalGuess({ trip, dest, destKm, speedKmh, arrival, setArrival, now, saveState }) {
  const [time, setTime] = useState('');
  if (!trip || !dest) {
    return (
      <section className="card stack pd-arrive">
        <h2 className="pd-h">⏰ Arrival time guess</h2>
        <p className="muted">Set a destination on the <Link to="/travel">Travel hub</Link> to guess the minute you'll arrive.</p>
      </section>
    );
  }
  const name = dest.name?.split(',')[0] || 'your destination';
  const mine = arrival && arrival.tripId === trip.id && arrival.destKey === `${dest.lat},${dest.lon}` ? arrival : null;
  const eta = speedKmh && speedKmh > 5 && destKm != null && !mine ? now + (destKm / speedKmh) * 3600000 : null;
  const lock = () => {
    const at = nextClockTime(time, Date.now());
    if (!at) return;
    setArrival({ id: uid(), tripId: trip.id, destKey: `${dest.lat},${dest.lon}`, status: 'waiting', predictedAt: at, guessedAt: Date.now(), kmAtGuess: destKm });
  };
  return (
    <section className="card stack pd-arrive">
      <h2 className="pd-h">⏰ Arrival time guess</h2>
      <p className="muted small">Destination: <b>{name}</b>{destKm != null && <> · {formatKm(destKm)} to go</>}</p>
      {!mine && (
        <>
          <p className="small">At what time will you be within 1 km of {name}?</p>
          <div className="pd-input-row">
            <input className="input pd-time" type="time" aria-label="Arrival time" value={time} onChange={(e) => setTime(e.target.value)} />
            <button type="button" className="btn" disabled={!time} onClick={lock}>Lock it in</button>
          </div>
          {eta && <p className="muted small">At your current speed you'd arrive around {formatTime(eta)} — but traffic has opinions.</p>}
        </>
      )}
      {mine?.status === 'waiting' && (
        <div className="stack center">
          <div className="pd-pair">
            <div><span className="muted small">Your guess</span><b>{formatTime(mine.predictedAt)}</b></div>
            <div><span className="muted small">{mine.predictedAt > now ? 'In' : 'Late by'}</span><b>{formatDuration(Math.abs(mine.predictedAt - now))}</b></div>
          </div>
          <p className="muted small">Resolves automatically when you're within 1 km (keep a Travel page open near the end).</p>
          <button type="button" className="btn small ghost" onClick={() => setArrival(null)}>Change guess</button>
        </div>
      )}
      {mine?.status === 'done' && (() => {
        const fb = arrivalFeedback(mine.predictedAt, mine.actualAt);
        return (
          <div className="stack center">
            <div className="pd-emoji" aria-hidden="true">{fb.emoji}</div>
            <b>{fb.title}</b>
            <p>{fb.line}</p>
            <div className="pd-pair">
              <div><span className="muted small">Guess</span><b>{formatTime(mine.predictedAt)}</b></div>
              <div><span className="muted small">Arrived</span><b>{formatTime(mine.actualAt)}</b></div>
            </div>
            <div className="pd-score"><b>{mine.score}</b><span>/100</span></div>
            <p className="small muted">{saveState === 'saved' ? '✓ Score saved' : saveState?.startsWith('error:') ? saveState.slice(6) : 'Saving (syncs when online)…'}</p>
            <button type="button" className="btn small secondary" onClick={() => setArrival(null)}>New guess</button>
          </div>
        );
      })()}
    </section>
  );
}

function History({ items }) {
  return (
    <section className="card stack pd-hist">
      <h2 className="pd-h">Recent rounds</h2>
      <ul>
        {items.map((h) => (
          <li key={h.id}>
            <span>{h.practice ? '🧪' : '🔮'} {h.minutes} min</span>
            <span className="muted">{formatKm(h.predictedKm)} → {formatKm(h.actualKm)}</span>
            <b>{h.noData || h.still ? '—' : h.practice ? 'practice' : h.score}</b>
          </li>
        ))}
      </ul>
    </section>
  );
}
