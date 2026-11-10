// PlayNest audio — pure DSP helpers (no WebAudio, no DOM). Runs in Node for tests.
// Everything here works on plain Float32Arrays so recipes can be rendered and analysed anywhere.

export const TAU = Math.PI * 2;
export const LN1000 = Math.log(1000); // 60 dB
export const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const dbToGain = (db) => 10 ** (db / 20);
export const gainToDb = (g) => 20 * Math.log10(Math.max(Math.abs(g), 1e-12));

// ---------- seeded randomness ----------
export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// ---------- envelopes ----------
/** Exponential decay reaching -60 dB (x0.001) at t60 seconds. */
export const expDecay = (t, t60) => (t < 0 ? 0 : Math.exp((-LN1000 * t) / Math.max(t60, 1e-6)));
/** Per-sample multiplier that gives a t60 decay. */
export const decayPerSample = (t60, sr) => Math.exp(-LN1000 / (Math.max(t60, 1e-6) * sr));
/** Linear attack then exponential decay. */
export const attackDecay = (t, attack, t60) => (t < 0 ? 0 : t < attack ? t / attack : expDecay(t - attack, t60));
/** ADSR with a gate length (`hold`) and linear release. */
export function adsr(t, { a = 0.01, d = 0.1, s = 0.7, r = 0.2, hold = 0.5 } = {}) {
  if (t < 0) return 0;
  const gated = (x) => (x < a ? x / a : x < a + d ? 1 - ((1 - s) * (x - a)) / d : s);
  if (t < hold) return gated(t);
  const lvl = gated(hold);
  return Math.max(0, lvl * (1 - (t - hold) / r));
}
/** Raised-cosine swell: rise, hold, fall (seconds). */
export function swell(t, rise, hold, fall) {
  if (t < 0) return 0;
  if (t < rise) return 0.5 - 0.5 * Math.cos((Math.PI * t) / rise);
  if (t < rise + hold) return 1;
  const x = (t - rise - hold) / fall;
  return x >= 1 ? 0 : 0.5 + 0.5 * Math.cos(Math.PI * x);
}

// ---------- parameter mapping ----------
export const RATE_MIN = 0.5, RATE_MAX = 2.5, IDLE_RPM = 850, REDLINE_RPM = 7000;
/** Engine loop `rate` (0.5 idle .. 2.5 redline) to crank RPM. */
export function engineRpm(rate) {
  const r = clamp(Number.isFinite(rate) ? rate : 1, RATE_MIN, RATE_MAX);
  return IDLE_RPM + ((r - RATE_MIN) / (RATE_MAX - RATE_MIN)) * (REDLINE_RPM - IDLE_RPM);
}
/** Firing frequency of a 4-stroke engine: each cylinder fires once every two revolutions. */
export const firingHz = (rpm, cylinders = 4) => (rpm / 60) * (cylinders / 2);
/** Full 4-stroke cycle frequency (two crank revolutions); engine waveforms are built on this base. */
export const cycleHz = (rpm) => rpm / 120;
/** Perceptual volume (0..1) to linear gain. */
export const volumeToGain = (v) => Math.pow(clamp(Number.isFinite(v) ? v : 1), 1.6);
/** Volume (impact strength) to a brightness lowpass cutoff: soft hits are duller. */
export const brightnessCutoff = (v) => 900 * Math.pow(20000 / 900, clamp(Number.isFinite(v) ? v : 1));
/** Impact strength to a small pitch lift (harder hits ring a touch higher). */
export const impactPitch = (v) => 0.9 + 0.2 * clamp(Number.isFinite(v) ? v : 1);
/** Equal-power pan gains [left, right] for p in -1..1. */
export function panGains(p) {
  const a = ((clamp(p, -1, 1) + 1) * Math.PI) / 4;
  return [Math.cos(a), Math.sin(a)];
}
/** Doppler frequency ratio for a source moving at v m/s; cosTheta = +1 heading straight at listener. */
export const dopplerRatio = (v, cosTheta, c = 343) => c / (c - v * cosTheta);
/** Straight-line pass-by at `speed` m/s, closest distance `dist` m, closest at time `tc` s. */
export function passBy(t, { speed = 30, dist = 4, tc = 1 } = {}) {
  const x = speed * (t - tc); // negative = approaching
  const r = Math.hypot(x, dist);
  const cos = -x / r;
  return { ratio: dopplerRatio(speed, cos), gain: dist / r, pan: clamp(x / (Math.abs(x) + dist * 1.5), -1, 1) };
}

// ---------- buffers ----------
export function out(sr, dur) {
  const n = Math.max(1, Math.ceil(sr * dur));
  return { sr, n, L: new Float32Array(n), R: new Float32Array(n) };
}
/** Mix a mono signal into a stereo out at `at` seconds with gain and pan. */
export function place(o, mono, at = 0, gain = 1, pan = 0) {
  const s0 = Math.round(at * o.sr);
  const [gl, gr] = panGains(pan);
  const end = Math.min(mono.length, o.n - s0);
  for (let i = Math.max(0, -s0); i < end; i++) { const v = mono[i] * gain; o.L[s0 + i] += v * gl; o.R[s0 + i] += v * gr; }
  return o;
}
/** Mix with a time-varying pan(t). */
export function placeMoving(o, mono, at, gain, panFn) {
  const s0 = Math.round(at * o.sr);
  for (let i = 0; i < mono.length && s0 + i < o.n; i++) {
    if (s0 + i < 0) continue;
    const [gl, gr] = panGains(panFn(i / o.sr));
    o.L[s0 + i] += mono[i] * gain * gl; o.R[s0 + i] += mono[i] * gain * gr;
  }
  return o;
}
export function peakOf(o) {
  let p = 0;
  for (let i = 0; i < o.n; i++) { const a = Math.abs(o.L[i]), b = Math.abs(o.R[i]); if (a > p) p = a; if (b > p) p = b; }
  return p;
}
export function normalize(o, target = 0.89) {
  const p = peakOf(o);
  if (p > 0) { const k = target / p; for (let i = 0; i < o.n; i++) { o.L[i] *= k; if (o.R !== o.L) o.R[i] *= k; } }
  return o;
}
/** Short fade in/out to avoid clicks at the buffer edges. */
export function fadeEdges(o, inSec = 0.001, outSec = 0.01) {
  const ni = Math.min(o.n, Math.round(inSec * o.sr)), no = Math.min(o.n, Math.round(outSec * o.sr));
  for (let i = 0; i < ni; i++) { const g = i / ni; o.L[i] *= g; o.R[i] *= g; }
  for (let i = 0; i < no; i++) { const g = i / no, j = o.n - 1 - i; o.L[j] *= g; o.R[j] *= g; }
  return o;
}
/** Make a seamless loop: the last `x` seconds are equal-power crossfaded into the start. Returns a new, shorter out. */
export function makeLoopable(o, x) {
  const xf = Math.round(x * o.sr), n = o.n - xf, res = { sr: o.sr, n, L: o.L.slice(0, n), R: o.R.slice(0, n) };
  for (let i = 0; i < xf; i++) {
    const t = i / xf, fi = Math.sin((t * Math.PI) / 2), fo = Math.cos((t * Math.PI) / 2);
    res.L[i] = o.L[i] * fi + o.L[n + i] * fo; res.R[i] = o.R[i] * fi + o.R[n + i] * fo;
  }
  return res;
}

// ---------- generators ----------
/** Modal synthesis: sum of exponentially decaying sinusoids via damped two-pole resonators. */
export function modes(sr, dur, list, { attack = 0.0004, gain = 1 } = {}) {
  const n = Math.max(1, Math.ceil(sr * dur)), y = new Float32Array(n);
  for (const m of list) {
    if (!m || m.f <= 0 || m.f >= sr * 0.47) continue;
    const w = (TAU * m.f) / sr, r = decayPerSample(m.t60, sr), c = 2 * r * Math.cos(w), r2 = r * r;
    const a = (m.a ?? 1) * gain, ph = m.ph ?? 0, start = Math.max(0, Math.round((m.at || 0) * sr));
    let y2 = a * Math.sin(ph), y1 = a * r * Math.sin(w + ph);
    const len = Math.min(n - start, Math.ceil(m.t60 * sr * 1.05));
    if (len <= 0) continue;
    y[start] += y2; if (len > 1) y[start + 1] += y1;
    for (let i = 2; i < len; i++) { const v = c * y1 - r2 * y2; y[start + i] += v; y2 = y1; y1 = v; }
  }
  const na = Math.round(attack * sr);
  for (let i = 0; i < na && i < n; i++) y[i] *= i / na;
  return y;
}
export function noise(n, r, color = 'white') {
  const y = new Float32Array(n);
  if (color === 'white') { for (let i = 0; i < n; i++) y[i] = r() * 2 - 1; return y; }
  if (color === 'brown') { let b = 0; for (let i = 0; i < n; i++) { b = (b + 0.02 * (r() * 2 - 1)) * 0.998; y[i] = b * 3.5; } return y; }
  // pink (Paul Kellet economy)
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < n; i++) {
    const w = r() * 2 - 1;
    b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913;
    y[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
  }
  return y;
}

// RBJ biquad coefficients
export function biquadCoeffs(type, f, q, sr, gainDb = 0) {
  const w = (TAU * clamp(f, 10, sr * 0.45)) / sr, cs = Math.cos(w), sn = Math.sin(w), al = sn / (2 * Math.max(q, 0.05));
  const A = 10 ** (gainDb / 40);
  let b0, b1, b2, a0, a1, a2;
  switch (type) {
    case 'highpass': b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; break;
    case 'bandpass': b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; break; // 0 dB peak
    case 'peak': b0 = 1 + al * A; b1 = -2 * cs; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cs; a2 = 1 - al / A; break;
    default: b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; // lowpass
  }
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}
/** In-place biquad. `f` may be a number or a function of time (seconds) for sweeps. */
export function filt(x, sr, type, f, q = 0.707, gainDb = 0) {
  let c = biquadCoeffs(type, typeof f === 'function' ? f(0) : f, q, sr, gainDb);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  const dyn = typeof f === 'function';
  for (let i = 0; i < x.length; i++) {
    if (dyn && (i & 31) === 0) c = biquadCoeffs(type, f(i / sr), q, sr, gainDb);
    const xi = x[i], yi = c[0] * xi + c[1] * x1 + c[2] * x2 - c[3] * y1 - c[4] * y2;
    x2 = x1; x1 = xi; y2 = y1; y1 = yi; x[i] = yi;
  }
  return x;
}
export function envApply(x, sr, fn, offset = 0) { for (let i = 0; i < x.length; i++) x[i] *= fn(i / sr - offset); return x; }
/** Filtered noise burst with attack + t60 decay. */
export function burst(sr, r, { dur, f = 2000, q = 0.8, type = 'bandpass', attack = 0.0005, t60 = 0.05, color = 'white', gain = 1 } = {}) {
  const d = dur ?? Math.min(t60 * 1.1 + attack, 4);
  const x = noise(Math.ceil(sr * d), r, color);
  if (type) filt(x, sr, type, f, q);
  if (type === 'bandpass' && q > 2) filt(x, sr, type, f, q); // steeper for narrow bands
  for (let i = 0; i < x.length; i++) x[i] *= gain * attackDecay(i / sr, attack, t60);
  return x;
}
/** Additive tone with phase accumulation. freq: number | f(t). harm: amplitudes per harmonic. env: f(t). */
export function tone(sr, dur, freq, { harm = [1], env = () => 1, vib = 0, vibRate = 5.5, ph = 0 } = {}) {
  const n = Math.ceil(sr * dur), y = new Float32Array(n), dyn = typeof freq === 'function';
  let p = ph;
  for (let i = 0; i < n; i++) {
    const t = i / sr, f0 = (dyn ? freq(t) : freq) * (1 + vib * Math.sin(TAU * vibRate * t));
    p += (TAU * f0) / sr;
    let s = 0;
    for (let k = 0; k < harm.length; k++) if (harm[k] && f0 * (k + 1) < sr * 0.45) s += harm[k] * Math.sin(p * (k + 1));
    y[i] = s * env(t);
  }
  return y;
}
/** Wavetable oscillator reading a single-cycle table (fast, used for engines). */
export function tableOsc(sr, dur, table, freqFn) {
  const n = Math.ceil(sr * dur), y = new Float32Array(n), N = table.length;
  let p = 0;
  for (let i = 0; i < n; i++) {
    p += (freqFn(i / sr) * N) / sr; if (p >= N) p -= N * Math.floor(p / N);
    const i0 = p | 0, fr = p - i0;
    y[i] = table[i0] + (table[(i0 + 1) % N] - table[i0]) * fr;
  }
  return y;
}
export function softClip(x, drive = 1.5) { const k = Math.tanh(drive); for (let i = 0; i < x.length; i++) x[i] = Math.tanh(x[i] * drive) / k; return x; }

/** Engine harmonic spectrum on the 4-stroke cycle frequency: strong firing orders (multiples of 2 for 4 cyl), weaker half-orders. */
export function engineHarmonics(count = 48, seed = 7, cylinders = 4) {
  const r = rng(seed), amps = new Float32Array(count + 1);
  const order = cylinders / 2 * 2; // firing order in multiples of the cycle frequency (4 for 4 cyl)
  for (let k = 1; k <= count; k++) {
    const firing = k % order === 0, half = k % (order / 2) === 0;
    const base = firing ? 1 : half ? 0.45 : 0.18 + 0.12 * r();
    amps[k] = base / Math.pow(k / order, 0.85) * (k < order ? 0.6 : 1);
  }
  amps[0] = 0;
  return amps;
}
export function engineTable(size = 2048, seed = 7) {
  const amps = engineHarmonics(48, seed), r = rng(seed + 1), ph = amps.map(() => r() * TAU), t = new Float32Array(size);
  for (let k = 1; k < amps.length; k++) for (let i = 0; i < size; i++) t[i] += amps[k] * Math.sin((TAU * k * i) / size + ph[k]);
  let p = 0; for (const v of t) p = Math.max(p, Math.abs(v));
  for (let i = 0; i < size; i++) t[i] /= p;
  return t;
}

/** Procedural impulse response: early reflections + decorrelated exponentially decaying noise that darkens over time. */
export function impulseResponse(sr, { t60 = 1, pre = 0.01, early = [], bright = 9000, dark = 1500, width = 1, seed = 3 } = {}) {
  const r = rng(seed), len = pre + t60 * 1.1, o = out(sr, len);
  for (const [at, g, pan = 0] of early) {
    const i = Math.round(at * sr); if (i < o.n) { const [gl, gr] = panGains(pan); o.L[i] += g * gl; o.R[i] += g * gr; }
  }
  for (const ch of [o.L, o.R]) {
    let lp = 0;
    const s0 = Math.round(pre * sr);
    for (let i = s0; i < o.n; i++) {
      const t = (i - s0) / sr, fc = bright * Math.pow(dark / bright, Math.min(1, t / t60));
      const a = Math.exp((-TAU * fc) / sr);
      lp = (1 - a) * (r() * 2 - 1) + a * lp;
      ch[i] += lp * expDecay(t, t60) * Math.min(1, t / 0.006);
    }
  }
  if (width < 1) for (let i = 0; i < o.n; i++) { const m = (o.L[i] + o.R[i]) / 2; o.L[i] = lerp(m, o.L[i], width); o.R[i] = lerp(m, o.R[i], width); }
  return o;
}
export const SPACES = {
  room: { t60: 0.32, pre: 0.004, early: [[0.004, 0.5, -0.3], [0.007, 0.35, 0.4], [0.011, 0.25, 0]], bright: 7000, dark: 2000 },
  board: { t60: 0.22, pre: 0.002, early: [[0.003, 0.4, 0.2], [0.005, 0.3, -0.2]], bright: 6000, dark: 1800 },
  stadium: { t60: 1.9, pre: 0.035, early: [[0.035, 0.3, -0.6], [0.09, 0.25, 0.6], [0.16, 0.22, -0.2], [0.24, 0.15, 0.3]], bright: 6000, dark: 900 },
  road: { t60: 0.45, pre: 0.006, early: [[0.006, 0.6, 0], [0.03, 0.15, -0.7], [0.05, 0.1, 0.7]], bright: 8000, dark: 1200 },
  hall: { t60: 1.4, pre: 0.02, early: [[0.02, 0.4, -0.5], [0.031, 0.35, 0.5], [0.047, 0.25, 0]], bright: 8000, dark: 2500 },
};
