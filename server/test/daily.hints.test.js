import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ANSWERS } from '../src/games/answers.js';
import { CLUES } from '../src/games/clues.js';
import {
  hintsFor, clueFor, vowelHint, repeatHint, meaningHint, letterHint, HINT_KINDS, MAX_GUESSES,
} from '../src/games/lexicon.js';

const texts = (answer, guesses, opts) => hintsFor(answer, guesses, opts).map((h) => h.text);

test('vowel clue: counts A E I O U, singular/plural, Y is a consonant', () => {
  assert.equal(vowelHint('crane'), 'Has 2 vowels');
  assert.equal(vowelHint('about'), 'Has 3 vowels');
  assert.equal(vowelHint('class'), 'Has 1 vowel');
  assert.equal(vowelHint('dizzy'), 'Has 1 vowel (plus a Y)');
  assert.equal(vowelHint('kitty'), 'Has 1 vowel (plus a Y)');
  assert.equal(vowelHint('gypsy'), 'Has no vowels (plus two Ys)');
  assert.equal(vowelHint('lynch'), 'Has no vowels (plus a Y)');
  // a Y is only mentioned when the vowel count is low
  assert.equal(vowelHint('youth'), 'Has 2 vowels');
});

test('repeat clue: correct wording for the actual word', () => {
  assert.equal(repeatHint('crane'), 'No letter repeats');
  assert.equal(repeatHint('sheep'), 'One letter appears twice');
  assert.equal(repeatHint('class'), 'One letter appears twice');
  assert.equal(repeatHint('dizzy'), 'One letter appears twice');
  assert.equal(repeatHint('kitty'), 'One letter appears twice');
  assert.equal(repeatHint('llama'), 'Two letters appear twice');
  assert.equal(repeatHint('puppy'), 'One letter appears three times');
  assert.equal(repeatHint('geese'), 'One letter appears three times');
  assert.equal(repeatHint('esses'), 'One letter appears three times and one letter appears twice');
});

test('meaning clue: uses CLUES, falls back when missing or unusable', () => {
  assert.equal(meaningHint('crane', { crane: 'Tall wading bird' }), 'Tall wading bird');
  assert.equal(meaningHint('crane', {}), 'Starts with a consonant');
  assert.equal(meaningHint('about', {}), 'Starts with a vowel');
  assert.equal(meaningHint('about', null), 'Starts with a vowel');
  assert.equal(meaningHint('crane', { crane: '   ' }), 'Starts with a consonant');
  assert.equal(meaningHint('crane', { crane: 'A Crane lifts things' }), 'Starts with a consonant');
  assert.equal(meaningHint('plant', { plant: 'Implanted idea' }), 'Implanted idea'); // whole words only
  assert.equal(meaningHint('toString', {}), 'Starts with a consonant'); // no prototype leaks
  assert.equal(clueFor('crane', {}), null);
  assert.equal(clueFor('crane', { crane: ' Tall wading bird ' }), 'Tall wading bird');
  // the full ladder still has a meaning step with an empty clue table
  const ladder = hintsFor('llama', ['crane', 'slate', 'pride'], { clues: {} });
  assert.deepEqual(ladder[2], { n: 3, kind: 'meaning', text: 'Starts with a consonant' });
});

test('letter clue: first unfound position after the first, else the last letter', () => {
  // nothing found yet → position 2
  assert.equal(letterHint('sheep', ['crane']), 'Letter 2 is H');
  // AHEAD places H (2) and E (3) → position 4
  assert.equal(letterHint('sheep', ['ahead']), 'Letter 4 is E');
  // FLEET places E E (3, 4), SHIRT places S H (1, 2) → position 5
  assert.equal(letterHint('sheep', ['fleet', 'shirt']), 'Letter 5 is P');
  // position 1 is skipped even though S was never placed
  assert.equal(letterHint('sheep', ['ahead', 'tweed']), 'Letter 5 is P');
  assert.equal(letterHint('sheep', ['speed']), 'Letter 2 is H');
  // a near (not a hit) does not count as found
  assert.equal(letterHint('kitty', ['stick']), 'Letter 2 is I');
  // positions 2–5 all found → reveal the last letter
  assert.equal(letterHint('class', ['glass']), 'Letter 5 is S');
  // only the first five guesses decide clue 5
  const five = ['crane', 'pride', 'mount', 'shiny', 'quick'];
  assert.equal(hintsFor('kitty', five)[4].text, letterHint('kitty', five));
  assert.equal(hintsFor('kitty', [...five, 'kitty'])[4].text, letterHint('kitty', five));
});

test('never more clues than wrong guesses, capped at five', () => {
  const wrong = ['crane', 'slate', 'pride', 'mount', 'shiny', 'quick'];
  for (let k = 0; k <= MAX_GUESSES; k++) {
    const h = hintsFor('llama', wrong.slice(0, k));
    assert.equal(h.length, Math.min(k, 5));
    h.forEach((x, i) => { assert.equal(x.n, i + 1); assert.equal(x.kind, HINT_KINDS[i]); });
  }
  // the winning guess unlocks nothing
  assert.equal(hintsFor('llama', ['llama']).length, 0);
  assert.equal(hintsFor('llama', ['crane', 'slate', 'llama']).length, 2);
  // earlier clues never change as more guesses come in
  assert.deepEqual(hintsFor('llama', wrong.slice(0, 3)), hintsFor('llama', wrong).slice(0, 3));
});

test('a full ladder for known words', () => {
  assert.deepEqual(texts('sheep', ['crane', 'slate', 'pride', 'mount', 'shiny'], { clues: { sheep: 'Woolly farm animal' } }), [
    'Has 2 vowels', 'One letter appears twice', 'Woolly farm animal', 'Starts with S', 'Letter 3 is E',
  ]);
  assert.deepEqual(texts('dizzy', ['crane', 'slate', 'pride', 'mount', 'shiny'], { clues: {} }), [
    'Has 1 vowel (plus a Y)', 'One letter appears twice', 'Starts with a consonant', 'Starts with D', 'Letter 2 is I',
  ]);
});

test('every answer gets a valid five-step ladder (with real CLUES and with none)', () => {
  const wrong = (a) => ['crane', 'slate', 'pride', 'mount', 'shiny', 'quick'].filter((w) => w !== a).slice(0, 5);
  for (const clues of [CLUES, {}]) {
    for (const answer of ANSWERS) {
      const h = hintsFor(answer, wrong(answer), { clues });
      assert.equal(h.length, 5, answer);
      assert.deepEqual(h.map((x) => x.kind), HINT_KINDS);
      for (const x of h) {
        assert.equal(typeof x.text, 'string');
        assert.ok(x.text.length > 0 && x.text.length <= 200, `${answer} ${x.kind}`);
        assert.ok(!new RegExp(`\\b${answer}\\b`, 'i').test(x.text), `${answer} leaks in ${x.kind}`);
      }
      assert.match(h[0].text, /^Has (no vowels|1 vowel|[2-5] vowels)( \(plus (a|two|three) Ys?\))?$/);
      assert.match(h[3].text, new RegExp(`^Starts with ${answer[0].toUpperCase()}$`));
      const [, pos, letter] = h[4].text.match(/^Letter ([2-5]) is ([A-Z])$/);
      assert.equal(answer[pos - 1].toUpperCase(), letter);
    }
  }
});

test('every answer has a real meaning clue that never contains the answer', () => {
  for (const w of ANSWERS) {
    const clue = CLUES[w];
    assert.ok(typeof clue === 'string' && clue.length >= 8, `missing/short clue for ${w}`);
    assert.ok(!clue.toLowerCase().includes(w), `clue for ${w} contains the answer`);
  }
});
