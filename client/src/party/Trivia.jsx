import { useEffect } from 'react';
import { Avatar, CountdownBar, useTicker } from './common.jsx';

const SHAPES = ['▲', '◆', '●', '■'];
const KEYS = { 1: 0, 2: 1, 3: 2, 4: 3, a: 0, b: 1, c: 2, d: 3 };

export default function Trivia({ room, me, question, myChoice, answeredIds, reveal, send, serverNow }) {
  const revealed = reveal && question && reveal.round === question.round;
  const open = question && !revealed;
  useTicker(Boolean(open), 200);
  const remaining = question ? Math.max(0, question.endsAt - serverNow()) : 0;
  const locked = myChoice != null || !open || remaining <= 0;

  const choose = (i) => {
    if (locked) return;
    send({ type: 'answer', choice: i });
    navigator.vibrate?.(15);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target instanceof HTMLElement && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
      const i = KEYS[e.key.toLowerCase()];
      if (i !== undefined) { e.preventDefault(); choose(i); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!question) return <div className="card pt-stage pt-center"><p className="muted">Loading question…</p></div>;

  const connected = room.players.filter((p) => p.connected);
  const byId = new Map(room.players.map((p) => [p.id, p]));
  const myGain = revealed ? reveal.gained?.[me] ?? 0 : null;
  const iWasRight = revealed && reveal.answers?.[me] === reveal.correct;

  return (
    <section className="pt-trivia" aria-label={`Question ${question.round} of ${room.totalRounds}`}>
      <div className="spread pt-q-meta">
        <span className="badge">Question {question.round}/{room.totalRounds}</span>
        <span className="badge gold">{question.category}</span>
        <span className={`pt-secs mono${remaining < 4000 && open ? ' is-low' : ''}`} aria-label="Seconds left">
          {open ? Math.ceil(remaining / 1000) : revealed ? '✓' : 0}
        </span>
      </div>
      <CountdownBar k={question.round} endsAt={question.endsAt} duration={question.duration || 12000}
        serverNow={serverNow} paused={!open} />

      <h2 key={question.round} className="pt-question pop">{question.text}</h2>

      <div className="pt-choices" role="group" aria-label="Answers">
        {question.choices.map((c, i) => {
          const mine = myChoice === i || (revealed && reveal.answers?.[me] === i);
          let cls = `pt-choice pt-choice-${i}`;
          if (mine) cls += ' is-mine';
          if (revealed) cls += i === reveal.correct ? ' is-correct' : mine ? ' is-wrong' : ' is-dim';
          else if (myChoice != null && !mine) cls += ' is-dim';
          const pickers = revealed ? Object.entries(reveal.answers).filter(([, v]) => v === i).map(([id]) => byId.get(id)).filter(Boolean) : [];
          return (
            <button key={i} className={cls} onClick={() => choose(i)} disabled={locked && !mine}
              aria-pressed={mine} aria-keyshortcuts={String(i + 1)}>
              <span className="pt-shape" aria-hidden="true">{SHAPES[i]}</span>
              <span className="pt-choice-text">{c}</span>
              {revealed && i === reveal.correct && <span className="pt-mark" aria-label="Correct answer">✓</span>}
              {revealed && mine && i !== reveal.correct && <span className="pt-mark" aria-label="Your wrong answer">✗</span>}
              {pickers.length > 0 && (
                <span className="pt-pickers" aria-label={`Picked by ${pickers.map((p) => p.username).join(', ')}`}>
                  {pickers.slice(0, 6).map((p) => <Avatar key={p.id} player={p} size="xs" />)}
                </span>
              )}
              <kbd className="pt-key" aria-hidden="true">{i + 1}</kbd>
            </button>
          );
        })}
      </div>

      <div className="pt-q-status" aria-live="polite">
        {revealed ? (
          <div className={`pt-verdict pop ${iWasRight ? 'is-good' : 'is-bad'}`}>
            {reveal.answers?.[me] == null ? '⏰ Too slow!' : iWasRight ? '🎉 Correct!' : '😬 Not quite'}
            <strong className="mono">{myGain > 0 ? `+${myGain}` : '+0'}</strong>
            <span className="small muted">
              {question.round < room.totalRounds ? 'Next question coming up…' : 'Final scores coming up…'}
            </span>
          </div>
        ) : myChoice != null ? (
          <div className="pt-locked small">
            🔒 Locked in — waiting for others ({answeredIds.length}/{connected.length})
          </div>
        ) : (
          <div className="small muted">Tap an answer or press 1–4 · {answeredIds.length}/{connected.length} answered</div>
        )}
      </div>
    </section>
  );
}
