import { bearing, compassName, compassPoint, distanceKm, formatDuration, formatKm, formatTime } from '../geo.js';
import { MODES } from '../trip.js';
import { agoText, differentClock, elapsedText, etaMs, tripProgress, zoneLabel } from './hubLogic.js';
import { useNow } from './useHubData.js';

const DEVICE_TZ = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return undefined; } })();

function Stat({ label, value, sub, wide }) {
  return (
    <div className={`tvh-stat${wide ? ' is-wide' : ''}`}>
      <span className="tvh-stat-label">{label}</span>
      <span className="tvh-stat-value">{value}</span>
      {sub && <span className="tvh-stat-sub">{sub}</span>}
    </div>
  );
}

function Speed({ kmh, mode, hasFix }) {
  const v = kmh == null ? null : kmh < 1.5 ? 0 : Math.round(kmh);
  const pace = v == null ? 0 : Math.min(1, v / ((MODES[mode] || MODES.road).maxKmh * 0.6));
  return (
    <div className="tvh-speed" style={{ '--pace': pace }} aria-label={v == null ? 'Speed unknown' : `Speed ${v} kilometres per hour`}>
      <span className="tvh-speed-num mono">{v == null ? '—' : v}</span>
      <span className="tvh-speed-unit">km/h</span>
      <span className="tvh-speed-road" aria-hidden="true"><span className={v ? 'is-moving' : ''} style={{ animationDuration: `${Math.max(0.25, 2.2 - pace * 2)}s` }} /></span>
      {(!hasFix || v == null) && <span className="tvh-stat-sub">{hasFix ? 'measuring…' : 'waiting for GPS'}</span>}
    </div>
  );
}

export default function JourneyCard({ position, trip, kmh, avgKmh, topKmh, place, placeStatus, destTz, online, onEdit }) {
  const now = useNow(1000);
  const mode = trip?.mode || 'road';
  const m = MODES[mode] || MODES.road;
  const dest = trip?.destination || null;
  const remaining = position && dest ? distanceKm(position, dest) : null;
  const eta = etaMs(remaining, avgKmh, mode);
  const dir = position && dest ? bearing(position, dest) : null;
  const progress = trip && dest ? tripProgress(trip.origin || position, position, dest) : null;
  const stale = position && now - position.at > 2 * 60000;
  const alt = position?.altitude;
  const showDestClock = dest && destTz && differentClock(DEVICE_TZ, destTz, now);
  const placeAge = place ? now - place.at : null;

  return (
    <section className={`card tvh-journey mode-${mode}`} aria-labelledby="tv-journey-h">
      <div className="tvh-journey-glow" aria-hidden="true" />
      <div className="tvh-journey-head">
        <div className="tvh-where">
          <span className="tvh-eyebrow">{trip ? <>{m.icon} {m.label} · on the move</> : 'You are here'}</span>
          <h2 id="tv-journey-h" className="tvh-place">
            {place?.name || (position ? (online ? 'Finding place name…' : 'Somewhere on the road') : 'Location off')}
          </h2>
          <span className="small muted">
            {place?.state && place.state !== place.name ? `${place.state}${place.country && place.country !== 'India' ? `, ${place.country}` : ''}` : place?.country || ''}
            {placeAge != null && placeAge > 5 * 60000 && <> · {agoText(placeAge)}{!online && ' (offline)'}</>}
            {placeStatus === 'loading' && !place && ' '}
          </span>
        </div>
        {trip && <button type="button" className="btn small secondary" onClick={onEdit}>Edit trip</button>}
      </div>

      <div className="tvh-journey-body">
        <Speed kmh={kmh} mode={mode} hasFix={!!position} />
        <div className="tvh-stats">
          {trip && <Stat label="Travelled" value={formatKm(trip.distanceKm)} sub={topKmh ? `top ${Math.round(topKmh)} km/h` : null} />}
          {trip && <Stat label="Elapsed" value={<span className="mono">{elapsedText(now - trip.startedAt)}</span>} sub={avgKmh ? `avg ${Math.round(avgKmh)} km/h` : 'avg —'} />}
          <Stat label="Local time" value={<span className="mono">{formatTime(now)}</span>} sub={zoneLabel(DEVICE_TZ, now)} />
          {alt != null && Number.isFinite(alt)
            ? <Stat label="Altitude" value={`${Math.round(alt).toLocaleString('en-IN')} m`} sub={mode === 'flight' ? `${Math.round(alt * 3.281).toLocaleString('en-IN')} ft` : 'above sea level'} />
            : !trip && <Stat label="GPS" value={position ? `±${Math.round(position.accuracy)} m` : '—'} sub={position ? 'accuracy' : 'off'} />}
        </div>
      </div>

      {stale && <p className="tvh-note small">📡 Last GPS fix {agoText(now - position.at)} — move near a window for a better signal.</p>}

      {dest && (
        <div className="tvh-dest">
          <div className="tvh-dest-row">
            <div className="tvh-compass" aria-hidden="true">
              <span className="tvh-compass-n">N</span>
              <span className="tvh-compass-arrow" style={{ transform: `rotate(${dir ?? 0}deg)`, opacity: dir == null ? 0.3 : 1 }}>➤</span>
            </div>
            <div className="tvh-dest-text">
              <span className="tvh-eyebrow">To {dest.name}</span>
              <strong className="tvh-dest-km">{remaining != null ? formatKm(remaining) : '—'} <span className="small muted">straight line</span></strong>
              <span className="small muted">
                {dir != null ? `Head ${compassName(dir)} (${compassPoint(dir)}, ${Math.round(dir)}°)` : 'Turn on location for direction'}
              </span>
            </div>
            <div className="tvh-eta">
              <span className="tvh-eyebrow">ETA</span>
              <strong className="mono">{eta != null ? formatTime(now.getTime() + eta) : '—'}</strong>
              <span className="small muted">{eta != null ? `≈ ${formatDuration(eta)}` : remaining != null && remaining < 1 ? 'arrived!' : 'needs movement'}</span>
            </div>
          </div>
          {progress != null && (
            <div className="tvh-track" role="progressbar" aria-label={`Trip progress to ${dest.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
              <div className="tvh-track-bar"><span style={{ width: `${progress * 100}%` }} /></div>
              <span className={`tvh-track-half${progress >= 0.5 ? ' is-done' : ''}`} title="Halfway"><span>halfway</span></span>
              <span className="tvh-track-me" style={{ left: `${progress * 100}%` }} aria-hidden="true">{m.icon}</span>
              <div className="tvh-track-ends small muted"><span>Start</span><span className="mono">{Math.round(progress * 100)}%</span><span>{dest.name}</span></div>
            </div>
          )}
          {showDestClock && (
            <p className="small tvh-destclock">🕰️ It’s <strong className="mono">{formatTime(now, destTz)}</strong> in {dest.name} ({zoneLabel(destTz, now)}).</p>
          )}
        </div>
      )}
      {trip && !dest && (
        <button type="button" className="tvh-adddest" onClick={onEdit}>➕ Add a destination for ETA, compass and halfway alerts</button>
      )}
    </section>
  );
}
