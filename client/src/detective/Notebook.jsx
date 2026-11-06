import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

const keyFor = (caseId) => `playnest.detective.notes.${caseId}`;
const read = (caseId) => { try { return localStorage.getItem(keyFor(caseId)) || ''; } catch { return ''; } };
const write = (caseId, v) => { try { v ? localStorage.setItem(keyFor(caseId), v) : localStorage.removeItem(keyFor(caseId)); } catch { /* storage unavailable */ } };

/** Free-text notes saved per case in localStorage. Exposes append(text) for pinning testimony. */
const Notebook = forwardRef(function Notebook({ caseId }, ref) {
  const [text, setText] = useState(() => read(caseId));
  const [saved, setSaved] = useState(true);
  const [flash, setFlash] = useState(0);
  const area = useRef(null);

  useEffect(() => { setText(read(caseId)); }, [caseId]);

  useEffect(() => {
    setSaved(false);
    const t = setTimeout(() => { write(caseId, text); setSaved(true); }, 400);
    return () => clearTimeout(t);
  }, [text, caseId]);

  useImperativeHandle(ref, () => ({
    append(line) {
      setText((t) => (t.trim() ? `${t.replace(/\s+$/, '')}\n• ${line}` : `• ${line}`));
      setFlash(1);
      requestAnimationFrame(() => { if (area.current) area.current.scrollTop = area.current.scrollHeight; });
    },
  }), []);

  return (
    <section className={`card dt-notebook ${flash ? 'flash' : ''}`} onAnimationEnd={() => setFlash(0)} aria-labelledby="dt-notes-h">
      <div className="spread">
        <h2 id="dt-notes-h" className="dt-section-h">📝 Notebook</h2>
        <span className="muted small" aria-live="polite">{text ? (saved ? 'Saved' : 'Saving…') : 'Private to this device'}</span>
      </div>
      <textarea
        ref={area}
        className="input dt-notes"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={'Who was where, and when?\nWhat doesn’t add up?\nTip: tap 📌 on any answer to pin it here.'}
        aria-label="Case notes"
        rows={6}
        maxLength={5000}
      />
    </section>
  );
});

export default Notebook;
