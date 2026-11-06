// Travel hub (/travel): the journey dashboard. Live speed/distance/ETA, place + weather, a ticking events
// feed and the travel game tiles. Everything on-device works offline; network extras degrade gracefully.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { TravelShell, useTravel } from '../travel/TravelShell.jsx';
import { MODES, MILESTONES_KM, endTrip, setDestination, setMode, startTrip } from '../travel/trip.js';
import { distanceKm } from '../travel/geo.js';
import { upcomingSkyEvents } from '../travel/sky.js';
import { useSession } from '../lib/session.jsx';
import JourneyCard from '../travel/hub/JourneyCard.jsx';
import WeatherCard from '../travel/hub/WeatherCard.jsx';
import EventsFeed from '../travel/hub/EventsFeed.jsx';
import GameTiles from '../travel/hub/GameTiles.jsx';
import DestinationSearch from '../travel/hub/DestinationSearch.jsx';
import { averageKmh, buildEvents, tripProgress } from '../travel/hub/hubLogic.js';
import { useNow, useOfflineReady, usePlace, useSpeed, useTopSpeed, useWeather } from '../travel/hub/useHubData.js';
import { readCache, writeCache } from '../travel/hub/net.js';
import './Travel.css';

export default function Travel() {
  return (
    <TravelShell title="Travel" icon="🧳" back={false}>
      <Hub />
    </TravelShell>
  );
}

/* ---------------- Trip setup (first run + edit) ---------------- */

function ModePicker({ value, onChange }) {
  return (
    <div className="tvh-modes" role="radiogroup" aria-label="How are you travelling?">
      {Object.entries(MODES).map(([k, m]) => (
        <button key={k} type="button" role="radio" aria-checked={value === k}
          className={`tvh-mode${value === k ? ' is-on' : ''}`} onClick={() => onChange(k)}>
          <span className="tvh-mode-icon" aria-hidden="true">{m.icon}</span>
          <span>{m.label}</span>
        </button>
      ))}
    </div>
  );
}

function DestinationField({ value, onChange, online }) {
  if (value) {
    return (
      <div className="tvh-picked">
        <span aria-hidden="true">📍</span>
        <span className="tvh-picked-text"><strong>{value.name}</strong>{value.detail && <span className="small muted">{value.detail}</span>}</span>
        <button type="button" className="btn small secondary" onClick={() => onChange(null)}>Change</button>
      </div>
    );
  }
  return (
    <>
      <DestinationSearch online={online} onPick={onChange} />
      <p className="small muted tvh-nodest">No fixed destination? Skip this — you still get speed, distance, sky events and games.</p>
    </>
  );
}

function TripSetup({ online, onDone, onCancel, initial }) {
  const [mode, setM] = useState(initial?.mode || 'road');
  const [dest, setDest] = useState(initial?.destination || null);
  const editing = !!initial;
  const save = () => {
    if (editing) { setMode(mode); setDestination(dest); } else { startTrip({ mode, destination: dest }); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    onDone?.(mode, dest);
  };
  return (
    <section className="card stack tvh-setup" aria-labelledby="tv-setup-h">
      <h2 id="tv-setup-h">{editing ? 'Edit trip' : 'Plan your trip'}</h2>
      <div className="stack tvh-setup-step">
        <span className="tvh-eyebrow">1 · How are you travelling?</span>
        <ModePicker value={mode} onChange={setM} />
      </div>
      <div className="stack tvh-setup-step">
        <span className="tvh-eyebrow">2 · Destination <span className="tvh-opt">(optional)</span></span>
        <DestinationField value={dest} onChange={setDest} online={online} />
      </div>
      <div className="row tvh-setup-actions">
        <button type="button" className="btn accent tvh-start" onClick={save}>
          {editing ? 'Save changes' : `${MODES[mode].icon} Start trip${dest ? ` to ${dest.name}` : ''}`}
        </button>
        {onCancel && <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>}
      </div>
    </section>
  );
}

function Onboarding({ geoStatus, startGps, online, hasFix }) {
  return (
    <div className="stack tvh-onboard">
      <section className="card tvh-hero">
        <div className="tvh-hero-art" aria-hidden="true"><span>🚆</span><span>🌅</span><span>🗺️</span></div>
        <h2>Turn your journey into a game</h2>
        <p className="muted">
          Travel uses your phone’s GPS to show live speed, distance and ETA, count down to sunsets and halfway points,
          and power five games built around where you are right now. Most of it keeps working with no signal.
        </p>
        <p className="small tvh-privacy">🔒 <strong>Private by design:</strong> your location stays on this phone. Only game scores are saved to PlayNest.</p>
        {geoStatus === 'denied' ? (
          <p className="alert error">Location is blocked. Allow it for this site in your browser settings, then reload. You can still plan a trip below.</p>
        ) : hasFix ? (
          <p className="badge done tvh-gps-ok">📍 Location is on</p>
        ) : (
          <button type="button" className="btn block tvh-gps-btn" onClick={startGps} disabled={geoStatus === 'prompt'}>
            {geoStatus === 'prompt' ? '📡 Finding you…' : '📍 Turn on location'}
          </button>
        )}
      </section>
      <TripSetup online={online} />
    </div>
  );
}

function EndTripButton() {
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    if (!confirm) return undefined;
    const t = setTimeout(() => setConfirm(false), 10000);
    return () => clearTimeout(t);
  }, [confirm]);
  if (!confirm) return <button type="button" className="btn small secondary tvh-end" onClick={() => setConfirm(true)}>🏁 End trip</button>;
  return (
    <div className="tvh-confirm" role="alertdialog" aria-label="End this trip?">
      <span className="small">End this trip? Distance and events will reset.</span>
      <div className="row">
        <button type="button" className="btn small danger" onClick={() => { endTrip(); setConfirm(false); }}>Yes, end trip</button>
        <button type="button" className="btn small secondary" onClick={() => setConfirm(false)}>Keep going</button>
      </div>
    </div>
  );
}

/* ---------------- Alerts (browser notifications while the page is open) ---------------- */

function useNotify() {
  const supported = typeof window !== 'undefined' && 'Notification' in window;
  const perm = supported ? Notification.permission : 'denied';
  const [on, setOn] = useState(() => supported && readCache('notify') === true && perm === 'granted');
  const state = !supported ? 'unsupported' : perm === 'denied' ? 'denied' : on ? 'on' : 'off';
  const toggle = async () => {
    if (!supported) return;
    if (on) { setOn(false); writeCache('notify', false); return; }
    try {
      const p = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
      const ok = p === 'granted';
      setOn(ok); writeCache('notify', ok);
    } catch { /* ignore */ }
  };
  const send = useCallback((title, body) => {
    if (!on || !supported || Notification.permission !== 'granted') return;
    try {
      if (navigator.serviceWorker?.controller) {
        navigator.serviceWorker.ready.then((r) => r.showNotification(title, { body, icon: '/icon-192.png', tag: title })).catch(() => {});
      } else new Notification(title, { body, icon: '/icon-192.png', tag: title });
    } catch { /* some mobile browsers only allow service-worker notifications */ }
  }, [on, supported]);
  return { state, toggle, send };
}

/* ---------------- Hub ---------------- */

function Hub() {
  const { position, geoStatus, startGps, trip, online } = useTravel();
  const { toast } = useSession() || {};
  const [editing, setEditing] = useState(false);
  const now = useNow(30000);
  const notify = useNotify();
  const { send } = notify;

  const kmh = useSpeed(position);
  const topKmh = useTopSpeed(trip, kmh);
  // ETA speed: recent average once there's enough history, else the live speed.
  const recentAvg = useMemo(() => averageKmh(trip, Date.now()), [trip, now]); // eslint-disable-line react-hooks/exhaustive-deps
  const avgKmh = recentAvg ?? (kmh != null && kmh >= 3 ? kmh : null);

  // On-device log of things that happened on this trip (regions entered, events reached).
  const tripId = trip?.id;
  const [log, setLog] = useState([]);
  useEffect(() => {
    const c = readCache('log');
    setLog(c && tripId && c.tripId === tripId && Array.isArray(c.items) ? c.items.filter((l) => l && l.key) : []);
  }, [tripId]);
  const addLog = useCallback((item) => {
    setLog((prev) => {
      if (prev.some((l) => l.key === item.key)) return prev;
      const next = [...prev, item].slice(-30);
      if (tripId) writeCache('log', { tripId, items: next });
      return next;
    });
  }, [tripId]);

  const onRegion = useCallback((state, place) => {
    toast?.({ kind: 'success', icon: '🗺️', title: `Welcome to ${state}!`, body: `You’re now near ${place.name}`, duration: 6000 });
    send(`Welcome to ${state}!`, `You’re now near ${place.name}.`);
    addLog({ key: `region-${state}-${Date.now()}`, icon: '🗺️', title: `Entered ${state}`, at: Date.now() });
  }, [toast, send, addLog]);
  const { place, status: placeStatus } = usePlace(position, online, onRegion);

  const here = position ? { lat: position.lat, lon: position.lon } : (place ? { lat: place.lat, lon: place.lon } : null);
  const dest = trip?.destination || null;
  const wxHere = useWeather('here', here, online);
  const wxDest = useWeather('dest', dest, online);

  const progress = trip && dest && here ? tripProgress(trip.origin || here, here, dest) : null;
  const remaining = dest && position ? distanceKm(position, dest) : null;
  // Sky maths is on-device; recompute every 5 min or when we move ~10 km. Countdowns tick inside the feed.
  const skyKey = here ? `${here.lat.toFixed(1)},${here.lon.toFixed(1)}` : '';
  const slot = Math.floor(now.getTime() / 300000);
  const sky = useMemo(() => (here ? upcomingSkyEvents(new Date(), here.lat, here.lon) : []), [skyKey, slot]); // eslint-disable-line react-hooks/exhaustive-deps
  const events = useMemo(() => buildEvents({ now: new Date(), sky, trip, here, kmh: avgKmh || kmh, milestones: MILESTONES_KM, progress }),
    [sky, trip, here?.lat, here?.lon, avgKmh, kmh, progress, now]); // eslint-disable-line react-hooks/exhaustive-deps

  // Halfway / arriving-soon moments from live progress: a toast once per trip.
  useEffect(() => {
    if (!trip || !dest || progress == null) return;
    const raw = readCache('flags');
    const done = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const fire = (k, icon, title, body) => {
      const key = `${trip.id}-${k}`;
      if (done[key]) return;
      done[key] = true;
      writeCache('flags', done);
      toast?.({ kind: 'success', icon, title, body, duration: 6000 });
      send(title, body);
      addLog({ key, icon, title, at: Date.now() });
    };
    const total = trip.origin ? distanceKm(trip.origin, dest) : 0;
    if (total > 20 && progress >= 0.5) fire('half', '🏁', 'Halfway there!', `Half of the way to ${dest.name} is done.`);
    if (total > 15 && remaining != null && remaining <= 10) fire('near', '📍', `Almost at ${dest.name}!`, `About ${Math.max(1, Math.round(remaining))} km to go.`);
  }, [progress, remaining, trip, dest, toast, send, addLog]);

  const onEventReached = useCallback((e) => {
    send(`${e.icon} ${e.title}`, 'Happening now');
    addLog({ key: e.key, icon: e.icon, title: e.title, at: e.at.getTime() });
  }, [send, addLog]);

  const ready = useOfflineReady(online);

  if (!trip) {
    return (
      <div className="stack tvh">
        <Onboarding geoStatus={geoStatus} startGps={startGps} online={online} hasFix={!!position} />
        <GameTiles online={online} />
        <OfflineBadge ready={ready} online={online} />
        <Credits />
      </div>
    );
  }

  return (
    <div className="stack tvh">
      {!position && (
        <div className="card tvh-gps-nudge">
          <span aria-hidden="true" className="tvh-gps-nudge-icon">📍</span>
          <span className="small">
            {geoStatus === 'denied' ? 'Location is blocked — allow it in your browser settings for live speed and ETA.'
              : geoStatus === 'prompt' ? 'Waiting for a GPS fix… a window seat helps.'
              : 'Location is off. Turn it on for live speed, distance and ETA.'}
          </span>
          {geoStatus !== 'denied' && geoStatus !== 'prompt' && <button type="button" className="btn small" onClick={startGps}>Turn on</button>}
        </div>
      )}
      {editing ? (
        <TripSetup online={online} initial={trip} onDone={() => setEditing(false)} onCancel={() => setEditing(false)} />
      ) : (
        <JourneyCard position={position} trip={trip} kmh={kmh} avgKmh={avgKmh} topKmh={topKmh} place={place}
          placeStatus={placeStatus} destTz={wxDest.data?.timezone} online={online} onEdit={() => setEditing(true)} />
      )}
      <div className="tvh-cols">
        <EventsFeed events={events} log={log} kmh={kmh} notifyState={notify.state} onToggleNotify={notify.toggle} onNotify={onEventReached} />
        <WeatherCard here={wxHere} dest={wxDest} placeName={place?.name} destination={dest} online={online} />
      </div>
      <GameTiles online={online} />
      <div className="tvh-footer">
        <OfflineBadge ready={ready} online={online} />
        <EndTripButton />
      </div>
      <Credits />
    </div>
  );
}

function Credits() {
  return (
    <p className="small muted tvh-credits">
        Place names © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>
        {' · '}Weather by <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo</a>
    </p>
  );
}

function OfflineBadge({ ready, online }) {
  if (ready) return <p className="badge done tvh-ready" role="status">✓ Ready for offline</p>;
  return <p className="badge tvh-ready" role="status">{online ? '⏳ Saving games for offline…' : '📴 Connect once to save games for offline'}</p>;
}
