import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { useSession } from '../lib/session.jsx';
import { ResultPanel, GameStatus, GameHeader, useDailyGame, siteUrl } from '../games/index.js';
import { evaluateTokens, tokensToString, OP_SYMBOL } from '../games/expr.js';
import { confetti, haptic, sound } from '../fx/index.js';
import './Target.css';

const OPS = ['+', '-', '*', '/'];
const KEY_OPS = { '+': '+', '-': '-', '*': '*', x: '*', X: '*', '/': '/' };

function shareTextFor(data) {
  const r = data.result;
  const off = r.distance === 0 ? 'exact! 🎯' : `${r.distance} off`;
  const bar = '🟩'.repeat(r.score) + '⬛'.repeat(10 - r.score);
  return `PlayNest Target ${data.date} 🎯 ${data.target} → ${r.value} (${off}) ${r.score}/10\n${bar}\n\n${siteUrl()}/play/target`;
}

/** What may come next given the last token. */
function allowed(tokens) {
  const last = tokens[tokens.length - 1];
  const open = tokens.filter((t) => t.type === '(').length - tokens.filter((t) => t.type === ')').length;
  const afterValue = last && (last.type === 'num' || last.type === ')');
  return { num: !afterValue, op: !!afterValue, open: !afterValue, close: !!afterValue && open > 0, depth: open };
}

export default function Target() {
  const { celebrate } = useSession() || {};
  const { data, setData, error, loading, reload } = useDailyGame('/daily/target');
  const [tokens, setTokens] = useState([]);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const [shake, setShake] = useState(false);

  const used = useMemo(() => new Set(tokens.filter((t) => t.type === 'num').map((t) => t.idx)), [tokens]);
  const can = allowed(tokens);

  const live = useMemo(() => {
    if (!tokens.length) return { value: null, hint: 'Tap numbers and operators to build an expression' };
    if (can.depth > 0 || !can.op) {
      // Incomplete: try to show the value of what's been closed off so far.
      const trimmed = [...tokens];
      while (trimmed.length && !(trimmed.at(-1).type === 'num' || trimmed.at(-1).type === ')')) trimmed.pop();
      let opens = trimmed.filter((t) => t.type === '(').length - trimmed.filter((t) => t.type === ')').length;
      while (opens-- > 0) trimmed.push({ type: ')' });
      try { return { value: null, partial: evaluateTokens(trimmed), hint: can.depth > 0 ? 'Close your brackets' : 'Keep going…' }; } catch { return { value: null, hint: 'Keep going…' }; }
    }
    try { return { value: evaluateTokens(tokens) }; } catch (e) { return { value: null, error: e.message }; }
  }, [tokens, can.depth, can.op]);

  const distance = live.value != null && data ? Math.abs(data.target - live.value) : null;

  const push = useCallback((t) => { setSubmitError(null); setTokens((ts) => [...ts, t]); }, []);
  const undo = useCallback(() => { setSubmitError(null); setTokens((ts) => ts.slice(0, -1)); }, []);
  const clear = useCallback(() => { setSubmitError(null); setTokens([]); }, []);

  const doSubmit = useCallback(async () => {
    setConfirm(false);
    setBusy(true);
    setSubmitError(null);
    try {
      const next = await api('/daily/target/submit', { method: 'POST', body: { expression: tokensToString(tokens) } });
      setData(next);
      const d = next.result?.distance;
      if (d === 0) { sound('success'); haptic('success'); confetti({ y: 0.3 }); }
      else if (next.result?.score > 0) sound('coin');
      if (next.progress) celebrate?.(next.progress);
    } catch (e) {
      sound('error');
      setSubmitError(e.message);
      setShake(true);
      if (e.status === 409) reload();
    } finally {
      setBusy(false);
    }
  }, [tokens, setData, celebrate, reload]);

  const submit = useCallback(() => {
    if (busy || live.value == null) return;
    if (distance === 0) doSubmit(); else setConfirm(true);
  }, [busy, live.value, distance, doSubmit]);

  // Keyboard: operators, brackets, Backspace = undo, Enter = submit, Escape = clear/close,
  // digits pick the first unused tile with that value (0 → 10).
  useEffect(() => {
    if (!data || data.finished) return;
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (confirm) { if (e.key === 'Escape') setConfirm(false); return; }
      const k = e.key;
      if (KEY_OPS[k] && can.op) { e.preventDefault(); push({ type: 'op', value: KEY_OPS[k] }); }
      else if (k === '(' && can.open) push({ type: '(' });
      else if (k === ')' && can.close) push({ type: ')' });
      else if (k === 'Backspace') { e.preventDefault(); undo(); }
      else if (k === 'Escape') clear();
      else if (k === 'Enter') {
        if (e.target instanceof HTMLElement && e.target.tagName === 'BUTTON') return;
        e.preventDefault(); submit();
      } else if (/^[0-9]$/.test(k) && can.num) {
        const want = k === '0' ? 10 : Number(k);
        const idx = data.numbers.findIndex((n, i) => n === want && !used.has(i));
        if (idx >= 0) push({ type: 'num', value: want, idx });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [data, confirm, can.op, can.open, can.close, can.num, used, push, undo, clear, submit]);

  return (
    <div className="container narrow tg-page">
      <GameHeader
        icon="🎯"
        title="Target"
        date={data?.date}
        help={(
          <>
            <p>Combine the six numbers with + − × ÷ and brackets to land as close to the target as you can.</p>
            <ul>
              <li>Each number can be used once (you don't need them all).</li>
              <li>Division must come out whole.</li>
              <li>Exact = 10 points, 1 away = 9, … 10+ away = 0.</li>
            </ul>
            <p className="muted small">One submission per day. Keyboard: digits pick tiles (0 = 10), + − * / ( ), Backspace to undo, Enter to submit.</p>
          </>
        )}
      />

      <GameStatus loading={loading && !data} error={!data ? error : null} onRetry={reload} />

      {data && (
        <div className="tg-game">
          <div className="tg-target card">
            <span className="tg-target-label">Target</span>
            <span className="tg-target-num mono">{data.target}</span>
          </div>

          {!data.finished ? (
            <>
              <div className={`tg-display${shake ? ' shake' : ''}`} onAnimationEnd={() => setShake(false)} aria-live="polite">
                <div className="tg-expr mono" aria-label="Expression">
                  {tokens.length ? tokens.map((t, i) => (
                    <span key={i} className={`tg-tok tg-tok-${t.type === 'num' ? 'num' : t.type === 'op' ? 'op' : 'paren'}`}>
                      {t.type === 'num' ? t.value : t.type === 'op' ? OP_SYMBOL[t.value] : t.type}
                    </span>
                  )) : <span className="muted tg-placeholder">{live.hint}</span>}
                  <span className="tg-caret" aria-hidden="true" />
                </div>
                <div className="tg-value">
                  {live.value != null ? (
                    <>
                      <span className="tg-eq mono">= {live.value}</span>
                      <span className={`badge ${distance === 0 ? 'done' : distance <= 5 ? 'gold' : ''}`}>
                        {distance === 0 ? 'Bullseye!' : `${distance} away`}
                      </span>
                    </>
                  ) : live.error ? (
                    <span className="tg-err">{live.error}</span>
                  ) : tokens.length ? (
                    <span className="muted small">{live.partial != null ? <>so far <span className="mono">{live.partial}</span> · </> : null}{live.hint}</span>
                  ) : null}
                </div>
              </div>

              <div className="tg-numbers" role="group" aria-label="Numbers">
                {data.numbers.map((n, i) => (
                  <button
                    key={i}
                    type="button"
                    className={`tg-num${n >= 25 ? ' big' : ''}${used.has(i) ? ' used' : ''}`}
                    disabled={used.has(i) || !can.num || busy}
                    onClick={() => push({ type: 'num', value: n, idx: i })}
                    aria-label={`${n}${used.has(i) ? ' (used)' : ''}`}
                  >
                    {n}
                  </button>
                ))}
              </div>

              <div className="tg-ops" role="group" aria-label="Operators">
                {OPS.map((o) => (
                  <button key={o} type="button" className="tg-op" disabled={!can.op || busy} onClick={() => push({ type: 'op', value: o })}>
                    {OP_SYMBOL[o]}
                  </button>
                ))}
                <button type="button" className="tg-op paren" disabled={!can.open || busy} onClick={() => push({ type: '(' })}>(</button>
                <button type="button" className="tg-op paren" disabled={!can.close || busy} onClick={() => push({ type: ')' })}>)</button>
              </div>

              {submitError && <div className="alert error" role="alert">{submitError}</div>}

              <div className="tg-actions">
                <button type="button" className="btn secondary" onClick={undo} disabled={!tokens.length || busy}>↶ Undo</button>
                <button type="button" className="btn ghost" onClick={clear} disabled={!tokens.length || busy}>Clear</button>
                <button type="button" className="btn accent tg-submit" onClick={submit} disabled={live.value == null || busy}>
                  {busy ? 'Checking…' : 'Submit'}
                </button>
              </div>
              <p className="muted small center tg-note">You get one submission today — make it count.</p>
            </>
          ) : (
            <ResultPanel
              game="target"
              emoji={data.result.distance === 0 ? '🎯' : data.result.distance <= 3 ? '🔥' : '🧮'}
              title={data.result.distance === 0 ? 'Bullseye!' : data.result.score > 0 ? `${data.result.distance} away — nice!` : 'Not this time'}
              subtitle={<span className="mono">{data.result.expression} = {data.result.value}</span>}
              stats={[
                { label: 'Your value', value: data.result.value },
                { label: 'Off by', value: data.result.distance },
                { label: 'Score', value: `${data.result.score}/10` },
              ]}
              progress={data.progress}
              shareText={shareTextFor(data)}
            >
              {data.solution && (
                <div className="tg-solution">
                  <span className="muted small">{data.result.distance === 0 ? 'Our route' : 'One way to hit it'}</span>
                  <span className="mono">{data.solution} = {data.target}</span>
                </div>
              )}
            </ResultPanel>
          )}
        </div>
      )}

      {confirm && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="tg-confirm-title" onClick={() => setConfirm(false)}>
          <div className="modal card pop" onClick={(e) => e.stopPropagation()}>
            <h2 id="tg-confirm-title">Lock it in?</h2>
            <p>
              <span className="mono">{live.value}</span> is <strong>{distance} away</strong> from {data.target}
              {' '}— that's worth <strong>{Math.max(0, 10 - distance)} points</strong>. You only get one submission today.
            </p>
            <div className="row">
              <button type="button" className="btn secondary" onClick={() => setConfirm(false)} autoFocus>Keep trying</button>
              <button type="button" className="btn accent" onClick={doSubmit}>Submit</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
