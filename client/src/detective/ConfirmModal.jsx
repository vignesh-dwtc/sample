import { useModal } from './useModal.js';

export default function ConfirmModal({ title, body, confirmLabel = 'Confirm', danger, onCancel, onConfirm }) {
  const ref = useModal(onCancel);
  return (
    <div className="modal-backdrop dt-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div ref={ref} className="modal card dt-modal" role="dialog" aria-modal="true" aria-labelledby="dt-confirm-h" tabIndex={-1}>
        <h2 id="dt-confirm-h">{title}</h2>
        <p className="muted">{body}</p>
        <div className="row dt-modal-actions">
          <button type="button" className="btn secondary" onClick={onCancel} data-autofocus>Keep playing</button>
          <button type="button" className={`btn ${danger ? 'danger' : ''}`} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
