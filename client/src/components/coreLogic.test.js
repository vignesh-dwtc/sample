// Run: node --test client/src/components/*.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tickCountdown,
  achievementTeaser, boardRows, dailiesDone, formatDuration, formatHms, formatNumber, greeting,
  isValidBoardGame, isValidPeriod, levelPercent, medal, msUntilUtcMidnight, nextAction,
  normalizeRoomCode, streakStatus, titleFor, validateClaim, winRate,
} from './coreLogic.js';

test('msUntilUtcMidnight counts to the next UTC day', () => {
  assert.equal(msUntilUtcMidnight(Date.UTC(2026, 10, 6, 0, 0, 0)), 24 * 3600 * 1000);
  assert.equal(msUntilUtcMidnight(Date.UTC(2026, 10, 6, 23, 59, 59)), 1000);
  assert.equal(msUntilUtcMidnight(Date.UTC(2026, 11, 31, 12, 0, 0)), 12 * 3600 * 1000); // year rollover
});

test('formatHms / formatDuration', () => {
  assert.equal(formatHms(3725000), '01:02:05');
  assert.equal(formatHms(-5), '00:00:00');
  assert.equal(formatHms(999), '00:00:00');
  assert.equal(formatDuration(30 * 1000), 'under a minute');
  assert.equal(formatDuration(42 * 60000), '42m');
  assert.equal(formatDuration((5 * 60 + 12) * 60000), '5h 12m');
});

test('greeting by hour', () => {
  assert.equal(greeting(2), 'Up late');
  assert.equal(greeting(9), 'Good morning');
  assert.equal(greeting(13), 'Good afternoon');
  assert.equal(greeting(21), 'Good evening');
});

test('formatNumber', () => {
  assert.equal(formatNumber(1234), '1,234');
  assert.equal(formatNumber(15300, true), '15.3k');
  assert.equal(formatNumber(250000, true), '250k');
  assert.equal(formatNumber(9999, true), '9,999');
  assert.equal(formatNumber(undefined), '0');
});

test('levelPercent clamps and handles missing data', () => {
  assert.equal(levelPercent({ current: 150, needed: 300 }), 50);
  assert.equal(levelPercent({ current: 400, needed: 300 }), 100);
  assert.equal(levelPercent(null), 0);
  assert.equal(levelPercent({ current: 5, needed: 0 }), 0);
});

test('streakStatus', () => {
  assert.deepEqual(streakStatus({ current: 4, best: 6, playedToday: true }), { state: 'safe', current: 4, best: 6 });
  assert.deepEqual(streakStatus({ current: 4, best: 6, playedToday: false }), { state: 'at_risk', current: 4, best: 6 });
  assert.deepEqual(streakStatus({ current: 0, best: 6, playedToday: false }), { state: 'none', current: 0, best: 6 });
  assert.equal(streakStatus(undefined).state, 'none');
});

test('nextAction prefers in-progress, then first new daily, then arcade', () => {
  assert.equal(nextAction({ lexicon: 'new', target: 'new', flip: 'new' }).game, 'lexicon');
  assert.equal(nextAction({ lexicon: 'done', target: 'new', flip: 'in_progress' }).game, 'flip');
  assert.equal(nextAction({ lexicon: 'done', target: 'new', flip: 'in_progress' }).kind, 'resume');
  assert.equal(nextAction({ lexicon: 'done', target: 'new', flip: 'new' }).game, 'target');
  const done = nextAction({ lexicon: 'done', target: 'done', flip: 'done' });
  assert.equal(done.kind, 'all_done');
  assert.equal(done.to, '/play/reflex');
  assert.equal(nextAction(undefined).game, 'lexicon');
});

test('dailiesDone', () => {
  assert.equal(dailiesDone({ lexicon: 'done', target: 'in_progress', flip: 'done' }), 2);
  assert.equal(dailiesDone(null), 0);
});

test('normalizeRoomCode strips junk and ambiguous letters', () => {
  assert.equal(normalizeRoomCode('ab-cd'), 'ABCD');
  assert.equal(normalizeRoomCode('wxyz12'), 'WXYZ');
  assert.equal(normalizeRoomCode('io ok'), 'K');
  assert.equal(normalizeRoomCode('abcdef'), 'ABCD');
  assert.equal(normalizeRoomCode(null), '');
});

test('achievementTeaser', () => {
  const list = [
    { code: 'a', unlockedAt: '2026-01-01' },
    { code: 'b', unlockedAt: null },
    { code: 'c', unlockedAt: null },
    { code: 'd', unlockedAt: null },
    { code: 'e', unlockedAt: null },
  ];
  const t = achievementTeaser(list, 3);
  assert.equal(t.unlocked, 1);
  assert.equal(t.total, 5);
  assert.deepEqual(t.next.map((a) => a.code), ['b', 'c', 'd']);
  assert.deepEqual(achievementTeaser(undefined), { unlocked: 0, total: 0, next: [] });
});

test('boardRows pins me only when outside the list', () => {
  const rows = [{ id: '1', rank: 1 }, { id: '2', rank: 2, me: true }];
  assert.equal(boardRows({ rows, me: rows[1] }).pinned, null);
  const me = { id: '9', rank: 77, me: true };
  assert.equal(boardRows({ rows, me }).pinned, me);
  assert.deepEqual(boardRows(null), { rows: [], pinned: null });
});

test('medal / winRate / validators', () => {
  assert.equal(medal(1), '🥇');
  assert.equal(medal(3), '🥉');
  assert.equal(medal(4), null);
  assert.equal(winRate({ plays: 3, wins: 2 }), '67%');
  assert.equal(winRate({ plays: 0, wins: 0 }), '—');
  assert.equal(winRate(undefined), '—');
  assert.ok(isValidBoardGame('party'));
  assert.ok(!isValidBoardGame('party_trivia'));
  assert.ok(isValidPeriod('week'));
  assert.ok(!isValidPeriod('month'));
});

test('validateClaim mirrors server rules', () => {
  assert.match(validateClaim({ username: 'ab', email: 'a@b.co', password: '12345678' }), /Username/);
  assert.match(validateClaim({ username: 'bad name', email: 'a@b.co', password: '12345678' }), /Username/);
  assert.match(validateClaim({ username: 'good_name', email: 'nope', password: '12345678' }), /email/);
  assert.match(validateClaim({ username: 'good_name', email: 'a@b.co', password: 'short' }), /Password/);
  assert.equal(validateClaim({ username: 'good_name', email: 'a@b.co', password: '12345678' }), null);
});

test('titleFor routes', () => {
  assert.equal(titleFor('/'), 'PlayNest — daily puzzles & party games');
  assert.equal(titleFor('/play/lexicon'), 'Lexicon · PlayNest');
  assert.equal(titleFor('/party/ABCD'), 'Party · PlayNest');
  assert.equal(titleFor('/nope'), 'Not found · PlayNest');
});

test('tickCountdown counts every UTC rollover, not just the first', () => {
  let s = { ms: 5000, rolled: 0 };
  s = tickCountdown(s, 4000);
  assert.equal(s.rolled, 0);
  s = tickCountdown(s, 86_399_000); // day 1 rollover
  assert.equal(s.rolled, 1);
  s = tickCountdown({ ...s, ms: 500 }, 86_399_500); // day 2 rollover
  assert.equal(s.rolled, 2);
});
