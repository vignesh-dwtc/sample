// PlayNest audio — offline analysis helpers for tests and quality checks (pure; not bundled by the app).

export function stats(x, sr) {
  let peak = 0, ss = 0, nan = 0;
  for (let i = 0; i < x.length; i++) { const v = x[i]; if (!Number.isFinite(v)) { nan++; continue; } const a = Math.abs(v); if (a > peak) peak = a; ss += v * v; }
  // 5 ms RMS envelope
  const w = Math.max(1, Math.round(sr * 0.005)), env = [];
  for (let i = 0; i + w <= x.length; i += w) { let s = 0; for (let j = i; j < i + w; j++) s += x[j] * x[j]; env.push(Math.sqrt(s / w)); }
  let pi = 0; env.forEach((v, i) => { if (v > env[pi]) pi = i; });
  const ep = env[pi] || 0;
  let a10 = 0; while (a10 < pi && env[a10] < ep * 0.1) a10++;
  let d = pi; while (d < env.length && env[d] > ep * 0.01) d++; // -40 dB
  return {
    peak, rms: Math.sqrt(ss / Math.max(1, x.length)), nan,
    attackMs: (pi - a10) * 5, peakMs: pi * 5,
    t40: ((d - pi) * w) / sr, // seconds from envelope peak to -40 dB
    centroid: centroid(x, sr), dur: x.length / sr,
  };
}
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const ar = re[i + j], ai = im[i + j], br = re[i + j + len / 2] * cr - im[i + j + len / 2] * ci, bi = re[i + j + len / 2] * ci + im[i + j + len / 2] * cr;
        re[i + j] = ar + br; im[i + j] = ai + bi; re[i + j + len / 2] = ar - br; im[i + j + len / 2] = ai - bi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}
/** Energy-weighted spectral centroid (Hz) over Hann-windowed 2048-sample frames. */
export function centroid(x, sr, N = 2048) {
  let num = 0, den = 0;
  for (let s = 0; s + N <= Math.max(x.length, N); s += N / 2) {
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = (x[s + i] || 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
    fft(re, im);
    for (let k = 1; k < N / 2; k++) { const m = re[k] * re[k] + im[k] * im[k]; num += m * (k * sr) / N; den += m; }
  }
  return den ? num / den : 0;
}
/** 16-bit PCM WAV bytes for 1–2 channels. */
export function encodeWav(channels, sr) {
  const n = channels[0].length, ch = channels.length, buf = new ArrayBuffer(44 + n * ch * 2), v = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * ch * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, ch, true); v.setUint32(24, sr, true); v.setUint32(28, sr * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, n * ch * 2, true);
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const s = Math.max(-1, Math.min(1, channels[c][i])); v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2; }
  return new Uint8Array(buf);
}
