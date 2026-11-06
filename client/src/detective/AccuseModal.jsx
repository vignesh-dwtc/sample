import { useState } from 'react';
import { useModal } from './useModal.js';

/** Two-step accusation: pick a suspect, then confirm. */
export default function AccuseModal({ suspects, initial, busy, onCancel, onConfirm }) {
  const [choice, setChoice] = useState(null);
  const [step, setStep] = useState('pick');
  const ref = useModal(busy ? undefined : onCancel);
  const chosen = suspects.find((s) => s.id === choice);

  return (
    <div className="modal-backdrop dt-backdrop" onMouseDown={(e) => !busy && e.target === e.currentTarget && onCancel()}>
      <div ref={ref} className="modal card dt-modal dt-accuse" role="dialog" aria-modal="true" aria-labelledby="dt-accuse-h" tabIndex={-1}>
        {step === 'pick' ? (
          <>
            <h2 id="dt-accuse-h">Who did it?</h2>
            <p className="muted small">You get one accusation. It closes the case.</p>
            <div className="dt-accuse-grid" role="radiogroup" aria-label="Suspects">
              {suspects.map((s) => (
                <button
                  type="button"
                  key={s.id}
                  role="radio"
                  aria-checked={choice === s.id}
                  className={`dt-accuse-pick ${choice === s.id ? 'chosen' : ''}`}
                  onClick={() => setChoice(s.id)}
                  onDoubleClick={() => { setChoice(s.id); setStep('confirm'); }}
                  data-autofocus={s.id === initial ? true : undefined}
                >
                  <span className="dt-avatar" aria-hidden="true">{s.emoji}</span>
                  <strong>{s.name}</strong>
                  <span className="dt-role">{s.role}</span>
                </button>
              ))}
            </div>
            <div className="row dt-modal-actions">
              <button type="button" className="btn secondary" onClick={onCancel}>Keep investigating</button>
              <button type="button" className="btn danger" disabled={!choice} onClick={() => setStep('confirm')}>Accuse…</button>
            </div>
          </>
        ) : (
          <div className="dt-confirm pop">
            <div className="dt-confirm-avatar" aria-hidden="true">{chosen.emoji}</div>
            <h2 id="dt-accuse-h">Accuse {chosen.name}?</h2>
            <p className="muted">Are you sure? There’s no going back once you name the culprit.</p>
            <div className="row dt-modal-actions">
              <button type="button" className="btn secondary" disabled={busy} onClick={() => setStep('pick')} data-autofocus>Back</button>
              <button type="button" className="btn danger" disabled={busy} onClick={() => onConfirm(chosen.id)}>
                {busy ? 'Revealing…' : `Yes, it was ${chosen.name.split(' ')[0] === 'Dr' ? chosen.name : chosen.name.split(' ')[0]}`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
