// Target: reach a 3-digit number with + − × ÷ and parentheses.
// Includes a small hand-written tokenizer + recursive-descent parser (never eval).
import { seededRandom } from '../util.js';

export const LARGE = [25, 50, 75, 100];
export const MAX_EXPRESSION_LENGTH = 200;

export class ExprError extends Error {}

const OPS = { '+': '+', '-': '-', '−': '-', '–': '-', '*': '*', '×': '*', 'x': '*', 'X': '*', '·': '*', '/': '/', '÷': '/' };

export function tokenize(src) {
  const s = String(src ?? '');
  if (s.length > MAX_EXPRESSION_LENGTH) throw new ExprError('Expression is too long');
  const tokens = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (/[0-9]/.test(ch)) {
      let j = i;
      while (j < s.length && /[0-9]/.test(s[j])) j++;
      if (j - i > 4) throw new ExprError('Number is too long');
      tokens.push({ type: 'num', value: Number(s.slice(i, j)) });
      i = j;
      continue;
    }
    if (OPS[ch]) { tokens.push({ type: 'op', value: OPS[ch] }); i++; continue; }
    if (ch === '(' || ch === ')') { tokens.push({ type: ch }); i++; continue; }
    throw new ExprError(`Unexpected character "${ch}"`);
  }
  return tokens;
}

/**
 * Parse and evaluate an expression with integer-only arithmetic.
 * Grammar: expr := term (('+'|'-') term)* ; term := factor (('*'|'/') factor)* ; factor := num | '(' expr ')'
 * @returns {{ value:number, used:number[] }}
 */
export function evaluate(src) {
  const tokens = tokenize(src);
  if (!tokens.length) throw new ExprError('Build an expression first');
  let pos = 0;
  const used = [];
  let depth = 0;
  const peek = () => tokens[pos];

  function factor() {
    const t = tokens[pos++];
    if (!t) throw new ExprError('Expression ends unexpectedly');
    if (t.type === 'num') { used.push(t.value); return t.value; }
    if (t.type === '(') {
      if (++depth > 20) throw new ExprError('Too many parentheses');
      const v = expr();
      if (peek()?.type !== ')') throw new ExprError('Missing closing parenthesis');
      pos++; depth--;
      return v;
    }
    throw new ExprError(t.type === ')' ? 'Unexpected ")"' : 'Expected a number');
  }
  function term() {
    let v = factor();
    while (peek()?.type === 'op' && (peek().value === '*' || peek().value === '/')) {
      const op = tokens[pos++].value;
      const r = factor();
      if (op === '*') v *= r;
      else {
        if (r === 0) throw new ExprError('Cannot divide by zero');
        if (v % r !== 0) throw new ExprError('Division must be exact');
        v /= r;
      }
    }
    return v;
  }
  function expr() {
    let v = term();
    while (peek()?.type === 'op' && (peek().value === '+' || peek().value === '-')) {
      const op = tokens[pos++].value;
      const r = term();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  }

  const value = expr();
  if (pos < tokens.length) throw new ExprError(tokens[pos].type === ')' ? 'Unexpected ")"' : 'Unexpected token');
  return { value, used };
}

/** Throws unless every number in `used` is available (each tile used at most once). */
export function checkUsage(used, numbers) {
  const pool = new Map();
  for (const n of numbers) pool.set(n, (pool.get(n) || 0) + 1);
  for (const n of used) {
    const left = pool.get(n) || 0;
    if (!left) throw new ExprError(numbers.includes(n) ? `${n} is used too many times` : `${n} is not one of your numbers`);
    pool.set(n, left - 1);
  }
}

/** Evaluate an expression against the puzzle numbers. */
export function scoreExpression(expression, numbers, target) {
  const { value, used } = evaluate(expression);
  checkUsage(used, numbers);
  const distance = Math.abs(target - value);
  return { value, distance, score: Math.max(0, 10 - distance) };
}

export const targetXp = (score) => 20 + score * 8;

/** Build the day's puzzle: 4 small (1–10), 2 large, and a reachable target from a random expression. */
export function generateTarget(date) {
  const rnd = seededRandom(`target:${date}`);
  const int = (n) => Math.floor(rnd() * n);
  const smallPool = [];
  for (let n = 1; n <= 10; n++) smallPool.push(n, n);
  const small = [];
  for (let i = 0; i < 4; i++) small.push(smallPool.splice(int(smallPool.length), 1)[0]);
  const largePool = [...LARGE];
  const large = [largePool.splice(int(4), 1)[0], largePool.splice(int(3), 1)[0]];
  const numbers = [...large, ...small].sort((a, b) => b - a);

  for (let attempt = 0; attempt < 5000; attempt++) {
    // Combine a random subset (3–6 numbers) pairwise, tracking the expression text.
    const items = numbers.map((n) => ({ v: n, e: String(n), prec: 3 }))
      .map((x) => [rnd(), x]).sort((a, b) => a[0] - b[0]).map(([, x]) => x)
      .slice(0, 3 + int(4));
    let ok = true;
    while (items.length > 1) {
      const a = items.splice(int(items.length), 1)[0];
      const b = items.splice(int(items.length), 1)[0];
      const choices = [];
      choices.push({ v: a.v + b.v, op: '+' });
      if (a.v !== 1 && b.v !== 1) choices.push({ v: a.v * b.v, op: '×' }, { v: a.v * b.v, op: '×' });
      if (a.v > b.v) choices.push({ v: a.v - b.v, op: '−' });
      if (b.v > 1 && a.v % b.v === 0) choices.push({ v: a.v / b.v, op: '÷' }, { v: a.v / b.v, op: '÷' });
      const c = choices[int(choices.length)];
      if (c.v <= 0 || c.v > 5000) { ok = false; break; }
      // Minimal parentheses: wrap a side only when precedence requires it.
      const prec = c.op === '+' || c.op === '−' ? 1 : 2;
      const left = a.prec < prec ? `(${a.e})` : a.e;
      const right = b.prec < prec || (b.prec === prec && (c.op === '−' || c.op === '÷')) ? `(${b.e})` : b.e;
      items.push({ v: c.v, e: `${left} ${c.op} ${right}`, prec });
    }
    const [r] = items;
    if (!ok || r.v < 101 || r.v > 999 || r.prec === 3) continue;
    // Prefer targets that aren't trivially a single product of two tiles.
    if (r.v % 25 === 0 && attempt < 200) continue;
    return { numbers, target: r.v, solution: r.e };
  }
  // Practically unreachable fallback: largest × smallest + next.
  const [a, b, , , , f] = numbers;
  return { numbers, target: a + b * f, solution: `${a} + ${b} × ${f}` };
}
