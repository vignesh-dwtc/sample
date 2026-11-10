// PlayNest audio — sound & loop registry (metadata only; recipes are lazy-loaded).
//
// One-shots: sound(name, { volume = 1, pan = 0, pitch = 1 })
// ── UI ─────────────────────────────────────────────────────────────────────────────
//   tap        soft rounded wooden UI tick           click     lighter, crisper tick
//   success    warm bell chime chord (C-E-G-D)       error     soft low felt "bonk"
//   coin       metallic coin ching with shimmer      levelup   short brass + bell fanfare swell
//   whoosh     airy rising pass                      swoosh    quick falling air swipe
//   flip       card/tile flip with a papery snap     pop       bubble pop
//   type       mechanical key press + release
// ── Cricket ────────────────────────────────────────────────────────────────────────
//   bat        willow-on-leather crack; volume≈1 = perfect, brighter hit
//   edge       thin nick off the edge                bounce    ball thud on the pitch
//   stumps     stumps clatter + bails rattling       catch     ball smacking into hands
//   crowdCheer swelling cheer (boundary)             crowdRoar huge roar + whistles + claps (six / wicket)
//   crowdGroan disappointed "ohh"                    claps     scattered applause
//   whistle    umpire's pea whistle                  crowdChant distant rhythmic chant + claps
// ── Highway ────────────────────────────────────────────────────────────────────────
//   crash      metal crunch + glass tinkle + debris  horn      truck air horn (dual tone)
//   hornCar    car horn (two-tone)                   autoHorn  squeaky rickshaw bulb horn
//   passBy     vehicle pass with Doppler drop (pan<0 = right-to-left)
//   tyre       short tyre screech                    nitro     turbo whoosh + rumble
//   coinPickup bright two-hit coin ching
// ── Carrom ─────────────────────────────────────────────────────────────────────────
//   woodClick  coin-on-coin click (volume & pitch follow impact)
//   strikerHit heavier striker thock                 cushion   dull thud on the frame
//   pocket     net rustle then a drop                slide     quiet board slide
// ── Generic ────────────────────────────────────────────────────────────────────────
//   win        bright brass fanfare + bells          lose      descending "wah-wah" brass
//   tick       clock tick                            countdown 3 beeps then a higher GO beep
//   beep / beepHigh  single countdown beeps          heartbeat lub-dub
// ── Legacy names (kept working) ──────────────────────────────────────────────────────
//   hit        generic ball/body impact              crowd     alias of crowdCheer
//   engine     one-shot engine rev
//
// Loops: loop(name, { volume, rate, pan }) → { set({ volume, rate, pan }), stop(fadeMs) }
//   crowdAmbience  stadium murmur with occasional distant chants and claps
//   engine         car engine; rate 0.5 idle … 2.5 redline
//   road           tyre/road roar + wind; scales with rate
//   crickets       night insect chirps            rain   steady rain with droplets
//   room           quiet room tone (carrom)

// cat: mix bus. space: reverb preset (see dsp SPACES). wet: reverb send. variants: pre-rendered takes.
// jitter: random ± playback-rate per hit. tiers: intensity tiers chosen from `volume`.
// bright: volume also opens a lowpass. impact: volume also lifts pitch. lowSr: render at a lower rate (beds, crowds).
export const SOUND_DEFS = {
  tap: { cat: 'ui', desc: 'Soft rounded UI tick', jitter: 0.04 },
  click: { cat: 'ui', desc: 'Light crisp UI click', jitter: 0.05 },
  success: { cat: 'ui', desc: 'Warm bell chime chord', space: 'hall', wet: 0.25, variants: 2, jitter: 0.005 },
  error: { cat: 'ui', desc: 'Soft low felt bonk', space: 'room', wet: 0.12, variants: 2, jitter: 0.02 },
  coin: { cat: 'ui', desc: 'Metallic coin ching with shimmer', space: 'room', wet: 0.2, jitter: 0.03 },
  levelup: { cat: 'ui', desc: 'Brass and bell fanfare swell', space: 'hall', wet: 0.3, variants: 1, jitter: 0 },
  whoosh: { cat: 'ui', desc: 'Airy rising whoosh', jitter: 0.06 },
  swoosh: { cat: 'ui', desc: 'Quick falling swoosh', jitter: 0.06 },
  flip: { cat: 'ui', desc: 'Card flip with papery snap', space: 'room', wet: 0.08, jitter: 0.05 },
  pop: { cat: 'ui', desc: 'Bubble pop', jitter: 0.08 },
  type: { cat: 'ui', desc: 'Keyboard key press', variants: 4, jitter: 0.05 },

  bat: { cat: 'game', desc: 'Willow-on-leather crack (volume≈1 = perfect shot)', space: 'stadium', wet: 0.22, tiers: [0.5, 1], bright: true, jitter: 0.03 },
  edge: { cat: 'game', desc: 'Thin nick off the edge', space: 'stadium', wet: 0.15, jitter: 0.05 },
  bounce: { cat: 'game', desc: 'Ball thud on the pitch', space: 'stadium', wet: 0.1, jitter: 0.06, bright: true },
  stumps: { cat: 'game', desc: 'Stumps clatter with bails rattling', space: 'stadium', wet: 0.15, jitter: 0.03 },
  catch: { cat: 'game', desc: 'Ball smacking into hands', space: 'stadium', wet: 0.12, jitter: 0.05 },
  crowdCheer: { cat: 'crowd', desc: 'Swelling boundary cheer', space: 'stadium', wet: 0.3, variants: 2, lowSr: true, jitter: 0.02 },
  crowdRoar: { cat: 'crowd', desc: 'Huge roar with whistles and claps', space: 'stadium', wet: 0.3, variants: 2, lowSr: true, jitter: 0.02 },
  crowdGroan: { cat: 'crowd', desc: 'Disappointed groan', space: 'stadium', wet: 0.3, variants: 2, lowSr: true, jitter: 0.02 },
  claps: { cat: 'crowd', desc: 'Scattered applause', space: 'stadium', wet: 0.25, variants: 2, lowSr: true, jitter: 0.02 },
  whistle: { cat: 'game', desc: "Umpire's pea whistle", space: 'stadium', wet: 0.2, variants: 2, jitter: 0.02 },
  crowdChant: { cat: 'crowd', desc: 'Distant rhythmic chant and claps', space: 'stadium', wet: 0.45, variants: 2, lowSr: true, jitter: 0.02 },

  crash: { cat: 'game', desc: 'Metal crunch, glass tinkle, debris', space: 'road', wet: 0.2, variants: 2, jitter: 0.03 },
  horn: { cat: 'game', desc: 'Truck air horn (dual tone)', space: 'road', wet: 0.2, variants: 2, jitter: 0.01 },
  hornCar: { cat: 'game', desc: 'Car horn', space: 'road', wet: 0.15, variants: 2, jitter: 0.01 },
  autoHorn: { cat: 'game', desc: 'Squeaky rickshaw bulb horn', space: 'road', wet: 0.15, variants: 2, jitter: 0.03 },
  passBy: { cat: 'game', desc: 'Vehicle pass-by with Doppler drop', space: 'road', wet: 0.15, variants: 2, jitter: 0.06, directional: true },
  tyre: { cat: 'game', desc: 'Short tyre screech', space: 'road', wet: 0.15, jitter: 0.05 },
  nitro: { cat: 'game', desc: 'Turbo whoosh with rumble', space: 'road', wet: 0.12, variants: 2, jitter: 0.03 },
  coinPickup: { cat: 'game', desc: 'Bright coin pickup ching', space: 'road', wet: 0.1, jitter: 0.04 },

  woodClick: { cat: 'game', desc: 'Coin-on-coin click (volume & pitch follow impact)', space: 'board', wet: 0.12, variants: 4, impact: true, bright: true, jitter: 0.04, maxVoices: 8 },
  strikerHit: { cat: 'game', desc: 'Heavier striker thock', space: 'board', wet: 0.12, impact: true, bright: true, jitter: 0.03 },
  cushion: { cat: 'game', desc: 'Dull thud on the frame', space: 'board', wet: 0.1, bright: true, jitter: 0.05 },
  pocket: { cat: 'game', desc: 'Net rustle then a drop', space: 'board', wet: 0.1, jitter: 0.04 },
  slide: { cat: 'game', desc: 'Soft board slide', level: 0.5, jitter: 0.05 },

  win: { cat: 'game', desc: 'Brass and bell fanfare', space: 'hall', wet: 0.3, variants: 1, jitter: 0 },
  lose: { cat: 'game', desc: 'Descending sad brass', space: 'hall', wet: 0.25, variants: 1, jitter: 0 },
  tick: { cat: 'ui', desc: 'Clock tick', jitter: 0.02 },
  countdown: { cat: 'game', desc: '3 beeps then a higher GO beep', space: 'room', wet: 0.1, variants: 1, jitter: 0 },
  beep: { cat: 'game', desc: 'Single countdown beep', space: 'room', wet: 0.1, variants: 1, jitter: 0 },
  beepHigh: { cat: 'game', desc: 'Final higher countdown beep', space: 'room', wet: 0.1, variants: 1, jitter: 0 },
  heartbeat: { cat: 'game', desc: 'Lub-dub heartbeat', jitter: 0.02 },

  hit: { cat: 'game', desc: 'Generic ball/body impact (legacy)', space: 'room', wet: 0.1, bright: true, jitter: 0.05 },
  engine: { cat: 'game', desc: 'One-shot engine rev (legacy)', space: 'road', wet: 0.1, variants: 2, jitter: 0.03 },
};

/** Legacy / convenience names that map onto a canonical sound. */
export const ALIASES = { crowd: 'crowdCheer' };

/** Names other modules were already calling before the realistic upgrade. */
export const LEGACY_NAMES = ['tap', 'click', 'success', 'error', 'coin', 'levelup', 'whoosh', 'swoosh', 'hit', 'crowd', 'engine', 'crash'];

export const LOOP_DEFS = {
  crowdAmbience: { cat: 'ambient', desc: 'Stadium murmur with occasional distant chants and claps' },
  engine: { cat: 'game', desc: 'Car engine; rate 0.5 idle … 2.5 redline' },
  road: { cat: 'game', desc: 'Tyre/road roar and wind, scaling with rate' },
  crickets: { cat: 'ambient', desc: 'Night insect chirps' },
  rain: { cat: 'ambient', desc: 'Steady rain with droplets' },
  room: { cat: 'ambient', desc: 'Quiet room tone' },
};

/** Default per-category mix (ui sits lower than game sounds). */
export const CATEGORY_VOLUME = { ui: 0.45, game: 0.9, crowd: 0.75, ambient: 0.55 };

export const resolveSound = (name) => (SOUND_DEFS[name] ? name : ALIASES[name] && SOUND_DEFS[ALIASES[name]] ? ALIASES[name] : null);
export const soundNames = () => [...Object.keys(SOUND_DEFS), ...Object.keys(ALIASES)];
export const loopNames = () => Object.keys(LOOP_DEFS);
/** Pick the intensity tier for a volume: the smallest tier ≥ volume (or the top one). */
export function tierFor(def, volume = 1) {
  if (!def?.tiers) return 1;
  const v = Number.isFinite(volume) ? volume : 1;
  for (const t of def.tiers) if (v <= t + 1e-9) return t;
  return def.tiers[def.tiers.length - 1];
}
