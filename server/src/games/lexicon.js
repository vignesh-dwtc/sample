// Lexicon: daily 5-letter word deduction (6 guesses).
import { createRequire } from 'node:module';
import { seededRandom } from '../util.js';
import { ANSWERS } from './answers.js';
import { CLUES } from './clues.js';

export const WORD_LENGTH = 5;
export const MAX_GUESSES = 6;

let dictionary = null;
/** Lazily built Set of every acceptable 5-letter guess (dictionary + answers). */
export function validWords() {
  if (!dictionary) {
    const require = createRequire(import.meta.url);
    const all = require('an-array-of-english-words');
    dictionary = new Set(ANSWERS);
    for (const w of all) if (w.length === WORD_LENGTH && /^[a-z]+$/.test(w)) dictionary.add(w);
  }
  return dictionary;
}

export const normalizeWord = (w) => String(w ?? '').trim().toLowerCase();
export const isValidGuess = (w) => /^[a-z]{5}$/.test(w) && validWords().has(w);

/** The answer for a UTC date ('YYYY-MM-DD'). */
export function answerFor(date) {
  const rnd = seededRandom(`lexicon:${date}`);
  return ANSWERS[Math.floor(rnd() * ANSWERS.length)];
}

/**
 * Mark a guess against the answer with correct duplicate-letter handling:
 * exact matches are claimed first; remaining letters are 'near' only while
 * unclaimed copies of that letter remain in the answer.
 * @returns {Array<'hit'|'near'|'miss'>}
 */
export function markGuess(guess, answer) {
  const marks = Array(answer.length).fill('miss');
  const remaining = {};
  for (let i = 0; i < answer.length; i++) {
    if (guess[i] === answer[i]) marks[i] = 'hit';
    else remaining[answer[i]] = (remaining[answer[i]] || 0) + 1;
  }
  for (let i = 0; i < answer.length; i++) {
    if (marks[i] === 'hit') continue;
    const c = guess[i];
    if (remaining[c] > 0) { marks[i] = 'near'; remaining[c]--; }
  }
  return marks;
}

/** Derive the public view of a game from stored guesses. */
export function lexiconView(guesses, answer) {
  const marked = guesses.map((word) => ({ word, marks: markGuess(word, answer) }));
  const won = guesses.includes(answer);
  const finished = won || guesses.length >= MAX_GUESSES;
  return { guesses: marked, finished, won };
}

export const lexiconScore = (won, guessCount) => (won ? 7 - guessCount : 0);
export const lexiconXp = (won, score) => (won ? 40 + score * 10 : 15);

// ---------- Clue ladder ----------
// After each wrong guess one more clue unlocks (row N shows clue N), up to five.

export const HINT_KINDS = ['vowels', 'repeats', 'meaning', 'first', 'letter'];
const VOWELS = 'aeiou';
const NUMBER_WORDS = ['no', 'one', 'two', 'three', 'four', 'five'];
const TIMES = { 2: 'twice', 3: 'three times', 4: 'four times', 5: 'five times' };
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** "Has 2 vowels" / "Has 1 vowel (plus a Y)" — Y counts as a consonant. */
export function vowelHint(answer) {
  const vowels = [...answer].filter((c) => VOWELS.includes(c)).length;
  const ys = [...answer].filter((c) => c === 'y').length;
  let text = vowels === 0 ? 'Has no vowels' : `Has ${plural(vowels, 'vowel')}`;
  if (ys > 0 && vowels <= 1) text += ys === 1 ? ' (plus a Y)' : ` (plus ${NUMBER_WORDS[ys]} Ys)`;
  return text;
}

/** "No letter repeats" / "One letter appears twice" / "Two letters appear twice" / … */
export function repeatHint(answer) {
  const counts = {};
  for (const c of answer) counts[c] = (counts[c] || 0) + 1;
  const byTimes = {};
  for (const n of Object.values(counts)) if (n > 1) byTimes[n] = (byTimes[n] || 0) + 1;
  const parts = Object.keys(byTimes).map(Number).sort((a, b) => b - a).map((times) => {
    const letters = byTimes[times];
    return `${NUMBER_WORDS[letters]} letter${letters === 1 ? ' appears' : 's appear'} ${TIMES[times]}`;
  });
  return parts.length ? cap(parts.join(' and ')) : 'No letter repeats';
}

/** The crossword-style clue for an answer, or null when there's no usable one. */
export function clueFor(answer, clues = CLUES) {
  const clue = clues && typeof clues === 'object' && Object.hasOwn(clues, answer) ? clues[answer] : undefined;
  if (typeof clue !== 'string' || !clue.trim()) return null;
  if (new RegExp(`\\b${answer}\\b`, 'i').test(clue)) return null; // never leak the answer
  return clue.trim();
}

/** Clue 3: the meaning, or a structural fallback so the ladder never breaks. */
export function meaningHint(answer, clues = CLUES) {
  return clueFor(answer, clues) ?? (VOWELS.includes(answer[0]) ? 'Starts with a vowel' : 'Starts with a consonant');
}

/**
 * Clue 5: the first position (left to right, skipping position 1) whose letter the player
 * hasn't placed as a hit in the given guesses; if all are found, the last letter.
 */
export function letterHint(answer, guesses) {
  const found = new Set();
  for (const g of guesses) markGuess(g, answer).forEach((m, i) => { if (m === 'hit') found.add(i); });
  let pos = answer.length - 1;
  for (let i = 1; i < answer.length; i++) if (!found.has(i)) { pos = i; break; }
  return `Letter ${pos + 1} is ${answer[pos].toUpperCase()}`;
}

/**
 * Unlocked clues for a game: one per wrong guess, at most five. Clue N only depends on the
 * answer and the first N guesses, so it never changes once shown.
 * @returns {Array<{n:number, kind:string, text:string}>}
 */
export function hintsFor(answer, guesses = [], { clues = CLUES } = {}) {
  const wrong = guesses.filter((g) => g !== answer).length;
  const count = Math.min(wrong, HINT_KINDS.length);
  const out = [];
  for (let n = 1; n <= count; n++) {
    const kind = HINT_KINDS[n - 1];
    let text;
    if (kind === 'vowels') text = vowelHint(answer);
    else if (kind === 'repeats') text = repeatHint(answer);
    else if (kind === 'meaning') text = meaningHint(answer, clues);
    else if (kind === 'first') text = `Starts with ${answer[0].toUpperCase()}`;
    else text = letterHint(answer, guesses.slice(0, n));
    out.push({ n, kind, text });
  }
  return out;
}
