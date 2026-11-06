// Lexicon: daily 5-letter word deduction (6 guesses).
import { createRequire } from 'node:module';
import { seededRandom } from '../util.js';
import { ANSWERS } from './answers.js';

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
