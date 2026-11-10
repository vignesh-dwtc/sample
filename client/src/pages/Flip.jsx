import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { useSession } from '../lib/session.jsx';
import { ResultPanel, GameStatus, GameHeader, useDailyGame, siteUrl } from '../games/index.js';
import { pressCell, replay, litCount, SIZE } from '../games/flipLogic.js';
import { confetti, haptic, sound } from '../fx/index.js';
import './Flip.css';

function shareTextFor(data) {
  const r = data.result;
  const start = data.grid;
  const rows = [];
  for (let i = 0; i < SIZE; i++) rows.push(start.slice(i * SIZE, i * SIZE + SIZE).map((v) => (v ? '🟨' : '⬛')).join(''));
  const verdict = r.moves < r.par ? 'under par! 🏌️' : r.moves === r.par ? 'at par 💡' : `+${r.moves - r.par}`;
  return `PlayNest Flip ${data.date} 💡 ${r.moves} moves (par ${r.par}, ${verdict}) ${r.score}/10\n\n${rows.join('\n')}\n\n${siteUrl()}/play/flip`;
}

export default function Flip() {
  const { celebrate } = useSession() || {};
  const { data, setData, error, loading, reload } = useDailyGame('/daily/flip');
  const [moves, setMoves] = useState([]);
  const [lastPress, setLastPress] = useState(null); // { i, n } to retrigger the ripple
  const [focusIdx, setFocusIdx] = useState(12);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [solvedAnim, setSolvedAnim] = useState(false);
  const cellRefs = useRef([]);
  const submitted = useRef(false);

  const grid = useMemo(() => (data ? (data.finished ? Array(25).fill(0) : replay(data.grid, moves)) : null), [data, moves]);
  const lit = grid ? litCount(grid) : 0;
  const solved = !!grid && lit === 0 && moves.length > 0;

  const submit = useCallback(async (list) => {
    if (submitted.current) return;
    submitted.current = true;
    setBusy(true);
    setSubmitError(null);
    try {
      const next = await api('/daily/flip/submit', { method: 'POST', body: { moves: list } });
      setTimeout(() => {
        setData(next);
        if (next.progress) celebrate?.(next.progress);
      }, 900);
    } catch (e) {
      submitted.current = false;
      setSubmitError(e.message);
      if (e.status === 409) reload();
    } finally {
      setBusy(false);
    }
  }, [setData, celebrate, reload]);

  useEffect(() => {
    if (solved && data && !data.finished) {
      setSolvedAnim(true);
      sound('success'); haptic('success');
      setTimeout(() => confetti({ y: 0.35 }), 450);
      submit(moves);
    }
  }, [solved, data, moves, submit]);

  const press = useCallback((i) => {
    if (!data || data.finished || busy || submitted.current) return;
    setMoves((m) => [...m, i]);
    setLastPress((p) => ({ i, n: (p?.n || 0) + 1 }));
  }, [data, busy]);

  const undo = () => { if (!submitted.current) { setSubmitError(null); setSolvedAnim(false); setMoves((m) => m.slice(0, -1)); setLastPress(null); } };
  const reset = () => { if (!submitted.current) { setSubmitError(null); setSolvedAnim(false); setMoves([]); setLastPress(null); } };

  const onCellKey = (e, i) => {
    const r = Math.floor(i / SIZE), c = i % SIZE;
    let n = null;
    if (e.key === 'ArrowUp') n = r > 0 ? i - SIZE : i;
    else if (e.key === 'ArrowDown') n = r < SIZE - 1 ? i + SIZE : i;
    else if (e.key === 'ArrowLeft') n = c > 0 ? i - 1 : i;
    else if (e.key === 'ArrowRight') n = c < SIZE - 1 ? i + 1 : i;
    if (n != null) {
      e.preventDefault();
      setFocusIdx(n);
      cellRefs.current[n]?.focus();
    }
  };

  useEffect(() => {
    if (!data || data.finished) return;
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'z' || e.key === 'Backspace') { e.preventDefault(); undo(); }
      else if (e.key === 'r') reset();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Cells affected by the last press get a ripple.
  const ripple = useMemo(() => {
    if (!lastPress) return new Set();
    const { i } = lastPress;
    const r = Math.floor(i / SIZE), c = i % SIZE;
    const s = new Set([i]);
    if (r > 0) s.add(i - SIZE);
    if (r < SIZE - 1) s.add(i + SIZE);
    if (c > 0) s.add(i - 1);
    if (c < SIZE - 1) s.add(i + 1);
    return s;
  }, [lastPress]);

  const par = data?.par;
  const overPar = par != null && moves.length > par;

  return (
    <div className="container narrow fl-page">
      <GameHeader
        icon="💡"
        title="Flip"
        date={data?.date}
        help={(
          <>
            <p>Switch every light off. Tapping a light toggles it <em>and</em> the lights directly above, below, left and right of it.</p>
            <ul>
              <li>Par is the fewest possible moves. Finish at or under par for a perfect 10.</li>
              <li>Each move over par costs a point. Undo and reset are free.</li>
            </ul>
            <p className="muted small">Keyboard: arrow keys to move, Enter/Space to tap, Z or Backspace to undo, R to reset.</p>
          </>
        )}
      />

      <GameStatus loading={loading && !data} error={!data ? error : null} onRetry={reload} />

      {data && (
        <div className="fl-game">
          {!data.finished && (
            <div className="fl-hud">
              <div className={`fl-counter${overPar ? ' over' : ''}`}>
                <span className="fl-counter-n mono" key={moves.length}>{moves.length}</span>
                <span className="muted small">moves</span>
              </div>
              <div className="fl-counter">
                <span className="fl-counter-n mono">{par}</span>
                <span className="muted small">par</span>
              </div>
              <div className="fl-counter">
                <span className="fl-counter-n mono">{lit}</span>
                <span className="muted small">lit</span>
              </div>
            </div>
          )}

          <div
            className={`fl-board${solvedAnim || data.finished ? ' solved' : ''}`}
            role="grid"
            aria-label={`Flip board, ${lit} lights on`}
          >
            {Array.from({ length: SIZE }, (_, r) => (
              <div role="row" key={r} className="fl-row">
                {Array.from({ length: SIZE }, (_, c) => {
                  const i = r * SIZE + c;
                  const on = grid[i] === 1;
                  return (
                    <button
                      key={i}
                      ref={(el) => { cellRefs.current[i] = el; }}
                      type="button"
                      role="gridcell"
                      tabIndex={i === focusIdx ? 0 : -1}
                      className={`fl-cell${on ? ' on' : ''}${ripple.has(i) ? ` ${i === lastPress.i ? 'pressed' : 'rippled'}${lastPress.n % 2}` : ''}`}
                      style={solvedAnim || data.finished ? { animationDelay: `${(r + c) * 50}ms` } : undefined}
                      aria-label={`Row ${r + 1}, column ${c + 1}, ${on ? 'on' : 'off'}`}
                      aria-pressed={on}
                      disabled={data.finished}
                      onClick={() => { setFocusIdx(i); press(i); }}
                      onKeyDown={(e) => onCellKey(e, i)}
                    />
                  );
                })}
              </div>
            ))}
          </div>

          {!data.finished && (
            <>
              {submitError && <div className="alert error" role="alert">{submitError}</div>}
              <div className="fl-actions">
                {solved && submitError && !busy && (
                  <button type="button" className="btn accent" onClick={() => submit(moves)}>Retry submit</button>
                )}
                <button type="button" className="btn secondary" onClick={undo} disabled={!moves.length || busy || (solved && !submitError)}>↶ Undo</button>
                <button type="button" className="btn ghost" onClick={reset} disabled={!moves.length || busy || (solved && !submitError)}>Reset</button>
              </div>
              <p className="muted small center fl-note" aria-live="polite">
                {solved ? 'All dark — nice!' : busy ? 'Checking…' : overPar ? `${moves.length - par} over par — keep going, or reset for a cleaner run.` : 'Turn every light off.'}
              </p>
            </>
          )}

          {data.finished && data.result && (
            <ResultPanel
              game="flip"
              emoji={data.result.moves <= data.result.par ? '💡' : '🔦'}
              title={data.result.moves < data.result.par ? 'Under par?!' : data.result.moves === data.result.par ? 'Perfect — at par!' : 'Lights out!'}
              subtitle={`Solved in ${data.result.moves} moves (par ${data.result.par})`}
              stats={[
                { label: 'Moves', value: data.result.moves },
                { label: 'Par', value: data.result.par },
                { label: 'Score', value: `${data.result.score}/10` },
              ]}
              progress={data.progress}
              shareText={shareTextFor(data)}
            />
          )}
        </div>
      )}
    </div>
  );
}
