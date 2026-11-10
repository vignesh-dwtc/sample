// PlayNest audio runtime: one shared AudioContext, master compressor + limiter, per-category buses,
// lazy pre-rendered one-shots (OfflineAudioContext + procedural reverb), loops, mute, battery care.
// Recipes and loop builders are dynamically imported on first use so the main bundle stays small.
import { SOUND_DEFS, LOOP_DEFS, CATEGORY_VOLUME, resolveSound, tierFor } from './registry.js';
import { clamp, volumeToGain, brightnessCutoff, impactPitch, hashStr, SPACES, impulseResponse } from './dsp.js';

const BED_SPACE = { crowdAmbience: ['stadium', 0.35], crickets: ['road', 0.25], rain: [null, 0], room: ['room', 0.2] };

const HAS_WIN = typeof window !== 'undefined';
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const hidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';
const IDLE_MS = 30000;

// ---------- mute (persisted) ----------
const MUTE_KEY = 'playnest.muted';
let muted = (() => { try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; } })();
const muteListeners = new Set();
export const isMuted = () => muted;
export function subscribeMuted(l) { muteListeners.add(l); return () => muteListeners.delete(l); }
export function setMuted(m) {
  muted = !!m;
  try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch { /* ignore */ }
  if (muted) { stopAllVoices(); for (const h of loops) teardown(h, 0); } else { for (const h of loops) build(h); }
  muteListeners.forEach((l) => l());
}

// ---------- context & mix ----------
let ac = null, master = null, idleTimer = 0, lastActive = 0;
const buses = {};
const catVol = { ...CATEGORY_VOLUME };
function ctx() {
  if (ac || !HAS_WIN) return ac;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try { ac = new AC({ latencyHint: 'interactive' }); } catch { try { ac = new AC(); } catch { return null; } }
  const comp = ac.createDynamicsCompressor(); // glue: tames stacked sounds
  comp.threshold.value = -20; comp.knee.value = 10; comp.ratio.value = 3.5; comp.attack.value = 0.004; comp.release.value = 0.25;
  const lim = ac.createDynamicsCompressor(); // brickwall-ish limiter: never clip
  lim.threshold.value = -2; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.1;
  master = ac.createGain(); master.gain.value = 0.9;
  master.connect(comp); comp.connect(lim); lim.connect(ac.destination);
  for (const c of Object.keys(catVol)) { buses[c] = ac.createGain(); buses[c].gain.value = catVol[c]; buses[c].connect(master); }
  idleTimer = setInterval(idleCheck, 5000);
  return ac;
}
/** Get (creating if needed) the context and make sure it's running. */
function wake() {
  const a = ctx();
  lastActive = now();
  if (a && a.state !== 'running' && !hidden()) a.resume?.().catch(() => {});
  return a;
}
function idleCheck() {
  if (!ac || ac.state !== 'running') return;
  const busy = voices.length > 0 || [...loops].some((h) => h.graph);
  if (busy) { lastActive = now(); return; }
  if (now() - lastActive > IDLE_MS) ac.suspend().catch(() => {});
}
export function setCategoryVolume(cat, v) { catVol[cat] = clamp(v, 0, 1); if (buses[cat]) buses[cat].gain.setTargetAtTime(catVol[cat], ac.currentTime, 0.05); }
export const getCategoryVolume = (cat) => catVol[cat];
/** The shared AudioContext (null until created). Exposed for advanced uses and tests. */
export const audioContext = () => ac;

// Unlock on the first user gesture (mobile browsers start contexts suspended).
if (HAS_WIN && typeof document !== 'undefined') {
  const evs = ['pointerdown', 'touchend', 'keydown', 'click'];
  const off = () => evs.forEach((e) => window.removeEventListener(e, unlock, true));
  function unlock() {
    if (muted) return;
    const a = wake();
    if (!a) return off();
    try { const s = a.createBufferSource(); s.buffer = a.createBuffer(1, 1, a.sampleRate); s.connect(a.destination); s.start(0); } catch { /* ignore */ }
    if (a.state === 'running') off(); else a.resume?.().then(() => { if (a.state === 'running') off(); }).catch(() => {});
  }
  evs.forEach((e) => window.addEventListener(e, unlock, { capture: true, passive: true }));
  const onHide = () => { for (const h of loops) teardown(h, 0); ac?.suspend().catch(() => {}); };
  document.addEventListener('visibilitychange', () => {
    if (hidden()) onHide();
    else if (!muted && loops.size) { wake(); for (const h of loops) build(h); }
  });
  window.addEventListener('pagehide', onHide);
}

// ---------- lazy modules & render cache ----------
let recipesP = null, loopsP = null;
const recipes = () => (recipesP ||= import('./recipes.js')); // fallback when Workers are unavailable
const loopMod = () => (loopsP ||= import('./loops.js'));
const cache = new Map(); // key -> AudioBuffer | Promise<AudioBuffer>
const irCache = new Map();
// Heavy JS synthesis runs in a Web Worker (falls back to the main thread). Jobs are serial with two priorities:
// a sound someone is waiting to hear jumps ahead of background preloads.
const jobs = { hi: [], lo: [] };
let pumping = false;
const yieldTask = () => new Promise((res) => setTimeout(res, 0));
function enqueue(job, hi) {
  return new Promise((res, rej) => { const j = { job, res, rej, hi }; (hi ? jobs.hi : jobs.lo).push(j); pump(); });
}
async function pump() {
  if (pumping) return;
  pumping = true;
  while (jobs.hi.length || jobs.lo.length) {
    const j = jobs.hi.shift() || jobs.lo.shift();
    await yieldTask();
    try { j.res(await j.job()); } catch (e) { j.rej(e); }
  }
  pumping = false;
}
let worker = null, wid = 0;
const waiting = new Map();
function getWorker() {
  if (worker !== null) return worker;
  try {
    worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => { const w = waiting.get(e.data.id); if (!w) return; waiting.delete(e.data.id); if (e.data.error) w.rej(new Error(e.data.error)); else w.res(e.data); };
    worker.onerror = (e) => { e.preventDefault?.(); worker = false; waiting.forEach((w) => w.rej(new Error('worker failed'))); waiting.clear(); };
  } catch { worker = false; }
  return worker;
}
/** Render a recipe/bed ('sound') or an impulse response ('ir') off the main thread when possible. */
async function synth(msg) {
  const w = getWorker();
  if (w) {
    try { return await new Promise((res, rej) => { const id = ++wid; waiting.set(id, { res, rej }); w.postMessage({ ...msg, id }); }); } catch { /* fall back */ }
  }
  if (msg.fn === 'ir') return impulseResponse(msg.sr, { ...SPACES[msg.space], seed: hashStr(msg.space) });
  const R = await recipes();
  return R.renderSound(msg.name, msg.sr, msg.seed, msg.opts);
}

function toBuffer(c, o, sr) {
  const b = c.createBuffer(2, o.n, sr);
  b.getChannelData(0).set(o.L); b.getChannelData(1).set(o.R);
  return b;
}
function irFor(space, sr) {
  const k = `${space}|${sr}`;
  if (!irCache.has(k)) irCache.set(k, synth({ fn: 'ir', space, sr }));
  return irCache.get(k);
}
async function withReverb(o, sr, space, wet, { fold = false } = {}) {
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!space || !wet || !OAC) return toBuffer(ac, o, sr);
  const ir = await irFor(space, sr), len = o.n + ir.n;
  const off = new OAC(2, len, sr);
  const src = off.createBufferSource(); src.buffer = toBuffer(off, o, sr);
  const conv = off.createConvolver(); conv.normalize = true; conv.buffer = toBuffer(off, ir, sr);
  const dry = off.createGain(); dry.gain.value = 1 - wet * 0.4;
  const wg = off.createGain(); wg.gain.value = wet;
  src.connect(dry); dry.connect(off.destination); src.connect(conv); conv.connect(wg); wg.connect(off.destination);
  src.start(0);
  const rendered = await new Promise((res, rej) => {
    const p = off.startRendering(); if (p?.then) p.then(res, rej); else off.oncomplete = (e) => res(e.renderedBuffer);
  });
  const L = rendered.getChannelData(0), R = rendered.getChannelData(1);
  let n = rendered.length;
  if (fold) { // seamless loop: wrap the reverb tail back onto the start
    for (let i = o.n; i < rendered.length; i++) { const j = (i - o.n) % o.n; L[j] += L[i]; R[j] += R[i]; }
    n = o.n;
  } else { while (n > o.n && Math.abs(L[n - 1]) < 4e-4 && Math.abs(R[n - 1]) < 4e-4) n -= 64; n = Math.max(o.n, Math.min(rendered.length, n)); }
  let peak = 0; for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const k = peak > 0.95 ? 0.89 / peak : 1;
  const outB = ac.createBuffer(2, n, sr), oL = outB.getChannelData(0), oR = outB.getChannelData(1);
  for (let i = 0; i < n; i++) { oL[i] = L[i] * k; oR[i] = R[i] * k; }
  if (!fold) { const f = Math.min(n, Math.round(sr * 0.02)); for (let i = 0; i < f; i++) { const g = i / f; oL[n - 1 - i] *= g; oR[n - 1 - i] *= g; } }
  return outB;
}
function renderRate(def) { const sr = ac.sampleRate; return def.lowSr ? Math.min(sr, 24000) : Math.min(sr, 48000); }
/** Get (render on first use) one variant of a one-shot. `hi` = someone is waiting to hear it. */
function getBuffer(name, tier, variant, hi = true) {
  const key = `${name}|${tier}|${variant}`;
  const have = cache.get(key);
  if (have) { if (hi && have.job && !have.job.hi) promote(have.job); return Promise.resolve(have); }
  const def = SOUND_DEFS[name];
  let job;
  const p = new Promise((res, rej) => {
    job = { hi, res, rej, job: async () => {
      const sr = renderRate(def);
      const o = await synth({ fn: 'sound', name, sr, seed: hashStr(key) ^ ((Math.random() * 1e9) | 0), opts: { intensity: tier, variant } });
      return withReverb(o, sr, def.space, def.wet ?? 0);
    } };
    (hi ? jobs.hi : jobs.lo).push(job); pump();
  }).then((b) => { cache.set(key, b); return b; }, (e) => { cache.delete(key); throw e; });
  p.job = job;
  cache.set(key, p);
  return p;
}
function promote(job) { const i = jobs.lo.indexOf(job); if (i >= 0) { jobs.lo.splice(i, 1); job.hi = true; jobs.hi.push(job); } }
function getBed(name) {
  const key = `bed|${name}`;
  if (!cache.has(key)) {
    const p = enqueue(async () => {
      const sr = Math.min(ac.sampleRate, 22050), o = await synth({ fn: 'sound', name, sr, seed: hashStr(key), opts: { peak: 0.7, maxRms: 0.25 } });
      const [space, wet] = BED_SPACE[name] || [];
      return withReverb(o, sr, space, wet, { fold: true });
    }, true).then((b) => { cache.set(key, b); return b; }, (e) => { cache.delete(key); throw e; });
    cache.set(key, p);
  }
  return Promise.resolve(cache.get(key));
}
/** Sounds each loop's game is likely to need next: rendered in the background when the loop starts. */
const WARM = {
  crowdAmbience: ['bat', 'edge', 'bounce', 'stumps', 'catch', 'crowdCheer', 'crowdRoar', 'crowdGroan', 'claps', 'whistle'],
  engine: ['crash', 'horn', 'hornCar', 'autoHorn', 'passBy', 'tyre', 'nitro', 'coinPickup'],
  room: ['woodClick', 'strikerHit', 'cushion', 'pocket', 'slide'],
};

// ---------- one-shots ----------
const voices = [];
const MAX_VOICES = 32;
function stopVoice(v) { try { v.src.stop(); } catch { /* already stopped */ } }
function stopAllVoices() { voices.splice(0).forEach(stopVoice); }
function startVoice(buf, name, def, { volume, pan, pitch }, dest) {
  const a = ac;
  const src = a.createBufferSource(); src.buffer = buf;
  let rate = clamp(Number.isFinite(pitch) ? pitch : 1, 0.25, 4) * (1 + (Math.random() * 2 - 1) * (def.jitter ?? 0.03));
  if (def.impact) rate *= impactPitch(volume);
  src.playbackRate.value = rate;
  let node = src;
  const link = (n) => { node.connect(n); node = n; };
  if (def.directional && pan < 0) { // passBy is rendered left→right; swap channels for right→left
    const sp = a.createChannelSplitter(2), mg = a.createChannelMerger(2);
    node.connect(sp); sp.connect(mg, 0, 1); sp.connect(mg, 1, 0); node = mg;
  }
  if (def.bright) { const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = brightnessCutoff(volume); f.Q.value = 0.5; link(f); }
  const g = a.createGain(); g.gain.value = volumeToGain(volume) * (def.level ?? 1) * (1 + (Math.random() * 2 - 1) * 0.06); link(g);
  if (pan && a.createStereoPanner) { const p = a.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); link(p); }
  node.connect(dest || buses[def.cat] || master);
  const v = { src, name, g };
  voices.push(v);
  const same = voices.filter((x) => x.name === name);
  if (same.length > (def.maxVoices ?? 5)) { const old = same[0]; stopVoice(old); voices.splice(voices.indexOf(old), 1); }
  if (voices.length > MAX_VOICES) stopVoice(voices.shift());
  src.onended = () => { const i = voices.indexOf(v); if (i >= 0) voices.splice(i, 1); try { g.disconnect(); } catch { /* ignore */ } };
  src.start();
  return v;
}
function play(name, opts = {}, dest) {
  if (muted) return;
  const canon = resolveSound(name);
  if (!canon) return;
  const a = wake();
  if (!a) return;
  const def = SOUND_DEFS[canon];
  const volume = clamp(Number.isFinite(opts.volume) ? opts.volume : 1, 0, 1);
  if (volume <= 0) return;
  const o = { volume, pan: Number.isFinite(opts.pan) ? opts.pan : 0, pitch: opts.pitch };
  const tier = tierFor(def, volume), nVar = def.variants ?? 3, want = (Math.random() * nVar) | 0;
  const hit = cache.get(`${canon}|${tier}|${want}`);
  if (hit && !hit.then) return void startVoice(hit, canon, def, o, dest);
  // Not rendered yet: use any ready variant now and render the wanted one in the background.
  for (let k = 0; k < nVar; k++) { const b = cache.get(`${canon}|${tier}|${k}`); if (b && !b.then) { getBuffer(canon, tier, want, false).catch(() => {}); return void startVoice(b, canon, def, o, dest); } }
  const t0 = now();
  getBuffer(canon, tier, want).then((b) => { if (!muted && now() - t0 < (def.cat === 'crowd' ? 3000 : 700)) startVoice(b, canon, def, o, dest); }).catch(() => {});
}
/** Play a one-shot: sound(name, { volume 0..1, pan -1..1, pitch (playback-rate multiplier) }). Unknown names are ignored. */
export function sound(name, opts) { try { play(name, opts || {}); } catch { /* never break the game for audio */ } }
/** Warm the render cache (e.g. on a game's intro screen). Renders run in the background at low priority. */
export function preloadSounds(names = Object.keys(SOUND_DEFS)) {
  if (!ctx()) return Promise.resolve();
  return Promise.all(names.map(resolveSound).filter(Boolean).map((n) => getBuffer(n, tierFor(SOUND_DEFS[n], 1), 0, false).catch(() => null)));
}

// ---------- loops ----------
const loops = new Set();
function teardown(h, fadeMs) {
  const g = h.graph;
  if (!g) return;
  h.graph = null;
  const done = () => { try { g.stop(); } catch { /* ignore */ } try { g.out.disconnect(); } catch { /* ignore */ } };
  if (!fadeMs || !ac || ac.state !== 'running') return done();
  const t = ac.currentTime;
  g.out.gain.cancelScheduledValues(t); g.out.gain.setValueAtTime(g.out.gain.value, t); g.out.gain.linearRampToValueAtTime(0, t + fadeMs / 1000);
  setTimeout(done, fadeMs + 60);
}
async function build(h) {
  if (h.graph || h.building || !h.alive || muted || hidden()) return;
  const a = wake();
  if (!a) return;
  h.building = true;
  try {
    const L = await loopMod();
    const outG = a.createGain(); outG.gain.value = 0; outG.connect(buses[LOOP_DEFS[h.name].cat] || master);
    const g = await L.LOOPS[h.name]({ a, out: outG, params: h.params, bed: getBed, oneShot: (n, o, dest) => play(n, o, dest || outG) });
    if (!h.alive || muted || hidden()) { g.stop(); outG.disconnect(); return; }
    h.graph = { ...g, out: outG };
    const t = a.currentTime; outG.gain.setValueAtTime(0, t); outG.gain.linearRampToValueAtTime(1, t + (h.fadeIn ?? 0.3));
  } catch { /* audio is best-effort */ } finally { h.building = false; }
}
/**
 * Start a continuous loop. Returns { set({ volume, rate, pan }), stop(fadeMs) , playing }.
 * Loops go silent while muted or the tab is hidden and come back automatically.
 */
export function loop(name, opts = {}) {
  const ok = !!LOOP_DEFS[name];
  const h = {
    name, alive: ok, graph: null, building: false, fadeIn: (opts.fadeMs ?? 300) / 1000,
    params: { volume: 1, rate: 1, pan: 0 },
    set(p = {}) {
      for (const k of ['volume', 'rate', 'pan']) if (Number.isFinite(p[k])) h.params[k] = p[k];
      if (h.graph) try { h.graph.set(h.params); } catch { /* ignore */ }
      return h;
    },
    stop(fadeMs = 250) { h.alive = false; loops.delete(h); teardown(h, fadeMs); },
    get playing() { return !!h.graph; },
  };
  h.set(opts);
  if (!ok) return h;
  loops.add(h);
  build(h);
  if (WARM[name] && !muted) preloadSounds(WARM[name]);
  return h;
}

/** Render (or fetch from cache) the baked buffer for a sound — for tools, previews and tests. */
export function renderToBuffer(name, { volume = 1, variant = 0 } = {}) {
  const canon = resolveSound(name);
  if (!canon || !ctx()) return Promise.reject(new Error(`cannot render ${name}`));
  return getBuffer(canon, tierFor(SOUND_DEFS[canon], volume), variant);
}
/** Baked, seamless bed buffer for a loop (crowdAmbience, crickets, rain, room). */
export const bedBuffer = (name) => (ctx() ? getBed(name) : Promise.reject(new Error('no audio')));
