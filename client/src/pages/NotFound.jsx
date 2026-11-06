import { Link, useLocation, useNavigate } from 'react-router-dom';
import './NotFound.css';

export default function NotFound() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  return (
    <div className="container narrow nf-page">
      <div className="nf-art" aria-hidden="true">
        <span className="nf-digit">4</span>
        <span className="nf-egg">🥚</span>
        <span className="nf-digit">4</span>
      </div>
      <h1>This nest is empty</h1>
      <p className="muted">
        We couldn’t find <code className="nf-path mono">{pathname}</code>. It may have hatched and flown away.
      </p>
      <div className="row nf-actions">
        <Link to="/" className="btn">Back to games</Link>
        <button type="button" className="btn secondary" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}>Go back</button>
      </div>
      <nav className="nf-links" aria-label="Popular pages">
        <Link to="/play/lexicon">🔤 Lexicon</Link>
        <Link to="/play/target">🎯 Target</Link>
        <Link to="/play/flip">💡 Flip</Link>
        <Link to="/party">🎉 Party</Link>
        <Link to="/detective">🕵️ Detective</Link>
      </nav>
    </div>
  );
}
