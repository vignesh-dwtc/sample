// Client copy of the Target expression evaluator (mirrors server/src/games/target.js).
// Used only for the live preview; the server re-validates every submission.

export class ExprError extends Error {}

/** tokens: [{type:'num', value} | {type:'op', value:'+'|'-'|'*'|'/'} | {type:'('} | {type:')'}] */
export function evaluateTokens(tokens) {
  if (!tokens.length) throw new ExprError('Tap numbers and operators to build an expression');
  let pos = 0;
  const peek = () => tokens[pos];
  function factor() {
    const t = tokens[pos++];
    if (!t) throw new ExprError('Incomplete');
    if (t.type === 'num') return t.value;
    if (t.type === '(') {
      const v = expr();
      if (peek()?.type !== ')') throw new ExprError('Incomplete');
      pos++;
      return v;
    }
    throw new ExprError('Expected a number');
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
  const v = expr();
  if (pos < tokens.length) throw new ExprError('Unexpected token');
  return v;
}

export const OP_SYMBOL = { '+': '+', '-': '−', '*': '×', '/': '÷' };

export const tokensToString = (tokens) =>
  tokens.map((t) => (t.type === 'num' ? String(t.value) : t.type === 'op' ? ` ${OP_SYMBOL[t.value]} ` : t.type)).join('');
