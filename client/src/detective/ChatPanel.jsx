import { useEffect, useMemo, useRef, useState } from 'react';

const MAX_LEN = 300;

function suggestionsFor(suspect, suspects) {
  const others = suspects.filter((s) => s.id !== suspect.id);
  const first = (n) => (n.startsWith('Dr ') ? n : n.split(' ')[0]);
  return [
    'Where were you at the time of the crime?',
    'What was your relationship with the victim?',
    'Did you see or hear anything unusual?',
    'Who had a reason to want the victim gone?',
    ...others.map((o) => `What can you tell me about ${first(o.name)}?`),
    'Who do you think did it?',
    'Are you hiding something?',
  ];
}

/** Interview panel for one suspect: transcript, typing indicator, suggestions and the question box. */
export default function ChatPanel({ suspect, suspects, transcript, pending, busy, questionsLeft, error, onAsk, onPin, onAccuse }) {
  const [text, setText] = useState('');
  const [pinned, setPinned] = useState(() => new Set());
  const scroller = useRef(null);
  const input = useRef(null);

  const askedSet = useMemo(() => new Set(transcript.filter((m) => m.role === 'user').map((m) => m.content)), [transcript]);
  const chips = suggestionsFor(suspect, suspects).filter((q) => !askedSet.has(q) && q !== pending).slice(0, 6);
  const out = questionsLeft <= 0;

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: transcript.length ? 'smooth' : 'auto' });
  }, [transcript.length, pending]);

  const submit = async (q) => {
    const question = q.trim();
    if (!question || busy || out) return;
    setText('');
    const ok = await onAsk(question);
    if (!ok) setText(question);
    input.current?.focus({ preventScroll: true });
  };

  const pin = (i, content) => {
    onPin(content);
    setPinned((p) => new Set(p).add(i));
  };

  return (
    <section className="card dt-chat" aria-label={`Interview with ${suspect.name}`}>
      <header className="dt-chat-head">
        <span className="dt-avatar lg" aria-hidden="true">{suspect.emoji}</span>
        <div className="dt-chat-who">
          <strong>{suspect.name}</strong>
          <span className="dt-role">{suspect.role}</span>
        </div>
      </header>

      <div className="dt-messages" ref={scroller} aria-live="polite" aria-relevant="additions">
        {transcript.length === 0 && !pending && (
          <div className="dt-empty-chat">
            <span aria-hidden="true">💬</span>
            <p className="muted small">{suspect.description}</p>
            <p className="small">Ask {suspect.name.split(' ')[0] === 'Dr' ? suspect.name : suspect.name.split(' ')[0]} anything — or pick a question below.</p>
          </div>
        )}
        {transcript.map((m, i) => (m.role === 'user' ? (
          <div key={i} className="dt-msg me">{m.content}</div>
        ) : (
          <div key={i} className="dt-msg them">
            <span className="dt-msg-avatar" aria-hidden="true">{suspect.emoji}</span>
            <div className="dt-bubble">
              <p>{m.content}</p>
              <button type="button" className={`dt-pin ${pinned.has(i) ? 'done' : ''}`} onClick={() => pin(i, m.content)}
                aria-label="Pin this answer to your notebook" disabled={pinned.has(i)}>
                {pinned.has(i) ? '✓ Pinned' : '📌 Pin'}
              </button>
            </div>
          </div>
        )))}
        {pending && (
          <>
            <div className="dt-msg me sending">{pending}</div>
            <div className="dt-msg them">
              <span className="dt-msg-avatar" aria-hidden="true">{suspect.emoji}</span>
              <div className="dt-bubble dt-typing" aria-label={`${suspect.name} is answering`}>
                <span /><span /><span />
              </div>
            </div>
          </>
        )}
      </div>

      {error && <div className="alert error small dt-chat-error" role="alert">{error}</div>}

      {out ? (
        <div className="dt-out">
          <p><strong>Out of questions.</strong> <span className="muted">Review your notes and name the culprit.</span></p>
          <button type="button" className="btn danger block" onClick={onAccuse}>☝️ Make your accusation</button>
        </div>
      ) : (
        <>
          {chips.length > 0 && (
            <div className="dt-chips" role="list" aria-label="Suggested questions">
              {chips.map((q) => (
                <button type="button" role="listitem" key={q} className="dt-chip" disabled={busy} onClick={() => submit(q)}>{q}</button>
              ))}
            </div>
          )}
          <form className="dt-ask" onSubmit={(e) => { e.preventDefault(); submit(text); }}>
            <div className="dt-ask-field">
              <input
                ref={input}
                className="input"
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, MAX_LEN))}
                placeholder={`Ask ${suspect.name.split(' ')[0] === 'Dr' ? suspect.name : suspect.name.split(' ')[0]} a question…`}
                aria-label={`Question for ${suspect.name}`}
                maxLength={MAX_LEN}
                enterKeyHint="send"
              />
              {text.length > MAX_LEN - 60 && <span className="dt-count mono">{MAX_LEN - text.length}</span>}
            </div>
            <button type="submit" className="btn dt-send" disabled={busy || !text.trim()} aria-label="Ask">
              <span aria-hidden="true">➤</span>
            </button>
          </form>
        </>
      )}
    </section>
  );
}
