// Backwards compatibility of the public fx API in a non-browser environment (SSR / tests).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fx from '../index.js';

test('fx exports keep their old shape and add the new ones', () => {
  for (const k of ['sound', 'isMuted', 'setMuted', 'useMuted', 'haptic', 'confetti', 'burst', 'floatText', 'reducedMotion', 'loop', 'soundNames', 'loopNames']) assert.equal(typeof fx[k], 'function', k);
});
test('sound() and loop() never throw without WebAudio', () => {
  for (const n of [...fx.soundNames(), 'unknown-name']) fx.sound(n, { volume: 0.5, pan: -1, pitch: 1.2 });
  fx.sound('tap'); fx.sound('tap', undefined); fx.sound('tap', { volume: NaN });
  const h = fx.loop('engine', { rate: 1 }); h.set({ rate: 2 }); h.stop(0);
  const bad = fx.loop('nope'); bad.set({ volume: 1 }); bad.stop();
  assert.equal(typeof fx.isMuted(), 'boolean');
  fx.setMuted(true); assert.equal(fx.isMuted(), true); fx.setMuted(false); assert.equal(fx.isMuted(), false);
});
