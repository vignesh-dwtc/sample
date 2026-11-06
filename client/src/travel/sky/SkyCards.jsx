import { formatTime } from '../geo.js';
import MoonDisc from './MoonDisc.jsx';
import { countdownText, dayLengthText, describeBody, directionName } from './skyLogic.js';

const fmtDay = (d, now) => {
  if (!d) return '';
  const a = new Date(d); a.setHours(0, 0, 0, 0);
  const b = new Date(now); b.setHours(0, 0, 0, 0);
  const diff = Math.round((a - b) / 86400000);
  return diff === 0 ? 'today' : diff === 1 ? 'tomorrow' : a.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
};

function Stat({ label, value, sub, past }) {
  return (
    <div className={`sk-stat${past ? ' is-past' : ''}`}>
      <span className="sk-stat-label">{label}</span>
      <span className="sk-stat-value mono">{value}</span>
      {sub && <span className="sk-stat-sub">{sub}</span>}
    </div>
  );
}

export function SunCard({ sky, now }) {
  const { sun, today, golden, nextSunrise, nextSunset } = sky;
  const past = (d) => d && d < now;
  const nextEvent = sun.up
    ? (nextSunset && { label: 'Sunset in', at: nextSunset })
    : (nextSunrise && { label: 'Sunrise in', at: nextSunrise });
  return (
    <section className="card sk-card sk-sun-card" aria-labelledby="sk-sun-h">
      <div className="sk-card-head">
        <div className={`sk-sun-orb${sun.up ? '' : ' is-down'}`} aria-hidden="true">☀️</div>
        <div className="sk-card-head-text">
          <h2 id="sk-sun-h">Sun</h2>
          <p className="sk-sentence">{describeBody('Sun', sun.azimuth, sun.altitude)}.</p>
        </div>
        <div className="sk-big-num" aria-label={`Altitude ${Math.round(sun.altitude)} degrees`}>
          <span className="mono">{Math.round(sun.altitude)}°</span>
          <span className="sk-big-sub">{sun.altitude >= 0 ? 'up' : 'below'}</span>
        </div>
      </div>
      <div className="sk-dirline muted small">
        <span>🧭 {Math.round(sun.azimuth)}° {directionName(sun.azimuth)}</span>
        {nextEvent && <span className="sk-live" aria-live="off">{nextEvent.label} <strong className="mono">{countdownText(nextEvent.at - now)}</strong></span>}
      </div>
      <div className="sk-stats">
        <Stat label="Sunrise" value={formatTime(today.sunrise)} past={past(today.sunrise)} />
        <Stat label="Solar noon" value={formatTime(today.solarNoon)} past={past(today.solarNoon)} />
        <Stat label="Sunset" value={formatTime(today.sunset)} past={past(today.sunset)} />
        <Stat label="Day length" value={dayLengthText(today.sunrise, today.sunset)} />
      </div>
      {golden && (
        <div className={`sk-golden${golden.active ? ' is-active' : ''}`}>
          <span className="sk-golden-icon" aria-hidden="true">📸</span>
          <div className="sk-golden-text">
            {golden.active ? (
              <><strong>Golden hour now!</strong> <span>Soft warm light for photos — ends in <span className="mono">{countdownText(golden.end - now)}</span></span></>
            ) : (
              <><strong>{golden.which === 'morning' ? 'Morning' : 'Evening'} golden hour</strong> <span>starts in <span className="mono">{countdownText(golden.start - now)}</span></span></>
            )}
            <span className="muted small"> {formatTime(golden.start)}–{formatTime(golden.end)} {fmtDay(golden.start, now) !== 'today' ? fmtDay(golden.start, now) : ''}</span>
          </div>
        </div>
      )}
    </section>
  );
}

export function MoonCard({ sky, now }) {
  const { moon, waxing, events, nextMoonrise, nextMoonset } = sky;
  const pct = Math.round(moon.illumination * 100);
  return (
    <section className="card sk-card sk-moon-card" aria-labelledby="sk-moon-h">
      <div className="sk-card-head">
        <MoonDisc fraction={moon.illumination} waxing={waxing} size={64} label={`${moon.phaseName}, ${pct}% lit`} />
        <div className="sk-card-head-text">
          <h2 id="sk-moon-h">Moon <span className="sk-phase-name">{moon.phaseName}</span></h2>
          <p className="sk-sentence">{describeBody('Moon', moon.azimuth, moon.altitude)}.</p>
        </div>
        <div className="sk-big-num" aria-label={`${pct} percent lit`}>
          <span className="mono">{pct}%</span>
          <span className="sk-big-sub">lit</span>
        </div>
      </div>
      <div className="sk-dirline muted small">
        <span>🧭 {Math.round(moon.azimuth)}° {directionName(moon.azimuth)} · {Math.round(moon.altitude)}° {moon.altitude >= 0 ? 'up' : 'below'}</span>
        <span>{waxing ? 'Growing (waxing) ↗' : 'Shrinking (waning) ↘'}</span>
      </div>
      <div className="sk-stats">
        <Stat label="Moonrise" value={sky.moonAlwaysDown ? '—' : formatTime(nextMoonrise)} sub={sky.moonAlwaysDown ? 'not today' : fmtDay(nextMoonrise, now)} />
        <Stat label="Moonset" value={sky.moonAlwaysUp ? '—' : formatTime(nextMoonset)} sub={sky.moonAlwaysUp ? 'up all day' : fmtDay(nextMoonset, now)} />
        <Stat label="Full moon" value={`🌕 ${daysAway(events.full, now)}`} sub={events.full.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} />
        <Stat label="New moon" value={`🌑 ${daysAway(events.new, now)}`} sub={events.new.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} />
      </div>
    </section>
  );
}

function daysAway(d, now) {
  const days = (d - now) / 86400000;
  if (days < 1) return `${Math.max(1, Math.round(days * 24))} h`;
  return `${Math.round(days)} d`;
}
