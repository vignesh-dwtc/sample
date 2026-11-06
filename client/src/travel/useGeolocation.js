import { useEffect, useRef, useState } from 'react';

/**
 * Live device position (works offline — GPS needs no network).
 * Returns { position: {lat, lon, accuracy, speed (m/s|null), heading (deg|null), altitude, at: ms} | null,
 *           status: 'idle'|'prompt'|'watching'|'denied'|'unavailable'|'error', error, start() }.
 * Pass { auto: true } to start immediately (only do that after the user has opted in once — the
 * opt-in is remembered in localStorage key 'playnest.geo.ok').
 */
export function useGeolocation({ auto = true, highAccuracy = true } = {}) {
  const [position, setPosition] = useState(null);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const watchId = useRef(null);

  const start = () => {
    if (!('geolocation' in navigator)) { setStatus('unavailable'); return; }
    if (watchId.current != null) return;
    setStatus('prompt');
    watchId.current = navigator.geolocation.watchPosition(
      (p) => {
        try { localStorage.setItem('playnest.geo.ok', '1'); } catch { /* ignore */ }
        setStatus('watching'); setError(null);
        const c = p.coords;
        setPosition({ lat: c.latitude, lon: c.longitude, accuracy: c.accuracy, speed: c.speed, heading: c.heading, altitude: c.altitude, at: p.timestamp });
      },
      (e) => {
        setError(e.message);
        setStatus(e.code === 1 ? 'denied' : e.code === 2 ? 'unavailable' : 'error');
        if (e.code === 1) { navigator.geolocation.clearWatch(watchId.current); watchId.current = null; }
      },
      { enableHighAccuracy: highAccuracy, maximumAge: 15000, timeout: 30000 }
    );
  };

  useEffect(() => {
    let ok = false;
    try { ok = localStorage.getItem('playnest.geo.ok') === '1'; } catch { /* ignore */ }
    if (auto && ok) start();
    return () => { if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current); watchId.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { position, status, error, start };
}
