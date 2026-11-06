// OSM tile layer that keeps recently viewed tiles on the phone (Cache API), so the map still
// shows something when the train goes through a dead zone. Network-first, cache fallback.
import L from 'leaflet';

export const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';
const CACHE = 'playnest-travel-tiles';
const MAX_TILES = 700;
const TIMEOUT_MS = 8000;

const hasCache = () => typeof caches !== 'undefined' && typeof window !== 'undefined' && window.isSecureContext;
let puts = 0;

async function trim(cache) {
  const keys = await cache.keys();
  if (keys.length > MAX_TILES) await Promise.all(keys.slice(0, keys.length - MAX_TILES).map((k) => cache.delete(k)));
}

/** Resolve a tile URL to something an <img> can show: a blob: URL (cached or fresh) or the plain URL. */
async function loadTile(url) {
  if (!hasCache()) return { src: url, cached: false };
  let cache;
  try { cache = await caches.open(CACHE); } catch { return { src: url, cached: false }; }
  const fromCache = async () => {
    const hit = await cache.match(url);
    if (!hit) throw new Error('tile not cached');
    return { src: URL.createObjectURL(await hit.blob()), cached: true, blob: true };
  };
  if (navigator.onLine === false) return fromCache();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { mode: 'cors', signal: ctrl.signal });
    if (!res.ok) throw new Error(`tile ${res.status}`);
    const blob = await res.blob();
    cache.put(url, new Response(blob, { headers: { 'Content-Type': blob.type || 'image/png' } }))
      .then(() => { if (++puts % 60 === 0) trim(cache); }).catch(() => {});
    return { src: URL.createObjectURL(blob), cached: false, blob: true };
  } catch {
    return fromCache();
  } finally { clearTimeout(t); }
}

export const CachedTileLayer = L.TileLayer.extend({
  createTile(coords, done) {
    const img = document.createElement('img');
    img.alt = '';
    img.setAttribute('role', 'presentation');
    const url = this.getTileUrl(coords);
    loadTile(url).then(({ src, cached, blob }) => {
      if (blob) img._pnBlob = src;
      img._pnCached = cached;
      img.onload = () => done(null, img);
      img.onerror = (e) => done(e || new Error('tile'), img);
      img.src = src;
    }).catch((e) => done(e, img));
    return img;
  },
  _removeTile(key) {
    const tile = this._tiles[key];
    if (tile?.el?._pnBlob) URL.revokeObjectURL(tile.el._pnBlob);
    L.TileLayer.prototype._removeTile.call(this, key);
  },
});

export const cachedTileLayer = (opts = {}) =>
  new CachedTileLayer(TILE_URL, { maxZoom: 19, attribution: ATTRIBUTION, crossOrigin: true, ...opts });
