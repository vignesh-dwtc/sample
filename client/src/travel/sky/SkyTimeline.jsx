import { formatTime } from '../geo.js';

/** Next-24h band chart: when the sun and the moon are above the horizon. */
export default function SkyTimeline({ timeline, moonEmoji }) {
  const { start, sun, moon } = timeline;
  const span = 86400000;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({ f, label: f === 0 ? 'Now' : formatTime(new Date(start + f * span)) }));
  const summary = (bands, name) => (bands.length
    ? `${name} up ${bands.map((b) => `${formatTime(new Date(start + b.from * span))} to ${formatTime(new Date(start + b.to * span))}`).join(' and ')}`
    : `${name} not up in the next 24 hours`);
  return (
    <section className="card sk-card" aria-labelledby="sk-tl-h">
      <h2 id="sk-tl-h" className="sk-h2-small">Next 24 hours in the sky</h2>
      <div className="sk-tl" role="img" aria-label={`${summary(sun, 'Sun')}. ${summary(moon, 'Moon')}.`}>
        {[['sun', '☀️', sun], ['moon', moonEmoji, moon]].map(([k, icon, bands]) => (
          <div key={k} className="sk-tl-row">
            <span className="sk-tl-icon" aria-hidden="true">{icon}</span>
            <div className={`sk-tl-track sk-tl-${k}`}>
              {bands.map((b, i) => (
                <span key={i} className="sk-tl-band" style={{ left: `${b.from * 100}%`, width: `${Math.max(0.5, (b.to - b.from) * 100)}%` }} />
              ))}
            </div>
          </div>
        ))}
        <div className="sk-tl-axis" aria-hidden="true">
          {ticks.map((t) => <span key={t.f} style={{ left: `${t.f * 100}%` }}>{t.label}</span>)}
        </div>
      </div>
    </section>
  );
}
