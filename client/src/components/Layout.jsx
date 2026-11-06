import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useSession } from '../lib/session.jsx';
import { TopNav, TabBar } from './Nav.jsx';
import Toasts from './Toasts.jsx';
import PageErrorBoundary from './PageErrorBoundary.jsx';
import { LogoMark } from './Logo.jsx';
import { useInstallPrompt } from './useInstallPrompt.js';
import { titleFor } from './coreLogic.js';
import './Layout.css';

function useOnline() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return online;
}

function Footer() {
  const { canInstall, install } = useInstallPrompt();
  const { toast } = useSession() || {};
  const onInstall = async () => {
    const ok = await install();
    if (ok) toast?.({ kind: 'success', icon: '📲', title: 'PlayNest installed', body: 'Find it on your home screen' });
  };
  return (
    <footer className="pn-footer">
      <div className="pn-footer-inner">
        <div className="pn-footer-brand">
          <LogoMark size={22} />
          <span>PlayNest</span>
          <span className="muted small">· New puzzles daily at 00:00 UTC</span>
        </div>
        <nav className="pn-footer-links" aria-label="Footer">
          <Link to="/">Play</Link>
          <Link to="/party">Party</Link>
          <Link to="/detective">Detective</Link>
          <Link to="/leaderboard">Leaderboard</Link>
          <Link to="/profile">Profile</Link>
          {canInstall && <button type="button" className="btn small secondary" onClick={onInstall}>📲 Install app</button>}
        </nav>
      </div>
    </footer>
  );
}

export default function Layout({ children }) {
  const { pathname } = useLocation();
  const online = useOnline();

  // New page → top of the page + a meaningful tab title.
  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = titleFor(pathname);
  }, [pathname]);

  return (
    <div className="pn-shell">
      <a className="pn-skip" href="#main">Skip to content</a>
      <TopNav />
      {!online && (
        <div className="pn-offline" role="status">
          <span aria-hidden="true">📡</span> You’re offline — some features need a connection.
        </div>
      )}
      <main id="main" className="pn-main" tabIndex={-1}>
        <PageErrorBoundary resetKey={pathname}>{children}</PageErrorBoundary>
      </main>
      <Footer />
      <TabBar />
      <Toasts />
    </div>
  );
}
