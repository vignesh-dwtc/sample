import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useSession } from '../lib/session.jsx';
import ChatPanel from '../detective/ChatPanel.jsx';
import Notebook from '../detective/Notebook.jsx';
import AccuseModal from '../detective/AccuseModal.jsx';
import ConfirmModal from '../detective/ConfirmModal.jsx';
import Reveal from '../detective/Reveal.jsx';
import QuestionMeter from '../detective/QuestionMeter.jsx';
import { confetti, haptic, sound } from '../fx/index.js';
import './Detective.css';

const MAX_QUESTIONS = 15;

export default function Detective() {
  const { celebrate } = useSession() || {};
  const [state, setState] = useState('loading'); // loading | empty | creating | playing | revealed | error
  const [caseData, setCaseData] = useState(null);
  const [error, setError] = useState('');
  const [activeId, setActiveId] = useState(null);
  const [pending, setPending] = useState(null); // { suspectId, question }
  const [askError, setAskError] = useState('');
  const [showAccuse, setShowAccuse] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);
  const [accusing, setAccusing] = useState(false);
  const [result, setResult] = useState(null);
  const [fileOpen, setFileOpen] = useState(true);
  const notebookRef = useRef(null);
  const chatRef = useRef(null);

  const load = useCallback(async () => {
    setState('loading');
    setError('');
    try {
      const { case: c } = await api('/detective/current');
      if (c) {
        setCaseData(c);
        setActiveId(c.suspects[0]?.id ?? null);
        setFileOpen(Object.keys(c.transcripts || {}).length === 0);
        setState('playing');
      } else {
        setState('empty');
      }
    } catch (e) {
      setError(e.message);
      setState('error');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const startNew = async () => {
    setConfirmNew(false);
    setState('creating');
    setError('');
    setResult(null);
    try {
      const { case: c } = await api('/detective/new', { method: 'POST' });
      setCaseData(c);
      setActiveId(c.suspects[0]?.id ?? null);
      setFileOpen(true);
      setAskError('');
      setState('playing');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setError(e.message);
      setState('error');
    }
  };

  const ask = async (question) => {
    if (!caseData || pending) return false;
    const suspectId = activeId;
    setAskError('');
    setPending({ suspectId, question });
    const started = Date.now();
    try {
      const { reply, questionsLeft } = await api(`/detective/${caseData.id}/ask`, {
        method: 'POST', body: { suspectId, question },
      });
      // A beat of "typing" keeps instant canned replies from feeling robotic.
      const wait = Math.max(0, 650 + Math.min(900, reply.length * 6) - (Date.now() - started));
      if (wait) await new Promise((r) => setTimeout(r, wait));
      setCaseData((c) => ({
        ...c,
        questionsLeft,
        transcripts: {
          ...c.transcripts,
          [suspectId]: [...(c.transcripts[suspectId] || []), { role: 'user', content: question }, { role: 'assistant', content: reply }],
        },
      }));
      return true;
    } catch (e) {
      setAskError(e.message);
      if (e.status === 409) load();
      return false;
    } finally {
      setPending(null);
    }
  };

  const accuse = async (suspectId) => {
    setAccusing(true);
    try {
      const res = await api(`/detective/${caseData.id}/accuse`, { method: 'POST', body: { suspectId } });
      setResult({ ...res, accusedId: suspectId });
      setShowAccuse(false);
      setState('revealed');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      if (res.correct) { sound('success'); haptic('success'); setTimeout(() => confetti({ y: 0.25 }), 300); }
      else { sound('error'); haptic('error'); }
      celebrate?.(res.progress);
    } catch (e) {
      setAskError(e.message);
      setShowAccuse(false);
      if (e.status === 409) load();
    } finally {
      setAccusing(false);
    }
  };

  const selectSuspect = (id) => {
    setActiveId(id);
    setAskError('');
    // On narrow screens the chat sits below the suspects: bring it into view.
    if (window.matchMedia('(max-width: 900px)').matches) {
      requestAnimationFrame(() => chatRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  };

  // Number keys 1-4 switch suspects (when not typing).
  useEffect(() => {
    if (state !== 'playing' || !caseData) return undefined;
    const onKey = (e) => {
      if (e.target.closest?.('input, textarea, [contenteditable="true"]') || e.metaKey || e.ctrlKey || e.altKey) return;
      if (showAccuse || confirmNew) return;
      const i = Number(e.key) - 1;
      if (i >= 0 && i < caseData.suspects.length) setActiveId(caseData.suspects[i].id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state, caseData, showAccuse, confirmNew]);

  if (state === 'loading') {
    return (
      <div className="container dt-page" aria-busy="true">
        <div className="dt-skeleton card" />
        <div className="dt-skeleton-grid">
          {[0, 1, 2, 3].map((i) => <div key={i} className="dt-skeleton card short" />)}
        </div>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="container narrow dt-page">
        <div className="card stack center">
          <div className="dt-big-emoji" aria-hidden="true">🕯️</div>
          <h1>The case files are stuck</h1>
          <div className="alert error" role="alert">{error || 'Something went wrong.'}</div>
          <div className="row" style={{ justifyContent: 'center' }}>
            <button type="button" className="btn" onClick={load}>Try again</button>
            <Link to="/" className="btn secondary">Home</Link>
          </div>
        </div>
      </div>
    );
  }

  if (state === 'creating') {
    return (
      <div className="container narrow dt-page">
        <div className="card dt-creating center" role="status" aria-live="polite">
          <div className="dt-folder" aria-hidden="true">
            <span className="dt-folder-back" />
            <span className="dt-folder-paper p1" />
            <span className="dt-folder-paper p2" />
            <span className="dt-folder-front">CASE FILE</span>
          </div>
          <h2>Preparing your case file…</h2>
          <p className="muted">Gathering witnesses, dusting for fingerprints and brewing strong coffee.</p>
        </div>
      </div>
    );
  }

  if (state === 'empty') {
    return (
      <div className="container dt-page">
        <section className="dt-hero card pop">
          <div className="dt-hero-text">
            <span className="badge gold">🕵️ Detective</span>
            <h1>Every suspect has a story. <span className="dt-grad">One of them is lying.</span></h1>
            <p className="muted">
              Read the case file, question four suspects and catch the contradiction. You have {MAX_QUESTIONS} questions —
              the fewer you use, the bigger your reward. Then make your accusation.
            </p>
            <div className="row">
              <button type="button" className="btn accent dt-cta" onClick={startNew}>Open a new case</button>
              <Link to="/leaderboard" className="btn ghost">Top detectives →</Link>
            </div>
          </div>
          <ol className="dt-howto">
            <li><span aria-hidden="true">📁</span><div><strong>Study the file</strong><span className="muted small">Victim, setting and clues from the scene.</span></div></li>
            <li><span aria-hidden="true">💬</span><div><strong>Interrogate</strong><span className="muted small">Ask about alibis, the victim, and each other.</span></div></li>
            <li><span aria-hidden="true">📝</span><div><strong>Take notes</strong><span className="muted small">Pin testimony and spot what doesn’t add up.</span></div></li>
            <li><span aria-hidden="true">☝️</span><div><strong>Accuse</strong><span className="muted small">One shot. Solve it fast for bonus XP.</span></div></li>
          </ol>
        </section>
      </div>
    );
  }

  if (state === 'revealed' && result) {
    return (
      <div className="container dt-page">
        <Reveal caseData={caseData} result={result} onNew={startNew} />
      </div>
    );
  }

  // ── playing ─────────────────────────────────────────────
  const c = caseData;
  const active = c.suspects.find((s) => s.id === activeId) || c.suspects[0];
  const asked = (id) => (c.transcripts[id]?.length || 0) / 2;
  const used = MAX_QUESTIONS - c.questionsLeft;
  // ARIA tabs pattern: arrow keys / Home / End move between suspects.
  const onTabKey = (e) => {
    const idx = c.suspects.findIndex((s) => s.id === active.id);
    const n = c.suspects.length;
    const next = { ArrowRight: idx + 1, ArrowDown: idx + 1, ArrowLeft: idx - 1, ArrowUp: idx - 1, Home: 0, End: n - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    const s = c.suspects[(next + n) % n];
    setActiveId(s.id);
    requestAnimationFrame(() => document.getElementById(`dt-tab-${s.id}`)?.focus());
  };

  return (
    <div className="container dt-page">
      <header className="dt-header">
        <div className="dt-header-main">
          <div className="row dt-badges">
            <span className={`badge ${c.source === 'ai' ? 'live' : 'gold'}`}>{c.source === 'ai' ? '✨ AI-generated' : '📜 Classic case'}</span>
            <span className="badge">{used} asked</span>
          </div>
          <h1 className="dt-title">{c.title}</h1>
          <p className="muted dt-setting">{c.setting}</p>
        </div>
        <div className="dt-header-side">
          <QuestionMeter left={c.questionsLeft} max={MAX_QUESTIONS} />
          <div className="row dt-header-actions">
            <button type="button" className="btn danger dt-accuse-btn" onClick={() => setShowAccuse(true)}>☝️ Accuse</button>
            <button type="button" className="btn ghost small" onClick={() => setConfirmNew(true)}>New case</button>
          </div>
        </div>
      </header>

      <div className="dt-layout">
        <div className="dt-col">
          <section className={`card dt-file ${fileOpen ? 'open' : ''}`} aria-labelledby="dt-file-h">
            <button type="button" className="dt-file-toggle" onClick={() => setFileOpen((o) => !o)} aria-expanded={fileOpen}>
              <span id="dt-file-h" className="dt-file-tab">📁 Case file</span>
              <span className="muted small">{fileOpen ? 'Hide' : 'Show'} details</span>
              <span className={`dt-chevron ${fileOpen ? 'up' : ''}`} aria-hidden="true">▾</span>
            </button>
            <div className="dt-victim">
              <span className="dt-victim-label">Victim</span>
              <strong>{c.victim}</strong>
            </div>
            {fileOpen && (
              <div className="dt-file-body">
                <p className="dt-intro">{c.intro}</p>
                <h3 className="dt-sub">Evidence</h3>
                <ol className="dt-clues">
                  {c.clues.map((clue, i) => (
                    <li key={i} className="dt-clue" style={{ '--i': i }}>
                      <span className="dt-clue-num" aria-hidden="true">{i + 1}</span>
                      <span>{clue}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </section>

          <section aria-label="Suspects">
            <h2 className="dt-section-h">Suspects <span className="muted small">— tap to question{' '}<span className="dt-kbd-hint">(keys 1–4)</span></span></h2>
            <div className="dt-suspects" role="tablist" aria-label="Choose a suspect" onKeyDown={onTabKey}>
              {c.suspects.map((s, i) => (
                <button
                  type="button"
                  key={s.id}
                  role="tab"
                  id={`dt-tab-${s.id}`}
                  aria-controls="dt-chat-panel"
                  tabIndex={s.id === active.id ? 0 : -1}
                  aria-selected={s.id === active.id}
                  className={`dt-suspect ${s.id === active.id ? 'active' : ''}`}
                  onClick={() => selectSuspect(s.id)}
                  style={{ '--i': i }}
                >
                  <span className="dt-avatar" aria-hidden="true">{s.emoji}</span>
                  <span className="dt-suspect-text">
                    <strong>{s.name}</strong>
                    <span className="dt-role">{s.role}</span>
                    <span className="dt-desc">{s.description}</span>
                  </span>
                  {asked(s.id) > 0 && <span className="dt-asked" aria-label={`${asked(s.id)} questions asked`}>{asked(s.id)}</span>}
                </button>
              ))}
            </div>
          </section>
        </div>

        <div className="dt-col dt-col-right">
          <div ref={chatRef} className="dt-chat-anchor" role="tabpanel" id="dt-chat-panel" aria-labelledby={`dt-tab-${active.id}`}>
            <ChatPanel
              key={active.id}
              suspect={active}
              suspects={c.suspects}
              transcript={c.transcripts[active.id] || []}
              pending={pending?.suspectId === active.id ? pending.question : null}
              busy={!!pending}
              questionsLeft={c.questionsLeft}
              error={askError}
              onAsk={ask}
              onPin={(text) => notebookRef.current?.append(`${active.name}: “${text}”`)}
              onAccuse={() => setShowAccuse(true)}
            />
          </div>
          <Notebook ref={notebookRef} caseId={c.id} />
        </div>
      </div>

      {showAccuse && (
        <AccuseModal
          suspects={c.suspects}
          initial={active.id}
          busy={accusing}
          onCancel={() => setShowAccuse(false)}
          onConfirm={accuse}
        />
      )}
      {confirmNew && (
        <ConfirmModal
          title="Abandon this case?"
          body="Starting a new case closes this one unsolved. You won’t earn XP for it."
          confirmLabel="Abandon & start new"
          danger
          onCancel={() => setConfirmNew(false)}
          onConfirm={startNew}
        />
      )}
    </div>
  );
}
