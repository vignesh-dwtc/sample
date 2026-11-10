// Dev-only sound audition page. Not routed — mount it manually for testing, e.g.
//   const SoundLab = lazy(() => import('./fx/audio/SoundLab.jsx'));
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { sound, loop, soundNames, loopNames, SOUND_DEFS, LOOP_DEFS, isMuted, setMuted, subscribeMuted, preloadSounds } from './index.js';

const GROUPS = [
  ['UI', ['tap', 'click', 'success', 'error', 'coin', 'levelup', 'whoosh', 'swoosh', 'flip', 'pop', 'type']],
  ['Cricket', ['bat', 'edge', 'bounce', 'stumps', 'catch', 'crowdCheer', 'crowdRoar', 'crowdGroan', 'claps', 'whistle', 'crowdChant']],
  ['Highway', ['crash', 'horn', 'hornCar', 'autoHorn', 'passBy', 'tyre', 'nitro', 'coinPickup']],
  ['Carrom', ['woodClick', 'strikerHit', 'cushion', 'pocket', 'slide']],
  ['Generic', ['win', 'lose', 'tick', 'countdown', 'beep', 'beepHigh', 'heartbeat']],
];

function LoopRow({ name }) {
  const ref = useRef(null);
  const [on, setOn] = useState(false);
  const [p, setP] = useState({ volume: 0.8, rate: 1, pan: 0 });
  useEffect(() => () => ref.current?.stop(0), []);
  const toggle = () => {
    if (ref.current) { ref.current.stop(300); ref.current = null; setOn(false); } else { ref.current = loop(name, p); setOn(true); }
  };
  const upd = (k, v) => { const n = { ...p, [k]: v }; setP(n); ref.current?.set(n); };
  const slider = (k, min, max) => (
    <label className="row" style={{ gap: 8, fontSize: '0.85rem' }}>
      <span style={{ width: 92, whiteSpace: 'nowrap' }}>{k} {p[k].toFixed(2)}</span>
      <input type="range" min={min} max={max} step="0.01" value={p[k]} onChange={(e) => upd(k, Number(e.target.value))} style={{ flex: 1, minWidth: 120 }} />
    </label>
  );
  return (
    <div className="card stack" style={{ gap: 8 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <strong>{name}</strong>
        <button type="button" className={`btn small ${on ? 'danger' : 'secondary'}`} onClick={toggle}>{on ? 'Stop' : 'Play'}</button>
      </div>
      <div className="muted" style={{ fontSize: '0.8rem' }}>{LOOP_DEFS[name].desc}</div>
      {slider('volume', 0, 1)}{slider('rate', name === 'engine' ? 0.5 : 0, 2.5)}{slider('pan', -1, 1)}
    </div>
  );
}

export default function SoundLab() {
  const muted = useSyncExternalStore(subscribeMuted, isMuted, isMuted);
  const [o, setO] = useState({ volume: 1, pan: 0, pitch: 1 });
  const listed = new Set(GROUPS.flatMap((g) => g[1]));
  const other = soundNames().filter((n) => !listed.has(n));
  const btn = (n) => (
    <button key={n} type="button" className="btn small secondary" title={SOUND_DEFS[n]?.desc || n} onClick={() => sound(n, o)}>{n}</button>
  );
  return (
    <div className="stack" style={{ padding: 16, maxWidth: 900, margin: '0 auto' }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0 }}>Sound Lab</h1>
        <div className="row">
          <button type="button" className="btn small ghost" onClick={() => preloadSounds()}>Pre-render all</button>
          <button type="button" className="btn small" onClick={() => setMuted(!muted)}>{muted ? 'Unmute' : 'Mute'}</button>
        </div>
      </div>
      <div className="card stack" style={{ gap: 8 }}>
        {['volume', 'pan', 'pitch'].map((k) => (
          <label key={k} className="row" style={{ gap: 8 }}>
            <span style={{ width: 90 }}>{k} {o[k].toFixed(2)}</span>
            <input type="range" min={k === 'pan' ? -1 : k === 'pitch' ? 0.5 : 0} max={k === 'pitch' ? 2 : 1} step="0.01" value={o[k]} onChange={(e) => setO({ ...o, [k]: Number(e.target.value) })} style={{ flex: 1 }} />
          </label>
        ))}
      </div>
      {[...GROUPS, ['Legacy & aliases', other]].map(([title, names]) => (
        <section key={title} className="stack" style={{ gap: 8 }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem' }}>{title}</h2>
          <div className="row" style={{ gap: 8 }}>{names.map(btn)}</div>
        </section>
      ))}
      <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Loops</h2>
      {loopNames().map((n) => <LoopRow key={n} name={n} />)}
    </div>
  );
}
export { SoundLab };
