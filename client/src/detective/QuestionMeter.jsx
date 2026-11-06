/** Segmented "questions left" meter: 15 pips that drain from the right. */
export default function QuestionMeter({ left, max }) {
  const level = left <= 2 ? 'danger' : left <= 5 ? 'warn' : 'ok';
  return (
    <div className={`dt-meter ${level}`} role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={left}
      aria-label={`${left} of ${max} questions left`}>
      <div className="dt-meter-label">
        <span className="mono dt-meter-num" key={left}>{left}</span>
        <span className="muted small">question{left === 1 ? '' : 's'} left</span>
      </div>
      <div className="dt-pips" aria-hidden="true">
        {Array.from({ length: max }, (_, i) => <span key={i} className={i < left ? 'on' : ''} />)}
      </div>
    </div>
  );
}
