import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { useSession } from '../lib/session.jsx';
import { ResultPanel, GameStatus, GameHeader, useDailyGame, siteUrl } from '../games/index.js';
import './Lexicon.css';

const ROWS = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['enter', 'z', 'x', 'c', 'v', 'b', 'n', 'm', 'back'],
];
const RANK = { miss: 1, near: 2, hit: 3 };
const EMOJI = { hit: '🟩', near: '🟨', miss: '⬛' };
const FLIP_STAGGER = 280; // ms between tiles
const REVEAL_MS = FLIP_STAGGER * 4 + 520;

function shareTextFor(data) {
  const n = data.won ? data.guesses.length : 'X';
  const grid = data.guesses.map((g) => g.marks.map((m) => EMOJI[m]).join('')).join('\n');
  return `PlayNest Lexicon ${data.date} ${n}/${data.maxGuesses}\n\n${grid}\n\n${siteUrl()}/play/lexicon`;
}

const RESULT_TITLES = ['Genius!', 'Magnificent!', 'Impressive!', 'Splendid!', 'Great!', 'Phew!'];

export default function Lexicon() {
  const { celebrate } = useSession() || {};
  const { data, setData, error, loading, reload } = useDailyGame('/daily/lexicon');
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(null);
  const [shakeRow, setShakeRow] = useState(false);
  const [revealing, setRevealing] = useState(-1); // row index currently flipping
  const [showResult, setShowResult] = useState(false);
  const [progress, setProgress] = useState(null);
  const flashTimer = useRef();

  const guesses = data?.guesses || [];
  const finished = !!data?.finished;
  const maxGuesses = data?.maxGuesses || 6;

  useEffect(() => {
    if (data?.finished && revealing < 0) setShowResult(true);
    if (data?.progress && !progress) setProgress(data.progress);
  }, [data, revealing, progress]);

  const say = useCallback((text, ms = 1600) => {
    clearTimeout(flashTimer.current);
    setFlash({ text, key: Date.now() });
    flashTimer.current = setTimeout(() => setFlash(null), ms);
  }, []);
  useEffect(() => () => clearTimeout(flashTimer.current), []);

  // Keyboard colours: best mark per letter, excluding the row still flipping.
  const keyMarks = useMemo(() => {
    const out = {};
    guesses.forEach((g, r) => {
      if (r === revealing) return;
      [...g.word].forEach((ch, i) => {
        const m = g.marks[i];
        if (!out[ch] || RANK[m] > RANK[out[ch]]) out[ch] = m;
      });
    });
    return out;
  }, [guesses, revealing]);

  const bad = useCallback((msg) => {
    say(msg);
    setShakeRow(false);
    requestAnimationFrame(() => setShakeRow(true));
  }, [say]);

  const submit = useCallback(async () => {
    if (busy || finished || revealing >= 0) return;
    if (input.length < 5) return bad('Not enough letters');
    if (guesses.some((g) => g.word === input)) return bad('Already guessed');
    setBusy(true);
    try {
      const next = await api('/daily/lexicon/guess', { method: 'POST', body: { word: input } });
      const row = next.guesses.length - 1;
      setRevealing(row);
      setData(next);
      setInput('');
      setTimeout(() => {
        setRevealing(-1);
        if (next.finished) {
          if (next.won) say(RESULT_TITLES[Math.min(row, 5)], 1800);
          else say(next.answer.toUpperCase(), 2600);
          setTimeout(() => {
            setShowResult(true);
            if (next.progress) { setProgress(next.progress); celebrate?.(next.progress); }
          }, next.won ? 900 : 1200);
        }
      }, REVEAL_MS);
    } catch (e) {
      if (e.status === 409) reload();
      bad(e.message || 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }, [busy, finished, revealing, input, guesses, bad, setData, say, celebrate, reload]);

  const press = useCallback((key) => {
    if (finished || busy || revealing >= 0) return;
    if (key === 'enter') return submit();
    if (key === 'back') return setInput((s) => s.slice(0, -1));
    if (/^[a-z]$/.test(key)) setInput((s) => (s.length < 5 ? s + key : s));
  }, [finished, busy, revealing, submit]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      if (t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (e.key === 'Enter') {
        // Let a focused button (e.g. Share) handle its own Enter.
        if (t instanceof HTMLElement && t.tagName === 'BUTTON' && !t.dataset.lxKey) return;
        e.preventDefault();
        press('enter');
      } else if (e.key === 'Backspace') { e.preventDefault(); press('back'); }
      else if (/^[a-zA-Z]$/.test(e.key)) press(e.key.toLowerCase());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [press]);

  const rows = [];
  for (let r = 0; r < maxGuesses; r++) {
    const g = guesses[r];
    const isCurrent = !g && r === guesses.length && !finished;
    const letters = g ? g.word : isCurrent ? input : '';
    const winRow = g && data.won && r === guesses.length - 1 && revealing < 0;
    rows.push(
      <div
        key={r}
        className={`lx-row${isCurrent && shakeRow ? ' lx-shake' : ''}${winRow ? ' lx-win' : ''}`}
        onAnimationEnd={(e) => { if (e.animationName === 'lx-shake') setShakeRow(false); }}
        role="row"
        aria-label={g ? `${g.word}: ${g.marks.join(', ')}` : isCurrent ? `Current guess ${input || 'empty'}` : 'Empty row'}
      >
        {Array.from({ length: 5 }, (_, i) => {
          const ch = letters[i] || '';
          const mark = g?.marks[i];
          const flipping = r === revealing;
          return (
            <div
              key={i}
              role="gridcell"
              className={`lx-tile${ch ? ' filled' : ''}${mark ? ` ${mark}` : ''}${flipping ? ' flip' : ''}${mark && !flipping ? ' shown' : ''}`}
              style={flipping || winRow ? { animationDelay: `${i * (flipping ? FLIP_STAGGER : 90)}ms` } : undefined}
            >
              {ch}
            </div>
          );
        })}
      </div>,
    );
  }

  return (
    <div className="container narrow lx-page">
      <GameHeader
        icon="🔤"
        title="Lexicon"
        date={data?.date}
        help={(
          <>
            <p>Find the hidden five-letter word in six tries. After each guess the tiles show how close you are:</p>
            <ul>
              <li><span className="lx-key-demo hit">A</span> right letter, right spot</li>
              <li><span className="lx-key-demo near">B</span> in the word, wrong spot</li>
              <li><span className="lx-key-demo miss">C</span> not in the word (or no more copies)</li>
            </ul>
            <p className="muted small">Type on your keyboard or tap the keys. One word per day — same for everyone.</p>
          </>
        )}
      >
        {data && !finished && <span>Guess {Math.min(guesses.length + 1, maxGuesses)} of {maxGuesses}</span>}
      </GameHeader>

      <GameStatus loading={loading && !data} error={!data ? error : null} onRetry={reload} />

      {data && (
        <div className="lx-game">
          <div className="lx-board-wrap">
            {flash && <div key={flash.key} className="gm-flash" role="status">{flash.text}</div>}
            <div className="lx-board" role="grid" aria-label="Lexicon board">{rows}</div>
          </div>

          {finished && showResult ? (
            <ResultPanel
              game="lexicon"
              emoji={data.won ? '🏆' : '📖'}
              title={data.won ? RESULT_TITLES[Math.min(guesses.length - 1, 5)] : 'Out of guesses'}
              subtitle={<>The word was <strong className="lx-answer">{data.answer?.toUpperCase()}</strong></>}
              stats={[
                { label: 'Guesses', value: data.won ? `${guesses.length}/${maxGuesses}` : `X/${maxGuesses}` },
                { label: 'Score', value: data.won ? 7 - guesses.length : 0 },
              ]}
              progress={progress}
              shareText={shareTextFor(data)}
            />
          ) : !finished && (
            <div className="lx-keyboard" aria-label="Keyboard">
              {ROWS.map((row, i) => (
                <div className="lx-krow" key={i}>
                  {row.map((k) => (
                    <button
                      key={k}
                      type="button"
                      data-lx-key={k}
                      className={`lx-key${k.length > 1 ? ' wide' : ''}${keyMarks[k] ? ` ${keyMarks[k]}` : ''}`}
                      onClick={(e) => { press(k); e.currentTarget.blur(); }}
                      disabled={busy && k === 'enter'}
                      aria-label={k === 'back' ? 'Backspace' : k === 'enter' ? 'Enter' : `${k}${keyMarks[k] ? ` (${keyMarks[k]})` : ''}`}
                    >
                      {k === 'back' ? '⌫' : k === 'enter' ? 'Enter' : k}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
