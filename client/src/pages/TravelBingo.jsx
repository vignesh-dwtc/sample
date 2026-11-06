import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TravelShell, useTravel } from '../travel/TravelShell.jsx';
import { MODES } from '../travel/trip.js';
import { useSession } from '../lib/session.jsx';
import {
  BINGO_MODES, FREE_INDEX, LINES, generateCard, findLines, newLines, markedCount, bingoScore, toggleMark, lineName, BINGO_CHEERS,
} from '../travel/fun/bingoLogic.js';
import { queueScore, useScoreQueue } from '../travel/fun/scoreQueue.js';
import './TravelBingo.css';

const SKEY = (tripKey) => `playnest.bingo.${tripKey}`;
const MODE_KEY = 'playnest.bingo.mode';
const load = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } };

const freshCard = (mode, cardNo = 1) => ({ mode, cardNo, marked: [], scored: [], best: 0 });
const ints = (a, max) => (Array.isArray(a) ? [...new Set(a.filter((i) => Number.isInteger(i) && i >= 0 && i < max))] : []);
/** Saved card for this trip + mode, or null. Corrupted fields are repaired rather than crashing the page. */
function loadCard(tripKey, mode) {
  // Cards are kept per mode, so trying another mode doesn't wipe a half-filled card.
  // (Older builds saved one card per trip; reuse it if the mode matches.)
  const c = load(SKEY(`${tripKey}.${mode}`)) || load(SKEY(tripKey));
  if (!c || typeof c !== 'object' || c.mode !== mode) return null;
  return { mode, cardNo: Number.isInteger(c.cardNo) && c.cardNo > 0 ? c.cardNo : 1, marked: ints(c.marked, 25).filter((i) => i !== FREE_INDEX).sort((a, b) => a - b), scored: ints(c.scored, LINES.length), best: Number(c.best) || 0 };
}

export default function TravelBingo() {
  return (
    <TravelShell title="Window Bingo" icon="🪟">
      <Bingo />
    </TravelShell>
  );
}

function Bingo() {
  const { trip } = useTravel();
  const { celebrate } = useSession() || {};
  const tripKey = trip?.id || 'solo';
  const [soloMode, setSoloMode] = useState(() => { const m = load(MODE_KEY); return BINGO_MODES.includes(m) ? m : 'road'; });
  const mode = trip && BINGO_MODES.includes(trip.mode) ? trip.mode : soloMode;

  const cardKey = SKEY(`${tripKey}.${mode}`);
  const [card, setCard] = useState(() => loadCard(tripKey, mode));
  const [banner, setBanner] = useState(null);
  const [flash, setFlash] = useState([]);
  const [lastStamp, setLastStamp] = useState(-1);
  const [confirmNew, setConfirmNew] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const bannerTimer = useRef(null);

  // (Re)load when the trip changes; start a fresh card if none exists or the mode changed.
  useEffect(() => {
    const saved = loadCard(tripKey, mode);
    if (saved) setCard(saved);
    else { const c = freshCard(mode, 1); store(cardKey, c); setCard(c); }
  }, [tripKey, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => clearTimeout(bannerTimer.current), []);

  const onResult = useCallback(({ item, progress, ok, error }) => {
    if (item.game !== 'travel_bingo') return;
    if (ok) { setSaveMsg('✓ Score saved'); celebrate?.(progress); } else setSaveMsg(`Couldn't save: ${error}`);
  }, [celebrate]);
  const q = useScoreQueue(onResult);

  const seed = `${tripKey}#${card?.cardNo || 1}`;
  const cells = useMemo(() => generateCard(mode, seed), [mode, seed]);
  const marked = card?.mode === mode ? card.marked : [];
  const lines = useMemo(() => findLines(marked), [marked]);
  const inLine = useMemo(() => new Set(lines.flatMap((i) => LINES[i])), [lines]);
  const count = markedCount(marked);
  const score = bingoScore(marked, lines.length);
  const full = count === 24;

  const update = (next) => { store(cardKey, next); setCard(next); };

  const tap = (i) => {
    if (!card || i === FREE_INDEX) return;
    const nextMarked = toggleMark(marked, i);
    const nowLines = findLines(nextMarked);
    const fresh = newLines(card.scored, nowLines);
    const adding = nextMarked.length > marked.length;
    setLastStamp(adding ? i : -1);
    if (adding) { try { navigator.vibrate?.(fresh.length ? [30, 60, 30] : 15); } catch { /* ignore */ } }
    const next = { ...card, marked: nextMarked };
    if (fresh.length) {
      next.scored = [...card.scored, ...fresh];
      const s = bingoScore(nextMarked, nowLines.length);
      const isFull = markedCount(nextMarked) === 24;
      next.best = Math.max(card.best || 0, s);
      queueScore('travel_bingo', s, { lines: nowLines.length, full: isFull, mode }, `bingo:${mode}:${seed}`);
      setSaveMsg(navigator.onLine === false ? '📴 Offline — score saved on this phone, will sync later' : 'Saving score…');
      const cheer = isFull ? 'FULL CARD!' : BINGO_CHEERS[(card.scored.length + fresh.length - 1) % BINGO_CHEERS.length];
      setBanner({ title: cheer, sub: isFull ? 'You spotted everything. Legend!' : `${fresh.map(lineName).join(' + ')} · ${nowLines.length} line${nowLines.length > 1 ? 's' : ''}`, key: Date.now() });
      setFlash(fresh.flatMap((l) => LINES[l]));
      clearTimeout(bannerTimer.current);
      bannerTimer.current = setTimeout(() => { setBanner(null); setFlash([]); }, 2600);
    }
    update(next);
  };

  const newCard = () => {
    if (count > 0 && !confirmNew) { setConfirmNew(true); setTimeout(() => setConfirmNew(false), 4000); return; }
    setConfirmNew(false); setBanner(null); setFlash([]); setSaveMsg('');
    update(freshCard(mode, (card?.cardNo || 1) + 1));
  };

  const pickMode = (m) => {
    if (m === soloMode) return;
    setSoloMode(m); store(MODE_KEY, m);
  };

  if (!card) return null;
  return (
    <div className="bg-wrap stack">
      <div className="bg-top">
        {trip ? (
          <span className="badge">{MODES[mode]?.icon} {MODES[mode]?.label} card for this trip</span>
        ) : (
          <div className="bg-modes" role="radiogroup" aria-label="Travel mode">
            {BINGO_MODES.map((m) => (
              <button key={m} type="button" role="radio" aria-checked={m === mode}
                className={`bg-mode ${m === mode ? 'on' : ''}`} onClick={() => pickMode(m)}>
                <span aria-hidden="true">{MODES[m].icon}</span> {m === 'road' ? 'Road' : MODES[m].label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="bg-stats" aria-live="polite">
        <div><b>{count}</b><span>/24 spotted</span></div>
        <div><b>{lines.length}</b><span>{lines.length === 1 ? 'line' : 'lines'}</span></div>
        <div><b>{score}</b><span>score</span></div>
      </div>

      <div className="bg-board-wrap">
        <div className={`bg-board ${full ? 'full' : ''}`} role="group" aria-label="Bingo card">
          {cells.map((c, i) => {
            const on = i === FREE_INDEX || marked.includes(i);
            return (
              <button key={`${seed}-${i}`} type="button"
                className={`bg-cell ${on ? 'on' : ''} ${c.free ? 'free' : ''} ${inLine.has(i) ? 'line' : ''} ${flash.includes(i) ? 'flash' : ''} ${lastStamp === i ? 'stamp' : ''}`}
                aria-pressed={on} aria-label={`${c.t}${on ? ', spotted' : ''}`} onClick={() => tap(i)} disabled={c.free}>
                <span className="bg-emoji" aria-hidden="true">{c.e}</span>
                <span className="bg-label">{c.t}</span>
                {on && !c.free && <span className="bg-stamp" aria-hidden="true">✓</span>}
              </button>
            );
          })}
        </div>
        {banner && (
          <div className="bg-banner" key={banner.key} role="status">
            <div className="bg-banner-title">🎉 {banner.title}</div>
            <div className="bg-banner-sub">{banner.sub}</div>
          </div>
        )}
      </div>

      <div className="bg-foot">
        <p className="muted small bg-save" aria-live="polite">
          {q.pending > 0 && !saveMsg.startsWith('✓') ? (q.offline ? '📴 Score waiting for signal — it will sync automatically.' : saveMsg || 'Saving score…') : saveMsg || 'Spot it out of the window, then tap to stamp it. Tap again to undo.'}
        </p>
        <button type="button" className={`btn ${confirmNew ? 'danger' : 'secondary'} bg-new`} onClick={newCard}>
          {confirmNew ? 'Tap again to clear this card' : '🔀 New card'}
        </button>
      </div>
      <p className="muted small center">Rows, columns and diagonals all count. Works fully offline.</p>
    </div>
  );
}
