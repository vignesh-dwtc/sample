import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  expDecay, decayPerSample, attackDecay, adsr, swell, engineRpm, firingHz, cycleHz, volumeToGain, brightnessCutoff, impactPitch,
  panGains, dopplerRatio, passBy, modes, makeLoopable, out, rng, engineHarmonics, IDLE_RPM, REDLINE_RPM, gainToDb,
} from './dsp.js';

const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg ?? ''} ${a} ≉ ${b}`);

test('expDecay reaches -60 dB at t60 and is 1 at t=0', () => {
  near(expDecay(0, 0.5), 1, 1e-12);
  near(gainToDb(expDecay(0.5, 0.5)), -60, 1e-9);
  near(gainToDb(expDecay(0.25, 0.5)), -30, 1e-9);
  assert.equal(expDecay(-1, 1), 0);
});
test('decayPerSample compounds to -60 dB over t60', () => {
  const sr = 48000, k = decayPerSample(0.2, sr);
  near(gainToDb(k ** (0.2 * sr)), -60, 1e-6);
});
test('attackDecay ramps linearly then decays', () => {
  near(attackDecay(0.005, 0.01, 1), 0.5, 1e-12);
  near(attackDecay(0.01, 0.01, 1), 1, 1e-12);
  assert.ok(attackDecay(0.5, 0.01, 1) < 1);
});
test('adsr shape: attack, decay to sustain, release to 0', () => {
  const e = { a: 0.1, d: 0.1, s: 0.5, r: 0.2, hold: 1 };
  near(adsr(0.05, e), 0.5, 1e-12); near(adsr(0.1, e), 1, 1e-12); near(adsr(0.5, e), 0.5, 1e-12);
  near(adsr(1.1, e), 0.25, 1e-12); assert.equal(adsr(1.3, e), 0); assert.equal(adsr(-1, e), 0);
});
test('swell is a smooth 0→1→0 bump', () => {
  assert.equal(swell(0, 1, 1, 1), 0); near(swell(0.5, 1, 1, 1), 0.5, 1e-12); assert.equal(swell(1.5, 1, 1, 1), 1); near(swell(3, 1, 1, 1), 0, 1e-12);
});
test('engine rate maps 0.5 → idle and 2.5 → redline, clamped and monotonic', () => {
  assert.equal(engineRpm(0.5), IDLE_RPM); assert.equal(engineRpm(2.5), REDLINE_RPM);
  assert.equal(engineRpm(0), IDLE_RPM); assert.equal(engineRpm(9), REDLINE_RPM); assert.equal(engineRpm(NaN), engineRpm(1));
  for (let r = 0.5; r < 2.5; r += 0.1) assert.ok(engineRpm(r + 0.1) > engineRpm(r));
});
test('4-stroke firing maths', () => {
  assert.equal(firingHz(6000, 4), 200); // 100 rev/s, 2 firings per rev
  assert.equal(cycleHz(6000), 50);
  near(firingHz(IDLE_RPM), 28.33, 0.01);
});
test('volume, brightness and impact mappings', () => {
  assert.equal(volumeToGain(0), 0); assert.equal(volumeToGain(1), 1); assert.equal(volumeToGain(2), 1); assert.ok(volumeToGain(0.5) < 0.5);
  near(brightnessCutoff(0), 900, 1e-9); near(brightnessCutoff(1), 20000, 1e-6); assert.ok(brightnessCutoff(0.6) > brightnessCutoff(0.4));
  near(impactPitch(0), 0.9, 1e-12); near(impactPitch(1), 1.1, 1e-12);
});
test('equal-power panning keeps constant power', () => {
  for (const p of [-1, -0.3, 0, 0.7, 1]) { const [l, r] = panGains(p); near(l * l + r * r, 1, 1e-12); }
  const [l, r] = panGains(-1); near(l, 1, 1e-12); near(r, 0, 1e-12);
});
test('Doppler: approaching is higher, receding lower, pass-by pans across', () => {
  assert.ok(dopplerRatio(30, 1) > 1); assert.ok(dopplerRatio(30, -1) < 1); near(dopplerRatio(30, 0), 1, 1e-12);
  const pb = { speed: 30, dist: 4, tc: 1 };
  assert.ok(passBy(0.5, pb).ratio > 1.05 && passBy(1.5, pb).ratio < 0.95);
  near(passBy(1, pb).gain, 1, 1e-12); assert.ok(passBy(0, pb).pan < -0.5 && passBy(2, pb).pan > 0.5);
});
test('modal synthesis: a mode decays by ~60 dB at its t60', () => {
  const sr = 16000, y = modes(sr, 1, [{ f: 440, a: 1, t60: 0.5, ph: Math.PI / 2 }], { attack: 0 });
  const amp = (t) => { let m = 0; for (let i = Math.round(t * sr); i < Math.round(t * sr) + 80; i++) m = Math.max(m, Math.abs(y[i])); return m; };
  near(gainToDb(amp(0.25) / amp(0)), -30, 1.5);
});
test('makeLoopable shortens by the crossfade and keeps the seam continuous', () => {
  const o = out(1000, 2), r = rng(5); for (let i = 0; i < o.n; i++) { o.L[i] = Math.sin(i / 7) + 0.1 * r(); o.R[i] = o.L[i]; }
  const l = makeLoopable(o, 0.5);
  assert.equal(l.n, 1500); assert.ok(Math.abs(l.L[0] - o.L[1500]) < 0.05, 'loop start continues the old tail');
});
test('engine harmonics emphasise firing orders', () => {
  const h = engineHarmonics(32);
  assert.ok(h[4] > h[3] && h[4] > h[5] && h[8] > h[7]);
});
test('seeded rng is deterministic', () => { const a = rng(9), b = rng(9); for (let i = 0; i < 5; i++) assert.equal(a(), b()); });
