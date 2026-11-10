// PlayNest audio — synthesis worker: renders recipes and impulse responses off the main thread.
import { renderSound } from './recipes.js';
import { impulseResponse, SPACES, hashStr } from './dsp.js';

self.onmessage = (e) => {
  const { id, fn, name, sr, seed, opts, space } = e.data;
  try {
    const o = fn === 'ir' ? impulseResponse(sr, { ...SPACES[space], seed: hashStr(space) }) : renderSound(name, sr, seed, opts);
    const L = o.L, R = o.R === o.L ? o.L.slice() : o.R;
    self.postMessage({ id, sr: o.sr, n: o.n, L, R }, [L.buffer, R.buffer]);
  } catch (err) {
    self.postMessage({ id, error: String(err) });
  }
};
