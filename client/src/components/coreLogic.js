// Pure, framework-free helpers shared by the core UX (Layout, Home, Leaderboard, Profile).
// Kept dependency-free so they can be unit-tested with `node --test`.

/** Daily puzzles, in the order Home presents them. */
export const DAILIES = [
  { game: 'lexicon', name: 'Lexicon', icon: '🔤', to: '/play/lexicon', blurb: 'Crack the five-letter word in six tries', hue: 'violet' },
  { game: 'target', name: 'Target', icon: '🎯', to: '/play/target', blurb: 'Combine six numbers to hit the goal', hue: 'teal' },
  { game: 'flip', name: 'Flip', icon: '💡', to: '/play/flip', blurb: 'Switch every light off in as few taps', hue: 'amber' },
];

/** Leaderboard tabs (the `game` query parameter) with display metadata. */
export const BOARD_GAMES = [
  { id: 'xp', name: 'XP', icon: '✨', unit: 'XP' },
  { id: 'lexicon', name: 'Lexicon', icon: '🔤', unit: 'pts' },
  { id: 'target', name: 'Target', icon: '🎯', unit: 'pts' },
  { id: 'flip', name: 'Flip', icon: '💡', unit: 'pts' },
  { id: 'reflex', name: 'Reflex', icon: '⚡', unit: 'pts' },
  { id: 'party', name: 'Party', icon: '🎉', unit: 'pts' },
  { id: 'detective', name: 'Detective', icon: '🕵️', unit: 'pts' },
];

export const PERIODS = [
  { id: 'today', name: 'Today' },
  { id: 'week', name: 'Week' },
  { id: 'all', name: 'All time' },
];

/** Per-game metadata for the profile stats table (keys = `game_results.game`). */
export const GAME_INFO = {
  lexicon: { name: 'Lexicon', icon: '🔤', to: '/play/lexicon' },
  target: { name: 'Target', icon: '🎯', to: '/play/target' },
  flip: { name: 'Flip', icon: '💡', to: '/play/flip' },
  reflex: { name: 'Reflex', icon: '⚡', to: '/play/reflex' },
  party_trivia: { name: 'Trivia Blitz', icon: '🧠', to: '/party' },
  party_reaction: { name: 'Reaction Duel', icon: '🚦', to: '/party' },
  detective: { name: 'Detective', icon: '🕵️', to: '/detective' },
};

export const isValidBoardGame = (g) => BOARD_GAMES.some((b) => b.id === g);
export const isValidPeriod = (p) => PERIODS.some((x) => x.id === p);

/** Milliseconds until the next UTC midnight (daily rollover). */
export function msUntilUtcMidnight(now = Date.now()) {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) - now;
}

/** Next countdown state: `rolled` counts UTC-day rollovers (the remaining time jumps back up). */
export function tickCountdown(prev, ms) {
  return ms > prev.ms + 1000 ? { ms, rolled: prev.rolled + 1 } : { ms, rolled: prev.rolled };
}

/** 3725000 → "01:02:05". Negative values clamp to zero. */
export function formatHms(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/** Friendly, coarse duration: "5h 12m", "42m", "under a minute". */
export function formatDuration(ms) {
  const m = Math.max(0, Math.floor(ms / 60000));
  if (m < 1) return 'under a minute';
  const h = Math.floor(m / 60);
  return h ? `${h}h ${m % 60}m` : `${m}m`;
}

/** Time-of-day greeting from a local hour (0–23). */
export function greeting(hour) {
  if (hour < 5) return 'Up late';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/** 1234 → "1,234"; 15300 → "15.3k" when compact. */
export function formatNumber(n, compact = false) {
  const v = Number(n) || 0;
  if (compact && Math.abs(v) >= 10000) {
    const k = v / 1000;
    return `${k >= 100 ? Math.round(k) : Math.round(k * 10) / 10}k`;
  }
  return v.toLocaleString('en-US');
}

/** Percent (0–100) through the current level from profile.levelXp. */
export function levelPercent(levelXp) {
  if (!levelXp || !levelXp.needed) return 0;
  return Math.max(0, Math.min(100, (levelXp.current / levelXp.needed) * 100));
}

/**
 * Streak status for the hero/banners.
 * @returns {{state:'safe'|'at_risk'|'none', current:number, best:number}}
 *  - safe:    a daily was played today
 *  - at_risk: there is a live streak but nothing played yet today (it will reset at UTC midnight)
 *  - none:    no live streak and nothing played today
 */
export function streakStatus(streak) {
  const current = streak?.current || 0;
  const best = streak?.best || 0;
  if (streak?.playedToday) return { state: 'safe', current, best };
  if (current > 0) return { state: 'at_risk', current, best };
  return { state: 'none', current, best };
}

/**
 * Pick the single most obvious next action for Home.
 * In-progress dailies first, then new ones in catalogue order; when all are done → arcade.
 */
export function nextAction(daily) {
  const d = daily || {};
  const inProgress = DAILIES.find((g) => d[g.game] === 'in_progress');
  if (inProgress) return { kind: 'resume', ...inProgress };
  const fresh = DAILIES.find((g) => d[g.game] !== 'done');
  if (fresh) return { kind: 'start', ...fresh };
  return { kind: 'all_done', game: 'reflex', name: 'Reflex', icon: '⚡', to: '/play/reflex' };
}

/** How many of today's dailies are done (0–3). */
export const dailiesDone = (daily) => DAILIES.filter((g) => daily?.[g.game] === 'done').length;

/** Normalise a party room code typed by the user: uppercase letters (no ambiguous I/O), max 4. */
export const normalizeRoomCode = (s) => String(s || '').toUpperCase().replace(/[^A-HJ-NP-Z]/g, '').slice(0, 4);

/**
 * Achievements to tease on Home: locked ones, game-specific first, limited to `n`.
 */
export function achievementTeaser(achievements, n = 3) {
  const list = achievements || [];
  const locked = list.filter((a) => !a.unlockedAt);
  return { unlocked: list.length - locked.length, total: list.length, next: locked.slice(0, n) };
}

/**
 * Merge a leaderboard response into display rows, pinning "me" at the bottom when I'm not in the list.
 * @returns {{rows:Array, pinned:object|null}}
 */
export function boardRows(data) {
  const rows = data?.rows || [];
  const me = data?.me || null;
  const pinned = me && !rows.some((r) => r.id === me.id) ? me : null;
  return { rows, pinned };
}

/** Medal for top 3 ranks. */
export const medal = (rank) => (rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null);

/** Win rate as a whole percent string, or "—". */
export const winRate = (s) => (s && s.plays ? `${Math.round((s.wins / s.plays) * 100)}%` : '—');

/** Claim-form validation mirroring the server rules. Returns an error message or null. */
export function validateClaim({ username, email, password }) {
  if (!/^[A-Za-z0-9_]{3,20}$/.test(username || '')) return 'Username must be 3–20 letters, numbers or _';
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) return 'Enter a valid email address';
  if (!password || password.length < 8) return 'Password must be at least 8 characters';
  return null;
}

/** Route → document title. */
export function titleFor(pathname) {
  const p = pathname || '/';
  const map = [
    [/^\/$/, null],
    [/^\/play\/lexicon/, 'Lexicon'],
    [/^\/play\/target/, 'Target'],
    [/^\/play\/flip/, 'Flip'],
    [/^\/play\/reflex/, 'Reflex'],
    [/^\/party/, 'Party'],
    [/^\/detective/, 'Detective'],
    [/^\/leaderboard/, 'Leaderboard'],
    [/^\/profile/, 'Profile'],
  ];
  const hit = map.find(([re]) => re.test(p));
  if (!hit) return 'Not found · PlayNest';
  return hit[1] ? `${hit[1]} · PlayNest` : 'PlayNest — daily puzzles & party games';
}
