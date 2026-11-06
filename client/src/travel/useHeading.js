import { useEffect, useRef, useState } from 'react';

/**
 * Device compass heading in degrees clockwise from north (0–360), or null if unavailable.
 * iOS needs a user gesture: call request() from a button tap. Android/Chrome uses
 * 'deviceorientationabsolute'. Returns { heading, status: 'idle'|'needs-permission'|'active'|'denied'|'unsupported', request }.
 */
export function useHeading() {
  const [heading, setHeading] = useState(null);
  const [status, setStatus] = useState('idle');
  const smoothed = useRef(null);

  const onOrient = (e) => {
    let h = null;
    if (typeof e.webkitCompassHeading === 'number') h = e.webkitCompassHeading;          // iOS
    else if (e.absolute && typeof e.alpha === 'number') h = (360 - e.alpha) % 360;      // Android absolute
    if (h == null || Number.isNaN(h)) return;
    // light smoothing across the 0/360 wrap
    if (smoothed.current == null) smoothed.current = h;
    else { const d = ((h - smoothed.current + 540) % 360) - 180; smoothed.current = (smoothed.current + d * 0.25 + 360) % 360; }
    setHeading(smoothed.current);
    setStatus('active');
  };

  const attach = () => {
    window.addEventListener('deviceorientationabsolute', onOrient, true);
    window.addEventListener('deviceorientation', onOrient, true);
  };

  const request = async () => {
    const DOE = window.DeviceOrientationEvent;
    if (!DOE) { setStatus('unsupported'); return; }
    if (typeof DOE.requestPermission === 'function') {
      try { const r = await DOE.requestPermission(); if (r !== 'granted') { setStatus('denied'); return; } }
      catch { setStatus('denied'); return; }
    }
    attach();
    setTimeout(() => setStatus((s) => (s === 'active' ? s : 'unsupported')), 3000);
  };

  useEffect(() => {
    const DOE = window.DeviceOrientationEvent;
    if (!DOE) setStatus('unsupported');
    else if (typeof DOE.requestPermission === 'function') setStatus('needs-permission');
    else request();
    return () => {
      window.removeEventListener('deviceorientationabsolute', onOrient, true);
      window.removeEventListener('deviceorientation', onOrient, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { heading, status, request };
}
