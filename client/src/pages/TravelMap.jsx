import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { TravelShell, useTravel } from '../travel/TravelShell.jsx';
import { MODES } from '../travel/trip.js';
import { bearing, formatKm, formatDuration, formatTime } from '../travel/geo.js';
import { cachedTileLayer } from '../travel/places/tiles.js';
import { thinRoute, tripStats } from '../travel/places/route.js';
import './TravelMap.css';

const INDIA = [21.5, 79];
const FOLLOW_ZOOM = 14;

export default function TravelMap() {
  return (
    <TravelShell title="Live Map" icon="🗺️">
      <LiveMap />
    </TravelShell>
  );
}

const emojiIcon = (emoji, cls) => L.divIcon({
  className: `tm-pin ${cls}`, html: `<span>${emoji}</span>`, iconSize: [34, 34], iconAnchor: [17, 30],
});
const meIcon = (heading) => L.divIcon({
  className: 'tm-me-wrap',
  html: `<div class="tm-me">${heading == null ? '' : `<div class="tm-me-arrow" style="transform:rotate(${Math.round(heading)}deg)"></div>`}<div class="tm-me-dot"></div></div>`,
  iconSize: [44, 44], iconAnchor: [22, 22],
});

/** Heading from GPS when moving, else from the last two recorded points. */
function headingOf(position, points) {
  if (position && Number.isFinite(position.heading) && (position.speed ?? 1) > 0.5) return position.heading;
  if (points?.length >= 2) {
    const a = points[points.length - 2], b = points[points.length - 1];
    if (Date.now() - b[2] < 10 * 60000) return bearing({ lat: a[0], lon: a[1] }, { lat: b[0], lon: b[1] });
  }
  return null;
}

function LiveMap() {
  const { position, trip, online, geoStatus, startGps } = useTravel();
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const layers = useRef({});
  const [follow, setFollow] = useState(true);
  const followRef = useRef(true);
  followRef.current = follow;
  const [tiles, setTiles] = useState({ loaded: 0, failed: 0 });
  const [now, setNow] = useState(Date.now());

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);

  const points = trip?.points;
  const nPoints = points?.length || 0;
  // Re-thin only when new points arrive.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const route = useMemo(() => thinRoute(points || []), [nPoints, trip?.id]);
  const dest = trip?.destination && Number.isFinite(trip.destination.lat) ? trip.destination : null;
  const origin = trip?.origin || (points?.[0] ? { lat: points[0][0], lon: points[0][1] } : null);
  const here = position ? [position.lat, position.lon] : (nPoints ? [points[nPoints - 1][0], points[nPoints - 1][1]] : null);
  const heading = headingOf(position, points);
  const stats = tripStats(trip, position, now);

  // Create the map once.
  useEffect(() => {
    const map = L.map(elRef.current, { zoomControl: true, attributionControl: true, worldCopyJump: true, zoomSnap: 0.5 });
    map.attributionControl.setPrefix(false);
    map.setView(here || INDIA, here ? FOLLOW_ZOOM : 5);
    const tl = cachedTileLayer({ keepBuffer: 3 }).addTo(map);
    let loaded = 0, failed = 0, timer = null;
    const flush = () => { timer = null; setTiles({ loaded, failed }); };
    const bump = () => { if (!timer) timer = setTimeout(flush, 400); };
    // `loaded` counts every tile shown since the map opened (cached ones stay on screen offline);
    // `failed` is per batch, so one dead zone doesn't hide a map that is still visible.
    tl.on('loading', () => { failed = 0; bump(); });
    tl.on('tileload', () => { loaded++; bump(); });
    tl.on('tileerror', () => { failed++; bump(); });
    const L_ = layers.current;
    L_.route = L.polyline([], { color: '#9d84ff', weight: 5, opacity: 0.95, lineJoin: 'round' }).addTo(map);
    L_.toDest = L.polyline([], { color: '#ffd166', weight: 3, opacity: 0.9, dashArray: '8 10' }).addTo(map);
    L_.acc = L.circle([0, 0], { radius: 1, color: '#22d3a6', weight: 1, fillColor: '#22d3a6', fillOpacity: 0.12, interactive: false });
    L_.me = L.marker([0, 0], { icon: meIcon(null), zIndexOffset: 1000, keyboard: false });
    L_.origin = L.marker([0, 0], { icon: emojiIcon('🏁', 'tm-origin'), title: 'Start' });
    L_.dest = L.marker([0, 0], { icon: emojiIcon('📍', 'tm-dest') });
    map.on('dragstart', () => setFollow(false));
    mapRef.current = map;
    // Leaflet measures its container on init; re-measure after layout settles.
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(elRef.current);
    return () => { ro.disconnect(); clearTimeout(timer); map.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Route + origin.
  useEffect(() => {
    const { route: line, origin: om } = layers.current;
    const map = mapRef.current;
    if (!map) return;
    line.setLatLngs(route);
    if (origin) { om.setLatLng([origin.lat, origin.lon]); if (!map.hasLayer(om)) om.addTo(map); } else om.remove();
  }, [route, origin?.lat, origin?.lon]); // eslint-disable-line react-hooks/exhaustive-deps

  // Destination marker + dashed line.
  useEffect(() => {
    const { dest: dm, toDest } = layers.current;
    const map = mapRef.current;
    if (!map) return;
    if (dest) {
      dm.setLatLng([dest.lat, dest.lon]);
      // Leaflet treats a string as HTML; the name comes from Nominatim/user input, so pass a text node.
      dm.unbindTooltip().bindTooltip(document.createTextNode(dest.name || 'Destination'), { direction: 'top', offset: [0, -28] });
      if (!map.hasLayer(dm)) dm.addTo(map);
      toDest.setLatLngs(here ? [here, [dest.lat, dest.lon]] : []);
    } else { dm.remove(); toDest.setLatLngs([]); }
  }, [dest?.lat, dest?.lon, dest?.name, here?.[0], here?.[1]]); // eslint-disable-line react-hooks/exhaustive-deps

  // Current position, accuracy and heading; follow-me.
  useEffect(() => {
    const { me, acc } = layers.current;
    const map = mapRef.current;
    if (!map) return;
    if (!here) { me.remove(); acc.remove(); return; }
    me.setLatLng(here).setIcon(meIcon(heading));
    if (!map.hasLayer(me)) me.addTo(map);
    if (position?.accuracy) { acc.setLatLng(here).setRadius(position.accuracy); if (!map.hasLayer(acc)) acc.addTo(map); } else acc.remove();
    if (followRef.current) map.setView(here, map.getZoom() < 10 ? FOLLOW_ZOOM : map.getZoom(), { animate: true });
  }, [here?.[0], here?.[1], position?.accuracy, heading]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleFollow = () => {
    const next = !follow;
    setFollow(next);
    if (next && here && mapRef.current) mapRef.current.setView(here, Math.max(mapRef.current.getZoom(), FOLLOW_ZOOM));
  };

  const fitRoute = () => {
    const map = mapRef.current;
    if (!map) return;
    const pts = [...route];
    if (here) pts.push(here);
    if (dest) pts.push([dest.lat, dest.lon]);
    if (origin) pts.push([origin.lat, origin.lon]);
    setFollow(false);
    if (pts.length === 1) map.setView(pts[0], FOLLOW_ZOOM);
    else if (pts.length) map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 16 });
  };

  const noTiles = (!online && tiles.loaded === 0) || (tiles.failed > 0 && tiles.loaded === 0);
  const someCached = !online && tiles.loaded > 0;
  const mode = MODES[trip?.mode];

  return (
    <div className={`tm-page${trip ? '' : ' no-trip'}`}>
      {!trip && (
        <div className="card tm-notrip">
          <span aria-hidden="true">🧳</span>
          <p>No trip yet. Start one to record your route, distance and ETA.</p>
          <Link to="/travel" className="btn small">Start a trip</Link>
        </div>
      )}
      <div className={`tm-wrap${noTiles ? ' no-tiles' : ''}`}>
        <div ref={elRef} className="tm-map" role="region" aria-label="Live trip map" />

        {trip && <div className="tm-stats" aria-live="off">
          <Stat label="Travelled" value={formatKm(stats.travelledKm)} />
          <Stat label="Speed" value={stats.speedKmh == null ? '—' : `${Math.round(stats.speedKmh)} km/h`} />
          {dest
            ? <Stat label={`ETA · ${formatKm(stats.toGoKm)} to go`} value={stats.etaMs == null ? '—' : formatTime(now + stats.etaMs)} title={stats.etaMs == null ? '' : `about ${formatDuration(stats.etaMs)}`} />
            : <Stat label="Mode" value={mode ? `${mode.icon} ${mode.label}` : '—'} />}
        </div>}

        {noTiles && (
          <div className="tm-offline" role="status">
            <strong>📴 Map needs internet</strong>
            <span>Your route is still being recorded (<b className="tm-nowrap">{formatKm(stats.travelledKm)}</b>).</span>
          </div>
        )}
        {someCached && <div className="tm-cached" role="status">📴 Offline · saved map</div>}

        {!here && geoStatus !== 'watching' && (
          <div className="tm-gps">
            <button type="button" className="btn" onClick={startGps}>
              {geoStatus === 'denied' ? '📍 Location blocked' : geoStatus === 'prompt' ? '📍 Finding you…' : '📍 Show where I am'}
            </button>
          </div>
        )}

        <div className="tm-controls">
          <button type="button" className={`tm-ctl${follow ? ' on' : ''}`} onClick={toggleFollow} aria-pressed={follow} title="Follow me" disabled={!here}>
            <span aria-hidden="true">🎯</span><span className="tm-ctl-label">{follow ? 'Following' : 'Follow'}</span>
          </button>
          <button type="button" className="tm-ctl" onClick={fitRoute} title="Show whole route">
            <span aria-hidden="true">🗺️</span><span className="tm-ctl-label">Fit route</span>
          </button>
        </div>
      </div>
      {dest && <p className="small muted tm-foot">Dashed line: as the crow flies to {dest.name || 'your destination'}. ETA is a rough guess from your pace.</p>}
    </div>
  );
}

function Stat({ label, value, title }) {
  return (
    <div className="tm-stat" title={title || undefined}>
      <span className="tm-stat-v mono">{value}</span>
      <span className="tm-stat-l">{label}</span>
    </div>
  );
}
