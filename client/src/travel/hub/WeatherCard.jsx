import { agoText, weatherInfo } from './hubLogic.js';

function Panel({ label, place, wx, status, online, emptyText }) {
  if (!wx) {
    return (
      <div className="tvh-wx is-empty">
        <span className="tvh-eyebrow">{label}</span>
        <span className="tvh-wx-emoji" aria-hidden="true">{status === 'loading' ? '⏳' : online ? '🌡️' : '📴'}</span>
        <span className="small muted">
          {status === 'loading' ? 'Checking the sky…' : !online ? 'Weather needs internet — it will update when you’re back online.' : status === 'error' ? 'Weather is unavailable right now. Retrying soon.' : emptyText}
        </span>
      </div>
    );
  }
  const c = wx.current;
  const w = weatherInfo(c.weather_code, c.is_day);
  const age = Date.now() - wx.at;
  return (
    <div className="tvh-wx">
      <span className="tvh-eyebrow">{label}</span>
      <div className="tvh-wx-main">
        <span className="tvh-wx-emoji" aria-hidden="true">{w.emoji}</span>
        <span className="tvh-wx-temp">{Math.round(c.temperature_2m)}°</span>
      </div>
      <strong className="tvh-wx-words">{w.words}</strong>
      <span className="small muted">{place ? `${place} · ` : ''}💨 {Math.round(c.wind_speed_10m)} km/h</span>
      <span className={`small ${age > 30 * 60000 ? 'tvh-stale' : 'muted'}`}>Updated {agoText(age)}{!online && ' · offline'}</span>
    </div>
  );
}

export default function WeatherCard({ here, dest, placeName, destination, online }) {
  return (
    <section className="card tvh-weather" aria-labelledby="tv-wx-h">
      <h2 id="tv-wx-h" className="pn-sr-only">Weather</h2>
      <div className={`tvh-wx-grid${destination ? ' has-dest' : ''}`}>
        <Panel label="Weather here" place={placeName} wx={here.data} status={here.status} online={online} emptyText="Turn on location to see the weather where you are." />
        {destination && <Panel label={`At ${destination.name}`} wx={dest.data} status={dest.status} online={online} emptyText="Loading…" />}
      </div>
    </section>
  );
}
