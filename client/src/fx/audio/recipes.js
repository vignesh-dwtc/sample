// PlayNest audio — sound recipes (pure: return stereo Float32 buffers, no WebAudio).
// Physically-informed: modal synthesis for struck objects (bats, coins, wood, metal, glass),
// filtered/granular noise for air, friction and crowds, additive brass/bells for fanfares.
// Each recipe is (sr, rand, { intensity, variant }) → { sr, n, L, R }. See registry.js for the catalogue.
import {
  TAU, clamp, out, place, placeMoving, normalize, fadeEdges, makeLoopable, modes, noise, filt, burst, tone,
  tableOsc, softClip, rng, engineTable, cycleHz, attackDecay, expDecay, swell, adsr, passBy, lerp,
} from './dsp.js';

const rv = (r, a, b) => a + (b - a) * r();
const pick = (r, arr) => arr[(r() * arr.length) | 0];
const both = (o, fn) => { fn(o.L); fn(o.R); return o; };
const lp = (o, f, q = 0.707) => both(o, (x) => filt(x, o.sr, 'lowpass', f, q));
const hp = (o, f, q = 0.707) => both(o, (x) => filt(x, o.sr, 'highpass', f, q));
let ENGINE_TABLE = null;
const engTable = () => (ENGINE_TABLE ||= engineTable(2048, 7));

// ---------- building blocks ----------
/** Free-free bar / chime bell: inharmonic partials, long fundamental. */
function chime(sr, f, dur, r, { bright = 1, t60 = 1.4 } = {}) {
  const x = modes(sr, dur, [
    { f, a: 1, t60 }, { f: f * 1.002, a: 0.25, t60: t60 * 0.9, ph: 1 }, { f: f * 2.0, a: 0.18 * bright, t60: t60 * 0.5 },
    { f: f * 2.756, a: 0.28 * bright, t60: t60 * 0.42 }, { f: f * 5.404, a: 0.1 * bright, t60: t60 * 0.2 }, { f: f * 8.93, a: 0.04 * bright, t60: t60 * 0.1 },
  ], { attack: 0.0015 });
  const m = burst(sr, r, { type: 'lowpass', f: 3000, t60: 0.01, gain: 0.25 });
  for (let i = 0; i < m.length && i < x.length; i++) x[i] += m[i];
  return x;
}
/** Church-bell style partials (hum, prime, tierce, quint, nominal). */
function bell(sr, f, dur, r) {
  return modes(sr, dur, [
    { f: f * 0.5, a: 0.35, t60: dur }, { f, a: 1, t60: dur * 0.7 }, { f: f * 1.19, a: 0.4, t60: dur * 0.55 }, { f: f * 1.5, a: 0.25, t60: dur * 0.45 },
    { f: f * 2.0, a: 0.5, t60: dur * 0.35 }, { f: f * 2.52, a: 0.2, t60: dur * 0.2 }, { f: f * 3.01, a: 0.12, t60: dur * 0.15 }, { f: f * 4.1 + r() * 20, a: 0.06, t60: dur * 0.1 },
  ], { attack: 0.001 });
}
/** Brass voice: harmonic brightness tracks the envelope (the defining trait of brass), pitch scoop + delayed vibrato. */
function brass(sr, f, hold, r, { attack = 0.06, release = 0.18, bright = 1, vib = 0.005, scoop = 0.025, bend = 0 } = {}) {
  const dur = hold + release + 0.02, n = Math.ceil(sr * dur), y = new Float32Array(n), H = 16, amps = new Float32Array(H + 1);
  let p = 0;
  const vr = rv(r, 4.8, 5.8);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const env = t < attack ? Math.pow(t / attack, 1.5) : t < hold ? 1 - 0.12 * Math.min(1, (t - attack) / 0.25) : Math.max(0, 0.88 * (1 - (t - hold) / release));
    if ((i & 31) === 0) { const b = clamp(env * bright); for (let k = 1; k <= H; k++) amps[k] = Math.exp(-(k - 1) * (1.5 - 1.0 * b)) * (k === 1 ? 0.8 : 1); }
    const fv = f * (1 - scoop * Math.exp(-t * 35)) * (1 + vib * Math.min(1, t / 0.3) * Math.sin(TAU * vr * t)) * (1 + bend * Math.max(0, (t - hold * 0.4) / hold));
    p += (TAU * fv) / sr;
    let s = 0;
    for (let k = 1; k <= H; k++) if (fv * k < sr * 0.45) s += amps[k] * Math.sin(p * k);
    y[i] = s * env * 0.35;
  }
  const br = burst(sr, r, { dur: attack * 2, type: 'bandpass', f: f * 3, q: 1, t60: attack * 1.5, gain: 0.08 });
  for (let i = 0; i < br.length; i++) y[i] += br[i];
  return y;
}
/** Felt/wood impact: low modes + short lowpassed noise. */
function thump(sr, r, f, { t60 = 0.08, noiseF = 600, noiseGain = 0.6, ratios = [1, 2.3, 4.1], amps = [1, 0.5, 0.2], attack = 0.002 } = {}) {
  const x = modes(sr, t60 * 1.6, ratios.map((k, i) => ({ f: f * k * rv(r, 0.98, 1.02), a: amps[i], t60: t60 / (1 + i * 0.6) })), { attack });
  const nz = burst(sr, r, { type: 'lowpass', f: noiseF, t60: t60 * 0.5, attack, gain: noiseGain });
  for (let i = 0; i < nz.length && i < x.length; i++) x[i] += nz[i];
  return x;
}
/** Hardwood click: stiff disc modes + sharp contact. */
function woodTick(sr, r, f, { t60 = 0.04, click = 0.6, ratios = [1, 1.62, 2.41, 3.13] } = {}) {
  const x = modes(sr, t60 * 1.6, ratios.map((k, i) => ({ f: f * k * rv(r, 0.97, 1.03), a: 1 / (1 + i * 0.7), t60: t60 / (1 + i * 0.4) })), { attack: 0.0003 });
  const c = burst(sr, r, { type: 'bandpass', f: Math.min(f * 1.8, sr * 0.4), q: 0.8, t60: 0.003, gain: click });
  for (let i = 0; i < c.length && i < x.length; i++) x[i] += c[i];
  return x;
}
/** Thin metal disc (coin): circular plate mode ratios, each doubled with a few Hz detune for shimmer. */
function coinRing(sr, r, f, dur, t60 = 0.9) {
  const ratios = [1, 1.594, 2.136, 2.296, 2.653, 2.918, 3.156, 3.5, 4.06];
  const list = [];
  ratios.forEach((k, i) => {
    const a = 1 / (1 + i * 0.35) * rv(r, 0.6, 1), t = t60 / (1 + i * 0.25);
    list.push({ f: f * k, a, t60: t, ph: r() * TAU }, { f: f * k + rv(r, 2, 7), a: a * 0.7, t60: t * 0.95, ph: r() * TAU });
  });
  return modes(sr, dur, list, { attack: 0.0004 });
}
const VOWELS = {
  a: [[750, 1], [1200, 0.55], [2550, 0.22]], e: [[480, 1], [1850, 0.5], [2550, 0.2]], ae: [[660, 1], [1700, 0.5], [2450, 0.2]],
  o: [[480, 1], [850, 0.6], [2450, 0.14]], u: [[340, 1], [760, 0.5], [2350, 0.1]],
};
function formant(src, sr, vowel) {
  const res = new Float32Array(src.length);
  for (const [f, g] of VOWELS[vowel]) {
    const c = filt(src.slice(), sr, 'bandpass', f, f / 110);
    for (let i = 0; i < res.length; i++) res[i] += c[i] * g;
  }
  return res;
}
/** Crowd: many glottal voices (saw → tilt → vowel formants) + formant-shaped babble noise. */
function crowd(o, r, { count = 40, vowels = ['a', 'e'], env = () => 1, shout = [0.6, 1.8], onset = [0, 0.4], rise = 0.2, fall = 0, gain = 1, noiseGain = 0.5, f0s = [[100, 160], [190, 300]] } = {}) {
  const { sr, n } = o, groups = {};
  for (const v of vowels) groups[v] = [new Float32Array(n), new Float32Array(n)];
  for (let v = 0; v < count; v++) {
    const vow = pick(r, vowels), range = pick(r, f0s), f0 = rv(r, range[0], range[1]);
    const st = rv(r, onset[0], onset[1]), len = rv(r, shout[0], shout[1]), pan = rv(r, -0.9, 0.9), g = rv(r, 0.3, 1) * gain;
    const [gl, gr] = [Math.cos(((pan + 1) * Math.PI) / 4), Math.sin(((pan + 1) * Math.PI) / 4)];
    const vibR = rv(r, 4, 7), vibD = rv(r, 0.01, 0.03), s0 = Math.round(st * sr), s1 = Math.min(n, s0 + Math.round(len * sr));
    const [GL, GR] = groups[vow];
    let ph = r(), tilt = 0;
    for (let i = s0; i < s1; i++) {
      const t = (i - s0) / sr, x = t / len;
      const f = f0 * (1 + rise * Math.sin(Math.PI * Math.min(1, x * 1.4)) - fall * x) * (1 + vibD * Math.sin(TAU * vibR * t));
      ph += f / sr; ph -= ph | 0;
      tilt += 0.25 * ((2 * ph - 1) - tilt);
      const e = swell(t, Math.min(0.15, len * 0.3), len * 0.4, len * 0.6 - 0.001) * env(i / sr) * g;
      GL[i] += tilt * e * gl; GR[i] += tilt * e * gr;
    }
  }
  for (const v of vowels) {
    const fl = formant(groups[v][0], sr, v), fr = formant(groups[v][1], sr, v);
    for (let i = 0; i < n; i++) { o.L[i] += fl[i] * 0.6; o.R[i] += fr[i] * 0.6; }
  }
  if (noiseGain > 0) for (const ch of [o.L, o.R]) {
    const b = formant(noise(n, r, 'pink'), sr, vowels[0]);
    for (let i = 0; i < n; i++) ch[i] += b[i] * env(i / sr) * noiseGain * gain * 0.6;
  }
  return o;
}
function clapTemplates(sr, r, k = 8) {
  return Array.from({ length: k }, () => {
    const x = burst(sr, r, { type: 'bandpass', f: rv(r, 900, 2200), q: rv(r, 0.9, 1.6), t60: rv(r, 0.025, 0.06), attack: 0.0006 });
    const b = burst(sr, r, { type: 'lowpass', f: 700, t60: 0.02, gain: 0.3 });
    for (let i = 0; i < b.length && i < x.length; i++) x[i] += b[i];
    return x;
  });
}
function claps(o, r, { start = 0, dur = 2, clappers = 20, rate = [2.8, 4.4], env = () => 1, gain = 1 } = {}) {
  const tpl = clapTemplates(o.sr, r);
  for (let c = 0; c < clappers; c++) {
    const pan = rv(r, -0.9, 0.9), per = 1 / rv(r, rate[0], rate[1]), gc = rv(r, 0.35, 1);
    for (let t = start + r() * per; t < start + dur; t += per * rv(r, 0.92, 1.08)) {
      const e = env(t - start);
      if (e > 0.02) place(o, pick(r, tpl), t, gain * gc * e * rv(r, 0.6, 1), pan);
    }
  }
  return o;
}
function crowdWhistles(o, r, { count = 3, start = 0, span = 2, gain = 0.25 } = {}) {
  for (let w = 0; w < count; w++) {
    const f = rv(r, 2100, 3100), len = rv(r, 0.3, 0.7), up = r() < 0.5;
    const x = tone(o.sr, len, (t) => f * (1 + (up ? 0.25 : -0.15) * Math.sin(Math.PI * Math.min(1, t / len))), { harm: [1, 0.06], env: (t) => swell(t, 0.04, len - 0.12, 0.08), vib: 0.004, vibRate: 7 });
    place(o, x, start + r() * span, gain * rv(r, 0.5, 1), rv(r, -0.8, 0.8));
  }
  return o;
}

// ---------- recipes ----------
export const RECIPES = {
  // ── UI ──
  tap(sr, r) {
    const o = out(sr, 0.12), f = rv(r, 1450, 1650);
    place(o, modes(sr, 0.12, [{ f, a: 1, t60: 0.045 }, { f: f * 2.31, a: 0.3, t60: 0.022 }, { f: f * 0.43, a: 0.55, t60: 0.06 }, { f: f * 3.7, a: 0.1, t60: 0.01 }], { attack: 0.0015 }));
    place(o, burst(sr, r, { type: 'bandpass', f: 3200, q: 0.7, t60: 0.005, gain: 0.35 }));
    return lp(o, 6500);
  },
  click(sr, r) {
    const o = out(sr, 0.08), f = rv(r, 2400, 2800);
    place(o, modes(sr, 0.08, [{ f, a: 1, t60: 0.025 }, { f: f * 1.8, a: 0.35, t60: 0.015 }, { f: f * 0.5, a: 0.3, t60: 0.03 }], { attack: 0.0008 }));
    place(o, burst(sr, r, { type: 'highpass', f: 2500, t60: 0.003, gain: 0.4 }));
    return lp(o, 9000);
  },
  success(sr, r) {
    const o = out(sr, 2.0), notes = [523.25, 659.25, 783.99, 1174.66];
    notes.forEach((f, i) => place(o, chime(sr, f * rv(r, 0.998, 1.002), 1.8 - i * 0.07, r, { t60: 1.5 - i * 0.15 }), i * 0.075, 1 - i * 0.12, -0.35 + i * 0.23));
    return lp(o, 9000);
  },
  error(sr, r) {
    const o = out(sr, 0.5), f = rv(r, 150, 165);
    const bonk = (ff, g) => {
      const x = tone(sr, 0.35, (t) => ff * (1 + 0.22 * Math.exp(-t * 45)), { harm: [1, 0.22, 0.07], env: (t) => attackDecay(t, 0.004, 0.26) });
      const th = burst(sr, r, { type: 'lowpass', f: 450, t60: 0.04, gain: 0.5 });
      for (let i = 0; i < th.length; i++) x[i] += th[i];
      return [x, g];
    };
    place(o, bonk(f, 1)[0]); place(o, bonk(f * 0.84, 0.6)[0], 0.11, 0.6);
    return lp(o, 1800);
  },
  coin(sr, r) {
    const o = out(sr, 1.1), f = rv(r, 2300, 2600);
    place(o, coinRing(sr, r, f * 0.97, 0.12, 0.07), 0, 0.45, -0.15);
    place(o, burst(sr, r, { type: 'highpass', f: 4000, t60: 0.008, gain: 0.5 }), 0, 1, -0.1);
    const ring = coinRing(sr, r, f, 1.05, 0.85);
    place(o, ring, 0.055, 0.7, -0.25); place(o, coinRing(sr, r, f * 1.003, 1.0, 0.8), 0.056, 0.6, 0.3);
    place(o, burst(sr, r, { type: 'highpass', f: 5000, t60: 0.006, gain: 0.6 }), 0.055);
    return hp(o, 600);
  },
  levelup(sr, r) {
    const o = out(sr, 2.0);
    [[392, 0], [523.25, 0.12], [659.25, 0.24]].forEach(([f, at], i) => place(o, brass(sr, f, 0.13, r, { attack: 0.03, release: 0.08, bright: 0.8 }), at, 0.8, -0.3 + i * 0.3));
    const chord = [[523.25, -0.4, 0.7], [659.25, 0.4, 0.6], [783.99, 0, 0.9], [261.63, 0, 0.5]];
    chord.forEach(([f, pan, g]) => place(o, brass(sr, f * rv(r, 0.998, 1.002), 0.8, r, { attack: 0.18, release: 0.45, bright: 1 }), 0.36, g, pan));
    place(o, bell(sr, 1567.98, 1.4, r), 0.36, 0.25, 0.3); place(o, bell(sr, 2093, 1.2, r), 0.5, 0.18, -0.3);
    return lp(o, 8000);
  },
  whoosh(sr, r) {
    const o = out(sr, 0.55), x = noise(o.n, r, 'pink');
    filt(x, sr, 'bandpass', (t) => 300 * Math.pow(2600 / 300, Math.min(1, t / 0.45)), 1.1);
    const body = filt(noise(o.n, r, 'pink'), sr, 'lowpass', 500);
    for (let i = 0; i < o.n; i++) { const e = swell(i / sr, 0.2, 0.03, 0.3); x[i] = (x[i] * 1.4 + body[i] * 0.4) * e; }
    return placeMoving(o, x, 0, 1, (t) => -0.6 + 1.2 * Math.min(1, t / 0.5));
  },
  swoosh(sr, r) {
    const o = out(sr, 0.32), x = noise(o.n, r, 'white');
    filt(x, sr, 'bandpass', (t) => 3800 * Math.pow(700 / 3800, Math.min(1, t / 0.28)), 1.3);
    for (let i = 0; i < o.n; i++) x[i] *= swell(i / sr, 0.06, 0.02, 0.22);
    return placeMoving(o, x, 0, 1, (t) => 0.5 - Math.min(1, t / 0.3));
  },
  flip(sr, r) {
    const o = out(sr, 0.22);
    [0, 0.017, 0.031].forEach((at, i) => place(o, burst(sr, r, { type: 'highpass', f: 1800, t60: 0.014, gain: 0.35 / (i + 1) }), at, 1, rv(r, -0.2, 0.2)));
    const snapAt = rv(r, 0.045, 0.055);
    place(o, burst(sr, r, { type: 'bandpass', f: rv(r, 2400, 3200), q: 0.8, t60: 0.022, attack: 0.0003, gain: 1 }), snapAt);
    place(o, modes(sr, 0.1, [{ f: rv(r, 200, 240), a: 1, t60: 0.05 }, { f: 470, a: 0.4, t60: 0.03 }], { attack: 0.001 }), snapAt, 0.35);
    return o;
  },
  pop(sr, r) {
    const o = out(sr, 0.1), f0 = rv(r, 480, 700);
    place(o, tone(sr, 0.09, (t) => f0 * (1 + Math.min(1.4, t / 0.03)), { harm: [1, 0.12], env: (t) => attackDecay(t, 0.0015, 0.055) }));
    place(o, burst(sr, r, { type: 'highpass', f: 1800, t60: 0.004, gain: 0.35 }));
    return o;
  },
  type(sr, r) {
    const o = out(sr, 0.17), f = rv(r, 1200, 1500), rel = rv(r, 0.07, 0.1);
    place(o, burst(sr, r, { type: 'bandpass', f: 4200, q: 1, t60: 0.008, gain: 0.6 }));
    place(o, modes(sr, 0.05, [{ f, a: 0.6, t60: 0.02 }, { f: f * 2.1, a: 0.3, t60: 0.014 }, { f: f * 3.3, a: 0.15, t60: 0.01 }]));
    place(o, thump(sr, r, rv(r, 520, 640), { t60: 0.025, noiseF: 1500, noiseGain: 0.4 }), 0.006, 0.6);
    place(o, burst(sr, r, { type: 'bandpass', f: 3500, q: 1.2, t60: 0.006, gain: 0.25 }), rel);
    place(o, modes(sr, 0.03, [{ f: f * 1.1, a: 0.25, t60: 0.012 }]), rel);
    return o;
  },

  // ── Cricket ──
  bat(sr, r, { intensity = 1 } = {}) {
    const I = clamp(intensity, 0.2, 1), o = out(sr, 0.6);
    // contact crack: very short broadband transient (brighter + longer on a middled shot)
    place(o, burst(sr, r, { type: 'highpass', f: 900 + 1600 * I, t60: 0.004 + 0.006 * I, attack: 0.0001, gain: 1.4 }));
    place(o, burst(sr, r, { type: 'bandpass', f: 2200 + 800 * I, q: 1.2, t60: 0.012 + 0.01 * I, gain: 0.5 + 0.6 * I }));
    // willow blade modes (lossy wood: short t60s, energy concentrated 1-4 kHz)
    place(o, modes(sr, 0.5, [
      { f: rv(r, 160, 190), a: 0.22, t60: 0.12 }, { f: rv(r, 470, 520), a: 0.35, t60: 0.1 }, { f: rv(r, 1080, 1180), a: 0.3 + 0.5 * I, t60: 0.08 },
      { f: rv(r, 1750, 1900), a: 0.25 + 0.45 * I, t60: 0.065 }, { f: rv(r, 2600, 2800), a: 0.45 * I, t60: 0.05 }, { f: rv(r, 3500, 3800), a: 0.35 * I * I, t60: 0.035 },
    ], { attack: 0.0002 }), 0.0005, 1);
    // leather ball compression
    place(o, modes(sr, 0.1, [{ f: rv(r, 480, 560), a: 0.45, t60: 0.04 }, { f: rv(r, 950, 1050), a: 0.25, t60: 0.03 }]), 0, 0.6);
    return I < 0.8 ? lp(o, 2600) : o;
  },
  edge(sr, r) {
    const o = out(sr, 0.2);
    place(o, burst(sr, r, { type: 'highpass', f: 3000, t60: 0.003, gain: 0.6 }));
    place(o, modes(sr, 0.15, [{ f: rv(r, 2800, 3100), a: 0.6, t60: 0.03 }, { f: rv(r, 4200, 4500), a: 0.4, t60: 0.02 }, { f: 6100, a: 0.2, t60: 0.012 }, { f: 1300, a: 0.15, t60: 0.04 }]), 0, 0.6);
    return o;
  },
  bounce(sr, r) {
    const o = out(sr, 0.3);
    place(o, thump(sr, r, rv(r, 85, 105), { t60: 0.09, noiseF: 900, noiseGain: 0.7, ratios: [1, 2.2, 4.6], amps: [1, 0.5, 0.2] }));
    place(o, burst(sr, r, { type: 'bandpass', f: 2500, q: 0.8, t60: 0.01, gain: 0.12 }));
    return o;
  },
  stumps(sr, r) {
    const o = out(sr, 0.95);
    [0, rv(r, 0.008, 0.02), rv(r, 0.025, 0.05)].forEach((at, i) => {
      const f = rv(r, 380, 460);
      place(o, modes(sr, 0.25, [{ f, a: 1, t60: 0.12 }, { f: f * 2.7, a: 0.5, t60: 0.07 }, { f: f * 5.2, a: 0.25, t60: 0.04 }], { attack: 0.0003 }), at, 1 - i * 0.2, -0.3 + i * 0.3);
      place(o, burst(sr, r, { type: 'bandpass', f: 2500, q: 0.8, t60: 0.005, gain: 0.6 }), at, 1, -0.3 + i * 0.3);
    });
    for (let b = 0; b < 2; b++) {
      let t = rv(r, 0.02, 0.05), gap = rv(r, 0.08, 0.11), g = 0.6;
      const f = rv(r, 2100, 2800), pan = b ? 0.5 : -0.5;
      for (let k = 0; k < 6 && t < 0.9; k++) {
        place(o, modes(sr, 0.06, [{ f: f * rv(r, 0.97, 1.03), a: 1, t60: 0.03 }, { f: f * 2.4, a: 0.5, t60: 0.02 }, { f: f * 4.1, a: 0.2, t60: 0.012 }]), t, g, pan);
        place(o, burst(sr, r, { type: 'highpass', f: 3000, t60: 0.003, gain: g * 0.6 }), t, 1, pan);
        t += gap; gap *= 0.68; g *= 0.65;
      }
    }
    place(o, thump(sr, r, 140, { t60: 0.06, noiseF: 700, noiseGain: 0.5 }), rv(r, 0.22, 0.3), 0.35, 0.2);
    return o;
  },
  catch(sr, r) {
    const o = out(sr, 0.25);
    place(o, burst(sr, r, { type: 'lowpass', f: 2200, t60: 0.045, attack: 0.0008, gain: 1 }));
    place(o, burst(sr, r, { type: 'bandpass', f: 900, q: 1, t60: 0.03, gain: 0.6 }));
    place(o, modes(sr, 0.15, [{ f: rv(r, 130, 160), a: 0.7, t60: 0.06 }, { f: rv(r, 500, 560), a: 0.25, t60: 0.03 }], { attack: 0.001 }));
    return o;
  },
  crowdCheer(sr, r) {
    const o = out(sr, 3.4), env = (t) => swell(t, 0.55, 0.9, 1.8);
    crowd(o, r, { count: 45, vowels: ['a', 'e', 'ae'], env, shout: [0.9, 2.4], onset: [0, 0.7], rise: 0.25, gain: 1 });
    claps(o, r, { start: 0.9, dur: 2.2, clappers: 14, env: (t) => swell(t, 0.4, 0.8, 1.0), gain: 0.12 });
    crowdWhistles(o, r, { count: 2, start: 0.5, span: 1.5, gain: 0.08 });
    return lp(o, 6000);
  },
  crowdRoar(sr, r) {
    const o = out(sr, 4.4), env = (t) => swell(t, 0.35, 1.6, 2.3);
    crowd(o, r, { count: 80, vowels: ['a', 'e', 'ae', 'o'], env, shout: [1.2, 3.0], onset: [0, 0.5], rise: 0.3, gain: 1, noiseGain: 0.7 });
    claps(o, r, { start: 0.6, dur: 3.4, clappers: 30, rate: [3.5, 5], env: (t) => swell(t, 0.3, 1.6, 1.4), gain: 0.14 });
    crowdWhistles(o, r, { count: 7, start: 0.3, span: 2.5, gain: 0.1 });
    for (const ch of [o.L, o.R]) { const b = filt(noise(o.n, r, 'brown'), sr, 'lowpass', 180); for (let i = 0; i < o.n; i++) ch[i] += b[i] * env(i / sr) * 0.25; }
    return lp(o, 6500);
  },
  crowdGroan(sr, r) {
    const o = out(sr, 2.8), env = (t) => swell(t, 0.22, 0.5, 1.8);
    crowd(o, r, { count: 50, vowels: ['o', 'u'], env, shout: [1.0, 2.2], onset: [0, 0.3], rise: 0.06, fall: 0.3, gain: 1, noiseGain: 0.4 });
    return lp(o, 3500);
  },
  claps(sr, r) {
    const o = out(sr, 3.2);
    return claps(o, r, { dur: 3.0, clappers: 30, env: (t) => swell(t, 0.3, 1.5, 1.2) });
  },
  whistle(sr, r) {
    const o = out(sr, 0.75), f = rv(r, 2700, 3050), len = rv(r, 0.38, 0.6), flutter = rv(r, 28, 38);
    const env = (t) => adsr(t, { a: 0.015, d: 0.05, s: 0.85, r: 0.06, hold: len });
    const x = tone(sr, 0.75, (t) => f * (1 + 0.012 * Math.sin(TAU * flutter * t)), { harm: [1, 0.12, 0.04], env: (t) => env(t) * (0.75 + 0.25 * Math.sin(TAU * flutter * t)) });
    const b = burst(sr, r, { dur: 0.75, type: 'bandpass', f, q: 3, t60: 5, gain: 0.25 });
    for (let i = 0; i < x.length; i++) x[i] += b[i] * env(i / sr);
    return place(o, x);
  },
  crowdChant(sr, r) {
    const o = out(sr, 4.2), beat = rv(r, 0.24, 0.28), hits = [0, 2, 4, 5, 6];
    for (let bar = 0; bar < 2; bar++) for (const h of hits) {
      const at = 0.1 + (bar * 8 + h) * beat;
      claps(o, r, { start: at, dur: 0.04, clappers: 25, rate: [30, 30], gain: 0.35 });
    }
    for (let bar = 0; bar < 2; bar++) {
      const at = 0.1 + (bar * 8 + 0) * beat;
      crowd(o, r, { count: 22, vowels: ['e'], env: (t) => swell(t - at, 0.08, beat * 2.2, 0.15), shout: [beat * 3, beat * 3.4], onset: [at - 0.02, at + 0.03], rise: 0, f0s: [[175, 195]], gain: 0.9, noiseGain: 0.3 });
      crowd(o, r, { count: 22, vowels: ['a'], env: (t) => swell(t - at - beat * 4, 0.06, beat * 2.4, 0.3), shout: [beat * 3.4, beat * 3.6], onset: [at + beat * 4 - 0.02, at + beat * 4 + 0.03], rise: 0, f0s: [[145, 160]], gain: 0.9, noiseGain: 0.3 });
    }
    return lp(o, 2600);
  },

  // ── Highway ──
  crash(sr, r) {
    const o = out(sr, 2.0);
    const impacts = [0, rv(r, 0.03, 0.06), rv(r, 0.1, 0.16)];
    impacts.forEach((at, j) => {
      const list = Array.from({ length: 22 }, () => { const f = 150 * Math.pow(30, r()); return { f, a: rv(r, 0.2, 1) / Math.sqrt(f / 300), t60: rv(r, 0.15, 0.7), ph: r() * TAU }; });
      place(o, modes(sr, 0.8, list, { attack: 0.0005 }), at, 0.5 / (j + 1), rv(r, -0.4, 0.4));
      place(o, burst(sr, r, { type: 'bandpass', f: rv(r, 800, 2000), q: 0.6, t60: 0.08, gain: 1.2 / (j + 1) }), at, 1, rv(r, -0.3, 0.3));
    });
    for (let g = 0; g < 140; g++) { const t = 0.35 * r() ** 2; place(o, burst(sr, r, { type: 'bandpass', f: rv(r, 500, 4000), q: 1.2, t60: rv(r, 0.005, 0.02), gain: rv(r, 0.1, 0.5) * (1 - t * 2) }), t, 1, rv(r, -0.6, 0.6)); }
    place(o, thump(sr, r, 55, { t60: 0.35, noiseF: 300, noiseGain: 1, ratios: [1, 1.55, 2.4], amps: [1, 0.6, 0.4] }), 0, 1.3);
    place(o, burst(sr, r, { type: 'highpass', f: 4000, t60: 0.1, gain: 0.5 }), 0.05, 1, 0.2);
    for (let s = 0; s < 55; s++) {
      const t = 0.06 + 1.0 * r() ** 1.8, f = rv(r, 3000, 9000);
      place(o, modes(sr, 0.2, [{ f, a: 1, t60: rv(r, 0.04, 0.18) }, { f: f * rv(r, 1.3, 1.7), a: 0.5, t60: 0.05 }, { f: f * rv(r, 2.1, 2.6), a: 0.25, t60: 0.03 }]), t, rv(r, 0.04, 0.2) * (1.2 - t), rv(r, -0.9, 0.9));
    }
    for (let d = 0; d < 14; d++) {
      const t = 0.15 + 1.3 * r() ** 1.5, f = rv(r, 200, 900);
      place(o, thump(sr, r, f, { t60: rv(r, 0.04, 0.1), noiseF: 1500, noiseGain: 0.4, ratios: [1, 2.3, 3.9] }), t, rv(r, 0.1, 0.35) * (1.5 - t), rv(r, -0.8, 0.8));
    }
    both(o, (x) => softClip(x, 1.2));
    return o;
  },
  horn(sr, r) {
    const o = out(sr, 1.35), f1 = rv(r, 220, 240), hold = rv(r, 0.85, 1.0);
    const harm = Array.from({ length: 22 }, (_, k) => 1 / Math.pow(k + 1, 0.75));
    const env = (t) => adsr(t, { a: 0.06, d: 0.1, s: 0.9, r: 0.14, hold });
    [[f1, -0.15], [f1 * 1.335, 0.15]].forEach(([f, pan]) => {
      const x = tone(sr, 1.3, (t) => f * (0.9 + 0.1 * Math.min(1, t / 0.08)) * (t > hold ? 1 - 0.03 * (t - hold) / 0.14 : 1), { harm, env, vib: 0.002, vibRate: 9 });
      place(o, x, 0, 0.5, pan);
    });
    both(o, (x) => { filt(x, sr, 'peak', 1200, 1, 6); filt(x, sr, 'lowpass', 4500); });
    const b = burst(sr, r, { dur: 1.3, type: 'bandpass', f: 1500, q: 0.7, t60: 10, gain: 0.06 });
    place(o, b.map((v, i) => v * env(i / sr)));
    both(o, (x) => softClip(x, 1.4));
    return o;
  },
  hornCar(sr, r) {
    const o = out(sr, 0.6), f1 = rv(r, 405, 425), hold = rv(r, 0.32, 0.42);
    const harm = [1, 0.3, 0.55, 0.2, 0.38, 0.15, 0.26, 0.1, 0.18, 0.08, 0.12, 0.06, 0.08];
    const env = (t) => adsr(t, { a: 0.012, d: 0.04, s: 0.9, r: 0.05, hold });
    [[f1, -0.1], [f1 * 1.2, 0.1]].forEach(([f, pan]) => place(o, tone(sr, 0.58, f, { harm, env, vib: 0.003, vibRate: 30 }), 0, 0.5, pan));
    both(o, (x) => { filt(x, sr, 'peak', 2200, 2, 8); filt(x, sr, 'lowpass', 5000); softClip(x, 1.8); });
    return o;
  },
  autoHorn(sr, r) {
    const o = out(sr, 0.6), f = rv(r, 560, 650);
    const harm = [1, 0.7, 0.5, 0.4, 0.3, 0.25, 0.2, 0.15, 0.12, 0.1];
    [0, rv(r, 0.24, 0.28)].forEach((at, j) => {
      const len = j ? 0.2 : 0.17;
      const x = tone(sr, len + 0.06, (t) => f * (0.82 + 0.22 * Math.min(1, t / 0.04) - 0.08 * Math.max(0, t - len * 0.7) / len) * (1 + 0.01 * Math.sin(TAU * 47 * t)), { harm, env: (t) => adsr(t, { a: 0.012, d: 0.05, s: 0.8, r: 0.05, hold: len }) });
      place(o, x, at, 0.6);
    });
    both(o, (x) => { filt(x, sr, 'peak', 1800, 3, 10); filt(x, sr, 'peak', 3200, 3, 6); filt(x, sr, 'highpass', 350); softClip(x, 2); });
    return o;
  },
  passBy(sr, r) {
    const dur = 2.6, o = out(sr, dur), pb = { speed: rv(r, 26, 34), dist: rv(r, 3, 5), tc: 1.3 }, rpm = rv(r, 3200, 4000);
    const eng = tableOsc(sr, dur, engTable(), (t) => cycleHz(rpm) * passBy(t, pb).ratio);
    filt(eng, sr, 'lowpass', 1800);
    const tyre = filt(noise(o.n, r, 'pink'), sr, 'bandpass', 700, 0.6), wind = filt(noise(o.n, r, 'white'), sr, 'highpass', 2000);
    const x = new Float32Array(o.n);
    for (let i = 0; i < o.n; i++) { const g = passBy(i / sr, pb).gain; x[i] = (eng[i] * 0.35 + tyre[i] * 1.2 + wind[i] * 0.08 * g) * g * g; }
    filt(x, sr, 'lowpass', (t) => 2000 + 9000 * passBy(t, pb).gain);
    placeMoving(o, x, 0, 1, (t) => passBy(t, pb).pan);
    return fadeEdges(o, 0.05, 0.2);
  },
  tyre(sr, r) {
    const o = out(sr, 0.55), f0 = rv(r, 900, 1300), env = (t) => swell(t, 0.03, 0.22, 0.25);
    const x = tone(sr, 0.55, (t) => f0 * (1 + 0.04 * Math.sin(TAU * 23 * t) + 0.02 * Math.sin(TAU * 61 * t) - 0.08 * t), { harm: [1, 0.4, 0.25, 0.1], env });
    const nz = burst(sr, r, { dur: 0.55, type: 'bandpass', f: f0 * 2, q: 4, t60: 10, gain: 0.5 });
    const hs = burst(sr, r, { dur: 0.55, type: 'highpass', f: 3000, t60: 10, gain: 0.15 });
    for (let i = 0; i < x.length; i++) x[i] = x[i] * 0.6 + (nz[i] + hs[i]) * env(i / sr);
    return place(o, x);
  },
  nitro(sr, r) {
    const dur = 1.5, o = out(sr, dur), env = (t) => swell(t, 0.15, 0.55, 0.7);
    const w = filt(noise(o.n, r, 'pink'), sr, 'bandpass', (t) => 400 * Math.pow(9, Math.min(1, t / 0.7)), 1.4);
    const wh = tone(sr, dur, (t) => 2000 * Math.pow(3.2, Math.min(1, t / 0.8)), { harm: [1], env });
    const rum = tableOsc(sr, dur, engTable(), (t) => 40 + 18 * Math.min(1, t / 0.6));
    filt(rum, sr, 'lowpass', 350);
    const br = filt(noise(o.n, r, 'brown'), sr, 'lowpass', 120);
    const x = new Float32Array(o.n);
    for (let i = 0; i < o.n; i++) { const e = env(i / sr); x[i] = (w[i] * 1.6 + wh[i] * 0.06 + rum[i] * 0.6 + br[i] * 0.6) * e; }
    placeMoving(o, x, 0, 1, (t) => 0.3 * Math.sin(t * 3));
    return o;
  },
  coinPickup(sr, r) {
    const o = out(sr, 0.7), f = rv(r, 2900, 3200);
    place(o, coinRing(sr, r, f, 0.5, 0.35), 0, 0.6, -0.15);
    place(o, coinRing(sr, r, f * 1.335, 0.6, 0.45), 0.065, 0.7, 0.15);
    place(o, burst(sr, r, { type: 'highpass', f: 5000, t60: 0.005, gain: 0.5 }));
    return hp(o, 800);
  },

  // ── Carrom ──
  woodClick(sr, r) { const o = out(sr, 0.12); place(o, woodTick(sr, r, rv(r, 2300, 2800), { t60: 0.04, click: 0.6 })); place(o, modes(sr, 0.05, [{ f: 900, a: 0.2, t60: 0.02 }])); return o; },
  strikerHit(sr, r) {
    const o = out(sr, 0.2);
    place(o, woodTick(sr, r, rv(r, 1300, 1500), { t60: 0.06, click: 0.5, ratios: [1, 1.7, 2.6] }));
    place(o, thump(sr, r, rv(r, 400, 440), { t60: 0.05, noiseF: 1500, noiseGain: 0.3 }), 0, 0.6);
    return o;
  },
  cushion(sr, r) {
    const o = out(sr, 0.28);
    place(o, thump(sr, r, rv(r, 110, 130), { t60: 0.1, noiseF: 600, noiseGain: 0.6, ratios: [1, 2.1, 4.3], amps: [1, 0.5, 0.2], attack: 0.003 }));
    place(o, burst(sr, r, { type: 'bandpass', f: 300, q: 1, t60: 0.05, gain: 0.3 }));
    return lp(o, 2500);
  },
  pocket(sr, r) {
    const o = out(sr, 0.55);
    for (let g = 0; g < 40; g++) { const t = 0.15 * r(); place(o, burst(sr, r, { type: 'bandpass', f: rv(r, 1500, 4000), q: 0.8, t60: rv(r, 0.004, 0.012), gain: rv(r, 0.05, 0.2) * swell(t, 0.02, 0.05, 0.08) }), t, 1, rv(r, -0.3, 0.3)); }
    const drop = rv(r, 0.17, 0.22);
    place(o, woodTick(sr, r, rv(r, 650, 760), { t60: 0.05, click: 0.3, ratios: [1, 2.2, 3.5] }), drop, 0.8);
    place(o, thump(sr, r, 180, { t60: 0.06, noiseF: 800, noiseGain: 0.4 }), drop, 0.6);
    place(o, woodTick(sr, r, rv(r, 700, 800), { t60: 0.03, click: 0.2, ratios: [1, 2.2] }), drop + rv(r, 0.06, 0.08), 0.3);
    return o;
  },
  slide(sr, r) {
    const o = out(sr, 0.55), x = filt(noise(o.n, r, 'pink'), sr, 'bandpass', (t) => 1900 - 900 * Math.min(1, t / 0.5), 0.5);
    for (let i = 0; i < o.n; i++) x[i] *= swell(i / sr, 0.05, 0.15, 0.3);
    return place(o, x);
  },

  // ── Generic ──
  win(sr, r) {
    const o = out(sr, 2.6);
    [[392, 0], [392, 0.11], [392, 0.22]].forEach(([f, at]) => place(o, brass(sr, f, 0.08, r, { attack: 0.02, release: 0.05, bright: 0.85 }), at, 0.7));
    [[261.63, 0, 0.5], [329.63, -0.4, 0.6], [392, 0.4, 0.6], [523.25, 0, 0.9]].forEach(([f, pan, g]) => place(o, brass(sr, f * rv(r, 0.998, 1.002), 1.2, r, { attack: 0.1, release: 0.6 }), 0.36, g, pan));
    place(o, thump(sr, r, 98, { t60: 0.6, noiseF: 400, noiseGain: 0.4, ratios: [1, 1.5, 1.98], amps: [1, 0.5, 0.3] }), 0.36, 0.7);
    [1046.5, 1318.5, 1568, 2093].forEach((f, i) => place(o, bell(sr, f, 1.3, r), 0.5 + i * 0.09, 0.16, -0.5 + i * 0.33));
    return lp(o, 9000);
  },
  lose(sr, r) {
    const o = out(sr, 2.2), notes = [392, 369.99, 349.23];
    notes.forEach((f, i) => place(o, brass(sr, f, 0.26, r, { attack: 0.04, release: 0.08, bright: 0.55, vib: 0.004 }), i * 0.34, 0.8));
    place(o, brass(sr, 329.63, 0.95, r, { attack: 0.05, release: 0.25, bright: 0.55, vib: 0.012, bend: -0.04 }), 1.02, 0.9);
    both(o, (x) => filt(x, sr, 'lowpass', (t) => 900 + 1400 * (0.5 + 0.5 * Math.sin(TAU * (t < 1.02 ? 2.94 : 5.5) * t - 1.5)), 2));
    return o;
  },
  tick(sr, r) {
    const o = out(sr, 0.08);
    place(o, burst(sr, r, { type: 'bandpass', f: 3500, q: 1.5, t60: 0.006, gain: 0.7 }));
    place(o, modes(sr, 0.06, [{ f: rv(r, 2000, 2200), a: 0.6, t60: 0.025 }, { f: 4700, a: 0.3, t60: 0.012 }, { f: 900, a: 0.2, t60: 0.02 }]));
    return o;
  },
  beep(sr) { const o = out(sr, 0.3); return place(o, beepTone(sr, 880, 0.14)); },
  beepHigh(sr) { const o = out(sr, 0.6); return place(o, beepTone(sr, 1760, 0.38)); },
  countdown(sr) {
    const o = out(sr, 3.6);
    [0, 1, 2].forEach((at) => place(o, beepTone(sr, 880, 0.14), at, 0.8));
    return place(o, beepTone(sr, 1760, 0.4), 3, 1);
  },
  heartbeat(sr, r) {
    const o = out(sr, 0.6);
    place(o, thump(sr, r, rv(r, 48, 55), { t60: 0.16, noiseF: 150, noiseGain: 0.4, ratios: [1, 1.8], amps: [1, 0.4], attack: 0.012 }));
    place(o, thump(sr, r, rv(r, 60, 66), { t60: 0.12, noiseF: 160, noiseGain: 0.3, ratios: [1, 1.8], amps: [1, 0.4], attack: 0.01 }), rv(r, 0.16, 0.19), 0.75);
    return lp(o, 300);
  },

  // ── Legacy ──
  hit(sr, r) {
    const o = out(sr, 0.25);
    place(o, modes(sr, 0.2, [{ f: rv(r, 150, 190), a: 1, t60: 0.09 }, { f: rv(r, 360, 400), a: 0.5, t60: 0.06 }, { f: rv(r, 850, 950), a: 0.3, t60: 0.03 }], { attack: 0.0005 }));
    place(o, burst(sr, r, { type: 'bandpass', f: 1800, q: 1, t60: 0.015, gain: 0.8 }));
    place(o, burst(sr, r, { type: 'lowpass', f: 700, t60: 0.03, gain: 0.5 }));
    return o;
  },
  engine(sr, r) {
    const dur = 1.15, o = out(sr, dur), base = rv(r, 1000, 1200), peak = rv(r, 4000, 5000);
    const rpm = (t) => base + (peak - base) * swell(t, 0.35, 0.1, 0.6);
    const x = tableOsc(sr, dur, engTable(), (t) => cycleHz(rpm(t)));
    const intake = filt(noise(o.n, r, 'white'), sr, 'bandpass', (t) => 500 + rpm(t) / 4, 1.2);
    for (let i = 0; i < o.n; i++) { const t = i / sr; x[i] = x[i] + intake[i] * 0.25 * swell(t, 0.3, 0.1, 0.5); }
    filt(x, sr, 'lowpass', (t) => 300 + rpm(t) * 0.45);
    softClip(x, 2);
    place(o, x);
    return fadeEdges(o, 0.03, 0.2);
  },
};
function beepTone(sr, f, hold) {
  return tone(sr, hold + 0.1, f, { harm: [1, 0.18, 0.06, 0.03], env: (t) => adsr(t, { a: 0.004, d: 0.05, s: 0.8, r: 0.07, hold }) });
}

// ---------- ambient beds for loops (rendered at a low sample rate, seamless) ----------
export const BEDS = {
  crowdAmbience(sr, r) {
    const o = out(sr, 10.5);
    const lfo = (t) => 0.75 + 0.15 * Math.sin(TAU * 0.13 * t) + 0.1 * Math.sin(TAU * 0.31 * t + 1);
    crowd(o, r, { count: 170, vowels: ['a', 'e', 'o', 'ae'], env: lfo, shout: [0.25, 0.9], onset: [0, 10.2], rise: 0.08, gain: 0.35, noiseGain: 0.9 });
    claps(o, r, { start: 0, dur: 10.5, clappers: 3, rate: [1, 2], gain: 0.05 });
    return makeLoopable(lp(o, 2400), 1.5);
  },
  crickets(sr, r) {
    const o = out(sr, 9);
    for (let k = 0; k < 7; k++) {
      const fc = rv(r, 3800, 5200), pr = rv(r, 35, 60), np = 3 + ((r() * 3) | 0), per = rv(r, 0.5, 1.2), pan = rv(r, -0.9, 0.9), g = rv(r, 0.15, 1);
      const plen = 0.6 / pr, pulse = tone(sr, plen, fc, { harm: [1, 0.05], env: (t) => Math.sin((Math.PI * t) / plen) ** 2 });
      for (let t = r() * per; t < 9; t += per * rv(r, 0.9, 1.1)) for (let p = 0; p < np; p++) place(o, pulse, t + p / pr, g * (p === 0 ? 0.7 : 1), pan);
    }
    for (const ch of [o.L, o.R]) {
      const c = filt(noise(o.n, r, 'white'), sr, 'bandpass', 4600, 8);
      const w = filt(noise(o.n, r, 'brown'), sr, 'lowpass', 300);
      for (let i = 0; i < o.n; i++) { const t = i / sr; ch[i] += c[i] * 0.25 * (0.5 + 0.5 * Math.sin(TAU * 0.7 * t + ch.length)) + w[i] * 0.15; }
    }
    return makeLoopable(o, 1);
  },
  rain(sr, r) {
    const o = out(sr, 8);
    for (const ch of [o.L, o.R]) { const x = filt(filt(noise(o.n, r, 'pink'), sr, 'highpass', 500), sr, 'lowpass', 7000); const b = filt(noise(o.n, r, 'brown'), sr, 'lowpass', 200); for (let i = 0; i < o.n; i++) ch[i] += x[i] * 0.4 + b[i] * 0.2; }
    for (let d = 0; d < 8 * 140; d++) {
      const f = rv(r, 1500, 4500), t60 = rv(r, 0.006, 0.02);
      place(o, tone(sr, t60, (t) => f * (1 + 0.3 * t / t60), { env: (t) => attackDecay(t, 0.0005, t60) }), r() * 8, rv(r, 0.02, 0.12), rv(r, -1, 1));
    }
    return makeLoopable(o, 1);
  },
  room(sr, r) {
    const o = out(sr, 7);
    const hum = tone(sr, 7, 50, { harm: [1, 0.3, 0.15] });
    for (const ch of [o.L, o.R]) {
      const b = filt(noise(o.n, r, 'brown'), sr, 'lowpass', 180), p = filt(noise(o.n, r, 'pink'), sr, 'lowpass', 1200);
      for (let i = 0; i < o.n; i++) { const t = i / sr; ch[i] += b[i] * 0.5 * (0.9 + 0.1 * Math.sin(TAU * 0.07 * t)) + p[i] * 0.08 + hum[i] * 0.03; }
    }
    return makeLoopable(o, 1);
  },
};

/** Render a one-shot or bed to a normalized stereo buffer. */
export function renderSound(name, sr, seed, opts = {}) {
  const fn = RECIPES[name] || BEDS[name];
  if (!fn) throw new Error(`Unknown sound: ${name}`);
  const r = rng(seed);
  const o = fn(sr, r, opts);
  if (!BEDS[name]) fadeEdges(o, 0, 0.01);
  if (o.R === o.L) o.R = o.L.slice();
  normalize(o, opts.peak ?? 0.89);
  // Loudness balance: sustained sounds (horns, beeps) would dwarf transients at equal peak, so cap RMS.
  let ss = 0; for (let i = 0; i < o.n; i++) ss += (o.L[i] * o.L[i] + o.R[i] * o.R[i]) / 2;
  const rms = Math.sqrt(ss / o.n), cap = opts.maxRms ?? 0.2;
  if (rms > cap) { const k = cap / rms; for (let i = 0; i < o.n; i++) { o.L[i] *= k; o.R[i] *= k; } }
  return o;
}
export { lerp, expDecay };
