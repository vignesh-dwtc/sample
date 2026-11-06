import { Link } from 'react-router-dom';

/** End-of-case screen: verdict stamp, the culprit, the full solution and rewards. */
export default function Reveal({ caseData, result, onNew }) {
  const { correct, solution, score, questionsLeft, progress, accusedId } = result;
  const culprit = caseData.suspects.find((s) => s.id === solution.culpritId);
  const accused = caseData.suspects.find((s) => s.id === accusedId);
  const used = 15 - questionsLeft;

  return (
    <section className={`dt-reveal ${correct ? 'win' : 'lose'}`} aria-labelledby="dt-reveal-h">
      <div className="card dt-verdict">
        <div className="dt-stamp" aria-hidden="true">{correct ? 'SOLVED' : 'UNSOLVED'}</div>
        <p className="dt-kicker muted small">{caseData.title}</p>
        <h1 id="dt-reveal-h">{correct ? 'Case closed, Detective!' : 'The culprit slipped away…'}</h1>
        <p className="muted">
          {correct
            ? `You named ${culprit.name} after ${used} question${used === 1 ? '' : 's'}.`
            : `You accused ${accused?.name}. The real culprit was ${culprit.name}.`}
        </p>
        <div className="dt-culprit pop">
          <span className="dt-avatar xl" aria-hidden="true">{culprit.emoji}</span>
          <div>
            <span className="dt-culprit-label">The culprit</span>
            <strong>{culprit.name}</strong>
            <span className="dt-role">{culprit.role}</span>
          </div>
        </div>
        <div className="dt-rewards">
          <div><span className="mono dt-reward-num">{score}</span><span className="muted small">score</span></div>
          <div><span className="mono dt-reward-num">+{progress?.xpGained ?? 0}</span><span className="muted small">XP</span></div>
          <div><span className="mono dt-reward-num">{questionsLeft}</span><span className="muted small">questions spared</span></div>
        </div>
        {progress?.achievements?.length > 0 && (
          <div className="row dt-ach">
            {progress.achievements.map((a) => <span key={a.code} className="badge gold">{a.icon} {a.title}</span>)}
          </div>
        )}
      </div>

      <div className="card dt-solution">
        <h2>What really happened</h2>
        <div className="dt-sol-block" style={{ '--i': 0 }}><h3>Motive</h3><p>{solution.motive}</p></div>
        <div className="dt-sol-block" style={{ '--i': 1 }}><h3>Method</h3><p>{solution.method}</p></div>
        <div className="dt-sol-block" style={{ '--i': 2 }}><h3>How the lie unravels</h3><p>{solution.explanation}</p></div>
        <div className="row dt-reveal-actions">
          <button type="button" className="btn accent" onClick={onNew}>🕵️ New case</button>
          <Link to="/leaderboard" className="btn secondary">Leaderboard</Link>
          <Link to="/" className="btn ghost">Home</Link>
        </div>
      </div>
    </section>
  );
}
