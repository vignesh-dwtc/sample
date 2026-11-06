import { useEffect, useId, useRef, useState } from 'react';
import { localMatches, searchHit } from './hubLogic.js';
import { nominatim } from './net.js';

/**
 * Destination search: instant on-device suggestions for popular places, plus Nominatim search
 * (debounced 650 ms, top 5) when online. onPick({name, detail, lat, lon}).
 */
export default function DestinationSearch({ online, onPick, autoFocus }) {
  const id = useId();
  const [q, setQ] = useState('');
  const [remote, setRemote] = useState({ q: '', hits: [], status: 'idle' });
  const ctl = useRef(null);

  useEffect(() => {
    const s = q.trim();
    ctl.current?.abort();
    if (s.length < 3 || !online) { setRemote({ q: s, hits: [], status: 'idle' }); return undefined; }
    setRemote((r) => ({ ...r, status: 'waiting' }));
    const t = setTimeout(() => {
      const c = new AbortController();
      ctl.current = c;
      setRemote((r) => ({ ...r, status: 'loading' }));
      nominatim('search', { q: s, limit: 5, addressdetails: 0 }, { signal: c.signal })
        .then((rows) => !c.signal.aborted && setRemote({ q: s, hits: (rows || []).slice(0, 5).map(searchHit).filter((h) => Number.isFinite(h.lat)), status: 'done' }))
        .catch(() => !c.signal.aborted && setRemote({ q: s, hits: [], status: 'error' }));
    }, 650);
    return () => clearTimeout(t);
  }, [q, online]);

  useEffect(() => () => ctl.current?.abort(), []);

  const locals = localMatches(q, 5);
  // Popular places whose name starts with the query go first: a short query like "Chen" otherwise puts
  // obscure global Nominatim hits above Chennai and the trip silently gets the wrong destination.
  const sl = q.trim().toLowerCase();
  const merged = locals.filter((l) => l.name.toLowerCase().startsWith(sl)).slice(0, 3);
  for (const h of remote.hits) if (merged.length < 6 && !merged.some((m) => m.name.toLowerCase() === h.name.toLowerCase())) merged.push(h);
  for (const l of locals) if (merged.length < 6 && !merged.some((h) => h.name.toLowerCase() === l.name.toLowerCase())) merged.push(l);
  const s = q.trim();

  return (
    <div className="tvh-search">
      <label htmlFor={id} className="pn-sr-only">Search for a destination</label>
      <div className="tvh-search-box">
        <span aria-hidden="true">🔎</span>
        <input id={id} className="input" type="search" value={q} placeholder="Where are you going? e.g. Chennai"
          autoComplete="off" enterKeyHint="search" autoFocus={autoFocus}
          onChange={(e) => setQ(e.target.value)} aria-describedby={`${id}-hint`} />
        {(remote.status === 'loading' || remote.status === 'waiting') && <span className="tvh-spinner" aria-label="Searching" />}
      </div>
      <p id={`${id}-hint`} className="small muted tvh-search-hint" aria-live="polite">
        {!online && s.length >= 2 ? '📴 Offline — showing popular places only. Full search works when you’re back online.'
          : remote.status === 'error' ? 'Search is slow or unavailable — try again, or pick a popular place.'
          : remote.status === 'done' && !merged.length ? `No places found for “${remote.q}”.`
          : s.length > 0 && s.length < 3 && !locals.length ? 'Keep typing…' : ' '}
      </p>
      {merged.length > 0 && (
        <ul className="tvh-results" role="listbox" aria-label="Destinations">
          {merged.map((h) => (
            <li key={`${h.name}-${h.lat}-${h.lon}`}>
              <button type="button" role="option" aria-selected="false" className="tvh-result" onClick={() => { onPick(h); setQ(''); }}>
                <span aria-hidden="true">📍</span>
                <span className="tvh-result-text"><strong>{h.name}</strong><span className="small muted">{h.detail}</span></span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
