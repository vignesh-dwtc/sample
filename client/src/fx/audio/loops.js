// PlayNest audio — real-time loop graphs (lazy-loaded by engine.js).
// Each builder gets { a, out, params, bed, oneShot } and returns { set(params), stop() }.
import { clamp, volumeToGain, engineRpm, cycleHz, firingHz, engineHarmonics, rng, TAU, RATE_MIN, RATE_MAX } from './dsp.js';

const SMOOTH = 0.06; // seconds (setTargetAtTime time constant) — keeps rate changes glitch-free
const to = (param, v, a, tc = SMOOTH) => param.setTargetAtTime(v, a.currentTime, tc);

/** volume + pan stage feeding `out`. */
function stage(a, out) {
  const g = a.createGain(), p = a.createStereoPanner ? a.createStereoPanner() : null;
  if (p) { g.connect(p); p.connect(out); } else g.connect(out);
  return {
    input: g,
    set({ volume = 1, pan = 0 }) { to(g.gain, volumeToGain(volume), a); if (p) to(p.pan, clamp(pan, -1, 1), a); },
  };
}
const noiseBufs = new WeakMap();
/** 3 s stereo noise buffer (white or brown), shared per context. */
function noiseBuffer(a, kind = 'white') {
  let m = noiseBufs.get(a); if (!m) noiseBufs.set(a, (m = {}));
  if (m[kind]) return m[kind];
  const n = a.sampleRate * 3, b = a.createBuffer(2, n, a.sampleRate), r = rng(kind === 'white' ? 11 : 12);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c); let br = 0;
    for (let i = 0; i < n; i++) { const w = r() * 2 - 1; if (kind === 'brown') { br = (br + 0.02 * w) * 0.998; d[i] = br * 3.5; } else d[i] = w; }
  }
  return (m[kind] = b);
}
function loopSrc(a, buf, offset = 0) { const s = a.createBufferSource(); s.buffer = buf; s.loop = true; s.start(0, offset % buf.duration); return s; }
const biq = (a, type, f, q = 0.707) => { const b = a.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
const gain = (a, v) => { const g = a.createGain(); g.gain.value = v; return g; };

export const LOOPS = {
  /** Car engine: PeriodicWave on the 4-stroke cycle frequency (firing orders + half orders), soft-clipped,
   *  load-tracking lowpass, exhaust grumble amplitude-modulated at the firing rate, intake roar, sub thump. */
  engine({ a, out, params }) {
    const st0 = stage(a, out), trim = gain(a, 0.32); trim.connect(st0.input);
    const st = { input: trim, set: st0.set };
    const H = 64, amps = engineHarmonics(H, 7), r = rng(8), real = new Float32Array(H + 1), imag = new Float32Array(H + 1);
    for (let k = 1; k <= H; k++) { const ph = r() * TAU; real[k] = amps[k] * Math.sin(ph); imag[k] = amps[k] * Math.cos(ph); }
    const wave = a.createPeriodicWave(real, imag);
    const o1 = a.createOscillator(), o2 = a.createOscillator();
    o1.setPeriodicWave(wave); o2.setPeriodicWave(wave); o2.detune.value = 7;
    const shaper = a.createWaveShaper(), curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; curve[i] = Math.tanh(2.2 * x) / Math.tanh(2.2); }
    shaper.curve = curve; shaper.oversample = '2x';
    const oscMix = gain(a, 0.45), tone = biq(a, 'lowpass', 800, 0.9), body = biq(a, 'peaking', 120, 1); body.gain.value = 4;
    o1.connect(oscMix); o2.connect(gain(a, 0.35)).connect(oscMix);
    oscMix.connect(shaper); shaper.connect(tone); tone.connect(body); body.connect(st.input);
    // exhaust grumble: brown noise, amplitude-modulated at the firing frequency
    const gSrc = loopSrc(a, noiseBuffer(a, 'brown')), gLp = biq(a, 'lowpass', 160), am = gain(a, 0.5), amOsc = a.createOscillator(), amDepth = gain(a, 0.45);
    amOsc.connect(amDepth); amDepth.connect(am.gain);
    gSrc.connect(gLp); gLp.connect(am); am.connect(gain(a, 0.9)).connect(st.input);
    // intake: white noise band that rises with RPM and opens with throttle
    const iSrc = loopSrc(a, noiseBuffer(a, 'white'), 1.3), iBp = biq(a, 'bandpass', 600, 1.4), iG = gain(a, 0.05);
    iSrc.connect(iBp); iBp.connect(iG); iG.connect(st.input);
    // sub thump at the firing frequency
    const sub = a.createOscillator(), subG = gain(a, 0.18); sub.connect(subG); subG.connect(st.input);
    // slight cyclic unevenness (real engines never hold perfectly steady)
    const wob = a.createOscillator(), wobG = gain(a, 6); wob.frequency.value = 0.7; wob.connect(wobG); wobG.connect(o1.detune); wobG.connect(o2.detune);
    const srcs = [o1, o2, amOsc, sub, wob];
    const set = (p, tc = SMOOTH) => {
      const rpm = engineRpm(p.rate), f = cycleHz(rpm), fire = firingHz(rpm), thr = clamp((p.rate - RATE_MIN) / (RATE_MAX - RATE_MIN));
      to(o1.frequency, f, a, tc); to(o2.frequency, f, a, tc); to(amOsc.frequency, fire, a, tc); to(sub.frequency, fire, a, tc);
      to(tone.frequency, 280 + rpm * 0.5, a, tc); to(gLp.frequency, 110 + rpm * 0.04, a, tc);
      to(iBp.frequency, 350 + rpm * 0.28, a, tc); to(iG.gain, 0.03 + 0.22 * thr * thr, a, tc);
      to(subG.gain, 0.22 - 0.12 * thr, a, tc);
      st.set(p);
    };
    set(params, 0.001);
    srcs.forEach((s) => s.start());
    return { set, stop() { [...srcs, gSrc, iSrc].forEach((s) => { try { s.stop(); } catch { /* ignore */ } }); } };
  },

  /** Tyre roar + tread hum + gusting wind; everything scales with rate (speed, 0..2.5). */
  road({ a, out, params }) {
    const st = stage(a, out);
    const s1 = loopSrc(a, noiseBuffer(a, 'white')), s2 = loopSrc(a, noiseBuffer(a, 'brown'), 0.7), s3 = loopSrc(a, noiseBuffer(a, 'white'), 2.1);
    const roarLp = biq(a, 'lowpass', 600, 0.6), roarG = gain(a, 0.3);
    const humBp = biq(a, 'bandpass', 180, 2), humG = gain(a, 0.4);
    const windHp = biq(a, 'highpass', 900), windBp = biq(a, 'bandpass', 1500, 0.5), windG = gain(a, 0), gust = a.createOscillator(), gustG = gain(a, 0);
    gust.frequency.value = 0.17; gust.connect(gustG); gustG.connect(windG.gain);
    s1.connect(roarLp); roarLp.connect(roarG); roarG.connect(st.input);
    s2.connect(humBp); humBp.connect(humG); humG.connect(st.input);
    s3.connect(windHp); windHp.connect(windBp); windBp.connect(windG); windG.connect(st.input);
    const set = (p, tc = SMOOTH) => {
      const v = clamp((p.rate ?? 1) / 2.5);
      to(roarLp.frequency, 250 + 1400 * v, a, tc); to(roarG.gain, 0.05 + 0.45 * v, a, tc);
      to(humBp.frequency, 120 + 160 * v, a, tc); to(humG.gain, 0.15 + 0.6 * v, a, tc);
      to(windBp.frequency, 900 + 2200 * v, a, tc); to(windG.gain, 0.02 + 0.25 * v * v, a, tc); to(gustG.gain, 0.12 * v * v, a, tc);
      st.set(p);
    };
    set(params, 0.001); gust.start();
    return { set, stop() { [s1, s2, s3, gust].forEach((s) => { try { s.stop(); } catch { /* ignore */ } }); } };
  },

  crowdAmbience: bedLoop('crowdAmbience', { level: 0.8, events: ['crowdChant', 'claps', 'claps', 'crowdCheer'], every: [5, 12] }),
  crickets: bedLoop('crickets', { level: 0.6 }),
  rain: bedLoop('rain', { level: 0.6 }),
  room: bedLoop('room', { level: 0.22 }),
};

/** Seamless pre-rendered bed; `rate` gently shifts playback speed and brightness. Optional distant events. */
function bedLoop(name, { events, every, level = 1 } = {}) {
  return async ({ a, out, params, bed, oneShot }) => {
    const buf = await bed(name);
    const st = stage(a, out), lp = biq(a, 'lowpass', 8000), trim = gain(a, level), src = a.createBufferSource();
    src.buffer = buf; src.loop = true; src.connect(lp); lp.connect(trim); trim.connect(st.input);
    let timer = 0, alive = true;
    const evBus = gain(a, 0.5), evLp = biq(a, 'lowpass', 1800); evBus.connect(evLp); evLp.connect(st.input);
    const set = (p, tc = SMOOTH) => {
      const r = clamp(p.rate ?? 1, 0.25, 2.5);
      to(src.playbackRate, clamp(0.94 + 0.06 * r, 0.9, 1.08), a, tc);
      to(lp.frequency, Math.min(a.sampleRate / 2 - 100, 1500 + 5000 * clamp(r / 1.5)), a, tc);
      st.set(p);
    };
    if (events) {
      const next = () => {
        timer = setTimeout(() => {
          if (!alive) return;
          oneShot(events[(Math.random() * events.length) | 0], { volume: 0.35 + Math.random() * 0.3, pan: Math.random() * 1.6 - 0.8 }, evBus);
          next();
        }, (every[0] + Math.random() * (every[1] - every[0])) * 1000);
      };
      next();
    }
    set(params, 0.001);
    src.start(0, Math.random() * buf.duration);
    return { set, stop() { alive = false; clearTimeout(timer); try { src.stop(); } catch { /* ignore */ } } };
  };
}
