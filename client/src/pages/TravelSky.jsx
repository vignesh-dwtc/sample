import { memo, useCallback, useState } from 'react';
import { NeedsLocation, TravelShell, useTravel } from '../travel/TravelShell.jsx';
import { useHeading } from '../travel/useHeading.js';
import { useSession } from '../lib/session.jsx';
import CompassDial from '../travel/sky/CompassDial.jsx';
import { MoonCard as MoonCardRaw, SunCard as SunCardRaw } from '../travel/sky/SkyCards.jsx';
import SkyTimelineRaw from '../travel/sky/SkyTimeline.jsx';
import SkyGame from '../travel/sky/SkyGame.jsx';
import { useNow, useSkyData, useSkyPosition } from '../travel/sky/useSky.js';
import { directionShort } from '../travel/sky/skyLogic.js';
import './TravelSky.css';

// The compass fires many times a second; only the dial needs that. These re-render once per clock tick.
const SunCard = memo(SunCardRaw);
const MoonCard = memo(MoonCardRaw);
const SkyTimeline = memo(SkyTimelineRaw);

export default function TravelSky() {
  return (
    <TravelShell title="Sky Compass" icon="🧭">
      <SkyPage />
    </TravelShell>
  );
}

function SkyPage() {
  const { position, geoStatus, startGps } = useTravel();
  const pos = useSkyPosition(position);
  const now = useNow(1000);
  const sky = useSkyData(pos, now);
  const heading = useHeading();
  const { celebrate } = useSession() || {};
  const [gameOn, setGameOn] = useState(false);
  const onActive = useCallback((v) => setGameOn(v), []);

  if (!pos || !sky) return <NeedsLocation why="Sky Compass works out where the sun and moon are from your live location — no internet needed." />;

  return (
    <div className="sk-page">
      {pos.stale && (
        <div className="alert sk-stale">
          <span>Using your last known spot{geoStatus === 'prompt' ? ' while GPS warms up' : ''}.</span>
          {geoStatus !== 'watching' && geoStatus !== 'prompt' && geoStatus !== 'denied' && (
            <button type="button" className="btn small secondary" onClick={startGps}>Use live GPS</button>
          )}
        </div>
      )}

      {!gameOn && <DialSection sky={sky} heading={heading} />}

      <SkyGame sky={sky} heading={heading} pos={pos} celebrate={celebrate} onActive={onActive} />

      {gameOn ? (
        <p className="muted small center">Sun &amp; moon details are hidden while you play — no peeking! 🙈</p>
      ) : (
        <>
          <div className="sk-cards">
            <SunCard sky={sky} now={now} />
            <MoonCard sky={sky} now={now} />
          </div>
          <SkyTimeline timeline={sky.timeline} moonEmoji={sky.moon.emoji} />
        </>
      )}
      <p className="muted small center sk-foot">Worked out on your phone from GPS and the clock — works with no internet. Your location never leaves this device.</p>
    </div>
  );
}

function DialSection({ sky, heading }) {
  const { sun, moon } = sky;
  const live = heading.status === 'active' && heading.heading != null;
  const markers = [
    { id: 'moon', emoji: moon.emoji, az: moon.azimuth, alt: moon.altitude, color: 'rgba(220,225,255,0.22)', label: `Moon ${Math.round(moon.altitude)}°` },
    { id: 'sun', emoji: '☀️', az: sun.azimuth, alt: sun.altitude, color: 'rgba(255,209,102,0.3)', label: `Sun ${Math.round(sun.altitude)}°` },
  ];
  return (
    <section className="card sk-card sk-dial-card" aria-label="Compass">
      <div className="sk-dial-wrap">
        <CompassDial rotation={live ? heading.heading : 0} markers={markers} pointer={live} sunAlt={sun.altitude}
          label={`Compass. Sun ${Math.round(sun.azimuth)} degrees, ${Math.round(sun.altitude)} degrees ${sun.altitude >= 0 ? 'up' : 'below the horizon'}. Moon ${Math.round(moon.azimuth)} degrees.`} />
      </div>
      <div className="sk-legend">
        <BodyChip icon="☀️" name="Sun" az={sun.azimuth} alt={sun.altitude} />
        <BodyChip icon={moon.emoji} name="Moon" az={moon.azimuth} alt={moon.altitude} />
      </div>
      <div className="sk-heading-status">
        {live && <span>📱 Facing <strong className="mono">{Math.round(heading.heading)}° {directionShort(heading.heading)}</strong> · dial turns with your phone</span>}
        {heading.status === 'needs-permission' && (
          <>
            <button type="button" className="btn accent block" onClick={heading.request}>🧭 Enable compass</button>
            <span className="muted small sk-north-note">Until then the dial is north-up.</span>
          </>
        )}
        {heading.status === 'idle' && <span className="muted">Looking for a compass…</span>}
        {(heading.status === 'unsupported' || heading.status === 'denied') && (
          <span className="muted">{heading.status === 'denied' ? 'Compass access was refused' : 'No compass on this device'} — the dial stays north-up. Centre = straight overhead, edge = horizon.</span>
        )}
      </div>
    </section>
  );
}

function BodyChip({ icon, name, az, alt }) {
  const up = alt >= 0;
  return (
    <div className={`sk-chip${up ? '' : ' is-below'}`}>
      <span className="sk-chip-icon" aria-hidden="true">{icon}</span>
      <span className="sk-chip-text">
        <strong>{name}</strong>
        <span className="mono">{Math.round(az)}° {directionShort(az)}</span>
      </span>
      <span className={`sk-alt ${up ? 'up' : 'down'}`} title={up ? 'Above the horizon' : 'Below the horizon'}>
        {up ? '▲' : '▼'} <span className="mono">{Math.abs(Math.round(alt))}°</span> <span className="sk-alt-word">{up ? 'up' : 'below'}</span>
      </span>
    </div>
  );
}
