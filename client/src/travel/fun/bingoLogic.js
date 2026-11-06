// Window Bingo — pure logic (no React, no DOM). Seeded cards, line detection, scoring.

/** Things to spot, per travel mode. Each: [id, emoji, short label]. Keep labels short (fit a phone cell). */
const RAW = {
  road: [
    ['cow', '🐄', 'Cow on the road'], ['chai', '☕', 'Chai stall'], ['auto', '🛺', 'Auto-rickshaw'], ['temple', '🛕', 'Temple'],
    ['truck', '🚛', 'Painted truck'], ['coconut', '🌴', 'Coconut trees'], ['toll', '🚧', 'Toll plaza'], ['goat', '🐐', 'Goats'],
    ['dog', '🐕', 'Sleeping dog'], ['bike3', '🏍️', '3 on a bike'], ['bus', '🚌', 'Packed bus'], ['tractor', '🚜', 'Tractor'],
    ['dhaba', '🍛', 'Dhaba'], ['petrol', '⛽', 'Petrol pump'], ['banner', '🪧', 'Big poster'], ['bullock', '🐂', 'Bullock cart'],
    ['flyover', '🌉', 'Flyover'], ['paddy', '🌾', 'Paddy fields'], ['lake', '💧', 'Lake / pond'], ['hill', '⛰️', 'Hills'],
    ['monkey', '🐒', 'Monkey'], ['fruit', '🍉', 'Fruit cart'], ['wedding', '💐', 'Wedding hall'], ['school', '🎒', 'School kids'],
    ['police', '👮', 'Traffic police'], ['ambul', '🚑', 'Ambulance'], ['km', '🪨', 'Milestone stone'], ['tyre', '🛞', 'Tyre shop'],
    ['horn', '📯', '"Horn OK Please"'], ['mosque', '🕌', 'Mosque'], ['church', '⛪', 'Church'], ['windmill', '🌬️', 'Wind turbine'],
    ['tender', '🥥', 'Tender coconut'], ['sugar', '🎋', 'Sugarcane'], ['market', '🧺', 'Weekly market'], ['speed', '〰️', 'Speed breaker'],
    ['rail', '🚂', 'Railway crossing'], ['peacock', '🦚', 'Peacock'], ['banyan', '🌳', 'Huge banyan'], ['jcb', '🏗️', 'Roadworks'],
    ['camel', '🐪', 'Camel'], ['bridge', '🏞️', 'River bridge'], ['mango', '🥭', 'Mango seller'], ['statue', '🗿', 'Roadside statue'],
  ],
  train: [
    ['chaiwala', '☕', 'Chai seller'], ['passing', '🚆', 'Train passing'], ['riverb', '🌉', 'River bridge'], ['tunnel', '🕳️', 'Tunnel'],
    ['snack', '🥜', 'Snack vendor'], ['samosa', '🥟', 'Samosa'], ['tc', '🎫', 'Ticket checker'], ['platform', '🚉', 'Busy platform'],
    ['signal', '🚦', 'Signal post'], ['goods', '🚃', 'Goods train'], ['level', '🚧', 'Level crossing'], ['wave', '👋', 'Kid waving'],
    ['paddy', '🌾', 'Paddy fields'], ['cattle', '🐄', 'Cattle grazing'], ['hill', '⛰️', 'Hills'], ['lake', '💧', 'Lake'],
    ['station', '🪧', 'Station board'], ['berth', '🛏️', 'Upper berth'], ['tiffin', '🍱', 'Home tiffin'], ['cards', '🃏', 'Card game'],
    ['sleeper', '😴', 'Someone snoring'], ['bottle', '🧴', 'Water vendor'], ['coffee', '🥤', 'Coffee call'], ['book', '📚', 'Book seller'],
    ['toy', '🪀', 'Toy seller'], ['pantry', '🍛', 'Pantry meal'], ['curve', '↪️', 'See the engine'], ['coconut', '🌴', 'Coconut grove'],
    ['temple', '🛕', 'Hill temple'], ['sunset', '🌅', 'Sunset'], ['crossing', '🔀', 'Track junction'], ['peacock', '🦚', 'Peacock'],
    ['village', '🏘️', 'Village'], ['factory', '🏭', 'Factory'], ['bird', '🦩', 'Water birds'], ['wind', '🌬️', 'Wind turbine'],
    ['mobile', '🔌', 'Charging queue'], ['announce', '📢', 'Station call'], ['halt', '⏸️', 'Nowhere halt'], ['tea2', '🍵', 'Second chai'],
    ['fort', '🏰', 'Old fort'], ['bridge2', '🛤️', 'Parallel track'], ['canal', '🌊', 'Canal'],
  ],
  flight: [
    ['below', '☁️', 'Clouds below'], ['wing', '🛩️', 'Wing view'], ['belt', '💺', 'Seatbelt sign'], ['river', '🏞️', 'River from above'],
    ['lights', '🌃', 'City lights'], ['snack', '🥪', 'Snack trolley'], ['ears', '👂', 'Ears pop'], ['baby', '👶', 'Baby crying'],
    ['bump', '〰️', 'Turbulence'], ['window', '🪟', 'Window shade up'], ['sea', '🌊', 'Sea / coast'], ['mount', '🏔️', 'Mountains'],
    ['sunrise', '🌅', 'Golden sunrise'], ['plane', '✈️', 'Another plane'], ['contrail', '💨', 'Contrail'], ['field', '🟩', 'Patchwork fields'],
    ['road', '🛣️', 'Highway below'], ['lake', '💧', 'Lake below'], ['airport', '🛬', 'Airport below'], ['moon', '🌙', 'Moon outside'],
    ['star', '⭐', 'Bright star'], ['rainbow', '🌈', 'Rainbow'], ['cabin', '🧑‍✈️', 'Captain speaks'], ['safety', '📋', 'Safety demo'],
    ['tea', '☕', 'Tea or coffee'], ['meal', '🍱', 'Meal box'], ['nap', '😴', 'Neighbour asleep'], ['movie', '🎬', 'Someone on a movie'],
    ['queue', '🚻', 'Toilet queue'], ['bag', '🧳', 'Overhead bin fight'], ['clap', '👏', 'Landing clap'], ['tower', '🗼', 'Control tower'],
    ['cloudfac', '🐘', 'Animal cloud'], ['shadow', '🌑', 'Plane shadow'], ['storm', '⛈️', 'Storm cloud'], ['ship', '🚢', 'Ship at sea'],
    ['island', '🏝️', 'Island'], ['desert', '🏜️', 'Dry land'], ['bus', '🚌', 'Airport bus'], ['bridge', '🌉', 'Bridge from above'],
    ['gear', '⚙️', 'Wheels go down'], ['mode', '📵', 'Phones-off call'], ['blue', '🔵', 'Only blue sky'],
  ],
};

export const BINGO_MODES = ['road', 'train', 'flight'];
export const POOLS = Object.fromEntries(Object.entries(RAW).map(([m, list]) => [m, list.map(([id, e, t]) => ({ id: `${m}.${id}`, e, t }))]));
export const FREE_INDEX = 12;
export const FREE_CELL = { id: 'free', e: '⭐', t: 'FREE', free: true };

/** 32-bit string hash (FNV-1a). */
export function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/** Deterministic PRNG (mulberry32) → () => [0, 1). */
export function seededRandom(seed) {
  let a = (typeof seed === 'number' ? seed : hashString(String(seed))) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 25 cells (row-major), FREE in the centre, 24 distinct items from the mode's pool. Same seed → same card. */
export function generateCard(mode, seed) {
  const pool = POOLS[mode] || POOLS.road;
  const rnd = seededRandom(`${mode}|${seed}`);
  const items = pool.slice();
  for (let i = items.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [items[i], items[j]] = [items[j], items[i]]; }
  const picked = items.slice(0, 24);
  return [...picked.slice(0, FREE_INDEX), FREE_CELL, ...picked.slice(FREE_INDEX)];
}

/** All 12 lines as cell-index arrays: 5 rows, 5 columns, 2 diagonals. */
export const LINES = [
  ...[0, 1, 2, 3, 4].map((r) => [0, 1, 2, 3, 4].map((c) => r * 5 + c)),
  ...[0, 1, 2, 3, 4].map((c) => [0, 1, 2, 3, 4].map((r) => r * 5 + c)),
  [0, 6, 12, 18, 24],
  [4, 8, 12, 16, 20],
];

/** Normalise marks to a Set of indices, always including FREE. */
const markSet = (marked) => { const s = new Set(marked); s.add(FREE_INDEX); return s; };

/** Indices (into LINES) of completed lines. `marked` = array of marked cell indices (FREE is implied). */
export function findLines(marked) {
  const s = markSet(marked);
  return LINES.map((line, i) => (line.every((c) => s.has(c)) ? i : -1)).filter((i) => i >= 0);
}

/** Lines in `now` not in `seen`. */
export const newLines = (seen, now) => now.filter((i) => !seen.includes(i));

/** Player-marked cells (FREE not counted). */
export const markedCount = (marked) => new Set(marked.filter((i) => i !== FREE_INDEX && i >= 0 && i < 25)).size;

export const isFull = (marked) => markedCount(marked) === 24;

/** Score = min(100, marked × 4 + lines × 10). */
export const bingoScore = (marked, lines) => Math.min(100, markedCount(marked) * 4 + lines * 10);

/** Toggle a cell (FREE can't be toggled). Returns a new sorted array. */
export function toggleMark(marked, index) {
  if (index === FREE_INDEX || index < 0 || index > 24) return marked.slice();
  const s = new Set(marked);
  s.has(index) ? s.delete(index) : s.add(index);
  s.delete(FREE_INDEX);
  return [...s].sort((a, b) => a - b);
}

export const lineName = (i) => (i < 5 ? `Row ${i + 1}` : i < 10 ? `Column ${i - 4}` : 'Diagonal');

export const BINGO_CHEERS = ['BINGO!', 'Eagle eyes!', 'Window wizard!', 'Spotted it!', 'What a view!', 'Line complete!'];
