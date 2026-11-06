import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useGeolocation } from './useGeolocation.js';
import { useTripRecorder, useTripState } from './trip.js';
import { useSession } from '../lib/session.jsx';
import './travel.css';

const TravelCtx = createContext(null);

/**
 * Wrap every travel page in <TravelShell title="…" icon="…">. It provides ONE shared GPS watch,
 * records the active trip, awards distance milestones, and shows a back link + GPS/online status.
 * Pages read live data with useTravel() → { position, geoStatus, startGps, trip, online }.
 */
export function TravelShell({ title, icon, children, back = true }) {
  const geo = useGeolocation({ auto: true });
  const trip = useTripState();
  const { celebrate, toast } = useSession() || {};
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);

  useEffect(() => {
    const up = () => setOnline(true), down = () => setOnline(false);
    window.addEventListener('online', up); window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);

  const onMilestone = useCallback((progress, km) => {
    toast?.({ kind: 'streak', icon: '🛣️', title: `${km} km travelled!`, body: 'Trip milestone reached' });
    celebrate?.(progress);
  }, [celebrate, toast]);
  useTripRecorder(geo.position, onMilestone);

  const value = { position: geo.position, geoStatus: geo.status, geoError: geo.error, startGps: geo.start, trip, online };
  return (
    <TravelCtx.Provider value={value}>
      <div className="container tv-shell">
        <div className="tv-topbar">
          {back ? <Link to="/travel" className="tv-back">← Travel</Link> : <span />}
          <div className="tv-status">
            {!online && <span className="badge" title="You're offline — on-device features still work">📴 Offline</span>}
            <GpsChip status={geo.status} position={geo.position} onStart={geo.start} />
          </div>
        </div>
        {title && <h1 className="tv-title">{icon && <span aria-hidden="true">{icon} </span>}{title}</h1>}
        {children}
      </div>
    </TravelCtx.Provider>
  );
}

function GpsChip({ status, position, onStart }) {
  if (status === 'watching' && position) {
    return <span className="badge done" title={`Accuracy ±${Math.round(position.accuracy)} m`}>📍 GPS ±{Math.round(position.accuracy)} m</span>;
  }
  if (status === 'denied') return <span className="badge live" title="Allow location for this site in your browser settings">📍 Location blocked</span>;
  if (status === 'prompt') return <span className="badge">📍 Finding you…</span>;
  return <button type="button" className="btn small secondary" onClick={onStart}>📍 Use my location</button>;
}

export const useTravel = () => useContext(TravelCtx) || {};

/** Friendly block shown when a feature needs GPS but it isn't on yet. */
export function NeedsLocation({ why = 'This game uses your live location.' }) {
  const { geoStatus, startGps } = useTravel();
  return (
    <div className="card stack center tv-needs-loc">
      <div style={{ fontSize: '2.5rem' }} aria-hidden="true">📍</div>
      <p>{why} Your location stays on your phone — only scores are saved.</p>
      {geoStatus === 'denied'
        ? <p className="alert error">Location is blocked. Allow it for this site in your browser settings, then reload.</p>
        : <button type="button" className="btn" onClick={startGps}>{geoStatus === 'prompt' ? 'Waiting for GPS…' : 'Turn on location'}</button>}
    </div>
  );
}
