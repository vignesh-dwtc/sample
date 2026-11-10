import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { useSession } from '../lib/session.jsx';
import { ResultPanel, GameStatus, GameHeader, useDailyGame, siteUrl } from '../games/index.js';
import { confetti, haptic, sound } from '../fx/index.js';
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

const HINT_ICONS = { vowels: '🔤', repeats: '🔁', meaning: '💡', first: '🅰️', letter: '🔍' };
const HINT_LABELS = { vowels: 'Vowels', repeats: 'Repeats', meaning: 'Meaning', first: 'First letter', letter: 'A letter' };
const CLUE_HELP = [
  ['vowels', 'How many vowels (Y counts as a consonant)'],
  ['repeats', 'Whether any letter repeats'],
  ['meaning', 'What the word means'],
  ['first', 'Its first letter'],
  ['letter', 'One more letter you haven’t placed yet'],
];
const CLUE_ROWS = 5; // guesses 1–5 each unlock a clue
const KEYBOARD_FALLBACK = 196; // keyboard height + gap, before it has been measured

/** One unlocked clue, shown under its row. One line with an ellipsis; tap/hover for the full text. */
function Hint({ hint }) {
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  const [clipped, setClipped] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current?.querySelector('.lx-hint-text');
    if (!el) return undefined;
    const check = () => setClipped(el.scrollWidth > el.clientWidth + 1);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [hint.text]);
  const expandable = clipped || open;
  return (
    <div className="lx-line-slot">
      <button
        ref={ref}
        type="button"
        className={`lx-hint lx-hint-${hint.kind}${open ? ' open' : ''}${expandable ? ' can-open' : ''}`}
        title={hint.text}
        aria-label={`Clue ${hint.n}, ${HINT_LABELS[hint.kind] || hint.kind}: ${hint.text}`}
        aria-expanded={expandable ? open : undefined}
        tabIndex={expandable ? 0 : -1}
        onClick={(e) => { if (expandable) setOpen((o) => !o); e.currentTarget.blur(); }}
      >
        <span className="lx-hint-icon" aria-hidden="true">{HINT_ICONS[hint.kind] || '💡'}</span>
        <span className="lx-hint-text">{hint.text}</span>
      </button>
    </div>
  );
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
  const [pending, setPending] = useState(null); // word sent to the server, awaiting its result
  const [queuedEnter, setQueuedEnter] = useState(false); // Enter pressed while a guess was in flight/flipping
  const [showResult, setShowResult] = useState(false);
  const [progress, setProgress] = useState(null);
  const flashTimer = useRef();
  const wrapRef = useRef(null);
  const keyboardRef = useRef(null);
  const keyboardH = useRef(KEYBOARD_FALLBACK);

  const guesses = data?.guesses || [];
  const finished = !!data?.finished;
  const maxGuesses = data?.maxGuesses || 6;
  const hints = data?.hints || [];

  // Clue lines: row r shows clue r+1 once that row has finished flipping. The row the next
  // guess goes into (or the one still flipping) shows a "next clue" teaser instead, so the
  // line is already reserved when the clue lands. Locked clues take no space.
  const teaserRow = revealing >= 0 ? revealing : finished ? -1 : guesses.length;
  const lineFor = (r) => {
    const hint = r !== revealing ? hints.find((h) => h.n === r + 1) : null;
    if (hint) return { hint };
    if (r === teaserRow && r < CLUE_ROWS) return { teaser: true };
    return null;
  };
  let lineCount = 0;
  for (let r = 0; r < maxGuesses; r++) if (lineFor(r)) lineCount++;

  // Fit board + clue lines + keyboard into the viewport: measure the space below the board's
  // top edge once per resize and let CSS size the tiles from it (see .lx-board width).
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return undefined;
    const measure = () => {
      if (keyboardRef.current) {
        const gap = parseFloat(getComputedStyle(wrap.parentElement).rowGap) || 0;
        keyboardH.current = keyboardRef.current.offsetHeight + gap;
      }
      const top = wrap.getBoundingClientRect().top + window.scrollY;
      const tabbar = document.querySelector('.pn-tabbar');
      const bottomBar = tabbar && getComputedStyle(tabbar).display !== 'none' ? tabbar.offsetHeight : 0;
      const avail = window.innerHeight - top - keyboardH.current - bottomBar - 12;
      wrap.style.setProperty('--lx-avail', `${Math.round(avail)}px`);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [!!data, finished]);

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
    const word = input;
    // Move the word into a "pending" row right away so the player can keep typing the next one
    // while the server checks it (slow mobile data) and while the tiles flip.
    setPending(word);
    setInput('');
    setBusy(true);
    try {
      const next = await api('/daily/lexicon/guess', { method: 'POST', body: { word } });
      const row = next.guesses.length - 1;
      setRevealing(row);
      // A soft click as each tile turns over (mid-flip), then a fanfare on a win.
      for (let i = 0; i < 5; i++) setTimeout(() => sound('click'), i * FLIP_STAGGER + 240);
      setData(next);
      setPending(null);
      if (next.finished) { setInput(''); setQueuedEnter(false); }
      setTimeout(() => {
        setRevealing(-1);
        if (next.finished) {
          if (next.won) {
            say(RESULT_TITLES[Math.min(row, 5)], 1800);
            sound('success'); haptic('success');
            setTimeout(() => confetti({ y: 0.3 }), 350);
          } else {
            say(next.answer.toUpperCase(), 2600);
            sound('error');
          }
          setTimeout(() => {
            setShowResult(true);
            if (next.progress) { setProgress(next.progress); celebrate?.(next.progress); }
          }, next.won ? 900 : 1200);
        }
      }, REVEAL_MS);
    } catch (e) {
      setPending(null);
      setQueuedEnter(false);
      setInput(word); // give the rejected word back so it can be fixed
      if (e.status === 409) reload();
      bad(e.message || 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }, [busy, finished, revealing, input, guesses, bad, setData, say, celebrate, reload]);

  const press = useCallback((key) => {
    if (finished) return;
    // Typing is never blocked; only submitting waits for the previous guess to finish.
    if (key === 'enter') return busy || revealing >= 0 ? setQueuedEnter(true) : submit();
    if (key === 'back') { setQueuedEnter(false); return setInput((s) => s.slice(0, -1)); }
    if (/^[a-z]$/.test(key)) setInput((s) => (s.length < 5 ? s + key : s));
  }, [finished, busy, revealing, submit]);

  // Submit an Enter that was pressed while the previous guess was still being checked/flipped.
  useEffect(() => {
    if (!queuedEnter || busy || revealing >= 0 || finished) return;
    setQueuedEnter(false);
    if (input.length === 5) submit();
  }, [queuedEnter, busy, revealing, finished, input, submit]);

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
    const pendingRow = pending ? guesses.length : -1;
    const isPending = !g && r === pendingRow;
    const isCurrent = !g && !finished && r === (pendingRow >= 0 ? pendingRow + 1 : guesses.length);
    const letters = g ? g.word : isPending ? pending : isCurrent ? input : '';
    const winRow = g && data.won && r === guesses.length - 1 && revealing < 0;
    const line = lineFor(r);
    rows.push(
      <div key={r} className="lx-line">
      <div
        className={`lx-row${isCurrent && shakeRow ? ' lx-shake' : ''}${winRow ? ' lx-win' : ''}${isPending ? ' lx-pending' : ''}`}
        onAnimationEnd={(e) => { if (e.animationName === 'lx-shake') setShakeRow(false); }}
        role="group"
        aria-label={g ? `${g.word}: ${g.marks.join(', ')}` : isCurrent ? `Current guess ${input || 'empty'}` : 'Empty row'}
      >
        {Array.from({ length: 5 }, (_, i) => {
          const ch = letters[i] || '';
          const mark = g?.marks[i];
          const flipping = r === revealing;
          return (
            <div
              key={i}
              aria-hidden="true"
              className={`lx-tile${ch ? ' filled' : ''}${mark ? ` ${mark}` : ''}${flipping ? ' flip' : ''}${mark && !flipping ? ' shown' : ''}`}
              style={flipping || winRow ? { animationDelay: `${i * (flipping ? FLIP_STAGGER : 90)}ms` } : undefined}
            >
              {ch}
            </div>
          );
        })}
      </div>
      {line?.hint && <Hint key={line.hint.n} hint={line.hint} />}
      {line?.teaser && (
        <div className="lx-line-slot"><div className="lx-next">Next clue after this guess</div></div>
      )}
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
            <p><strong>Clues:</strong> each wrong guess unlocks a clue under that row, in this order:</p>
            <ol className="lx-help-clues">
              {CLUE_HELP.map(([k, text]) => (
                <li key={k}><span aria-hidden="true">{HINT_ICONS[k]}</span> {text}</li>
              ))}
            </ol>
            <p className="muted small">Tap a clue that&apos;s cut off to read all of it.</p>
            <p className="muted small">Type on your keyboard or tap the keys. One word per day — same for everyone.</p>
          </>
        )}
      >
        {data && !finished && <span>Guess {Math.min(guesses.length + 1, maxGuesses)} of {maxGuesses}</span>}
      </GameHeader>

      <GameStatus loading={loading && !data} error={!data ? error : null} onRetry={reload} />

      {data && (
        <div className="lx-game">
          <div className="lx-board-wrap" ref={wrapRef}>
            {flash && <div key={flash.key} className="gm-flash" role="status">{flash.text}</div>}
            <div className="lx-board" role="group" aria-label="Lexicon board" style={{ '--lx-lines': lineCount }}>{rows}</div>
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
            >
              {data.clue && (
                <p className="lx-result-clue"><span aria-hidden="true">💡</span> <span><strong>Clue:</strong> {data.clue}</span></p>
              )}
            </ResultPanel>
          ) : !finished && (
            <div className="lx-keyboard" aria-label="Keyboard" ref={keyboardRef}>
              {ROWS.map((row, i) => (
                <div className="lx-krow" key={i}>
                  {row.map((k) => (
                    <button
                      key={k}
                      type="button"
                      data-lx-key={k}
                      className={`lx-key${k.length > 1 ? ' wide' : ''}${keyMarks[k] ? ` ${keyMarks[k]}` : ''}`}
                      onClick={(e) => { press(k); e.currentTarget.blur(); }}
                      disabled={false}
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
