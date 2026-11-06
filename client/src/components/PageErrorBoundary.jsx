import { Component } from 'react';
import { Link } from 'react-router-dom';

const isChunkError = (e) => /dynamically imported module|Importing a module script failed|Failed to fetch|ChunkLoadError|error loading/i.test(String(e?.message || e));

/**
 * Catches render errors in a page (including lazy chunks that fail to load offline or after a deploy)
 * so the nav, tab bar and toasts stay usable. Resets when `resetKey` (the pathname) changes.
 */
export default class PageErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) { return { error }; }

  componentDidCatch(error, info) { console.error('Page crashed:', error, info?.componentStack); }

  componentDidUpdate(prev) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const chunk = isChunkError(error);
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    return (
      <div className="container narrow pn-crash" role="alert">
        <div className="pn-crash-icon" aria-hidden="true">{offline ? '📡' : '🧩'}</div>
        <h1>{offline ? 'You’re offline' : chunk ? 'This page needs a refresh' : 'Something went wrong'}</h1>
        <p className="muted">
          {offline
            ? 'This page hasn’t been saved for offline play yet. Reconnect and try again.'
            : chunk
              ? 'A newer version of PlayNest may be available. Reloading should fix it.'
              : 'Sorry about that — the rest of PlayNest still works.'}
        </p>
        <div className="row pn-crash-actions">
          <button type="button" className="btn" onClick={() => location.reload()}>Reload</button>
          <Link to="/" className="btn secondary">Go home</Link>
        </div>
      </div>
    );
  }
}
