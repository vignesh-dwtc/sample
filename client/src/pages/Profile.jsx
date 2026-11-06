import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useSession } from '../lib/session.jsx';
import { GAME_INFO, formatNumber, levelPercent, validateClaim, winRate } from '../components/coreLogic.js';
import './Profile.css';

const FALLBACK_AVATARS = ['🦊', '🐼', '🐸', '🦉', '🐙', '🦄', '🐯', '🐧', '🐨', '🦖', '🐝', '🐳'];
const dateFmt = (d) => (d ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '');

function AvatarPicker({ current, onClose }) {
  const { refresh, toast } = useSession();
  const [avatars, setAvatars] = useState(null);
  const [saving, setSaving] = useState(null);
  const [error, setError] = useState(null);
  const firstRef = useRef(null);
  const dialogRef = useRef(null);

  // Return focus to whatever opened the picker (the avatar button) when it closes.
  useEffect(() => {
    const opener = document.activeElement;
    return () => { if (opener && opener.isConnected) opener.focus?.(); };
  }, []);

  useEffect(() => {
    let alive = true;
    api('/auth/me')
      .then((d) => alive && setAvatars(d.avatars?.length ? d.avatars : FALLBACK_AVATARS))
      .catch(() => alive && setAvatars(FALLBACK_AVATARS));
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      // Keep keyboard focus inside the modal.
      const items = [...dialogRef.current.querySelectorAll('button:not([disabled]), [href], input, [tabindex]:not([tabindex="-1"])')];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const inside = dialogRef.current.contains(document.activeElement);
      if (e.shiftKey && (document.activeElement === first || !inside)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !inside)) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => { if (avatars) firstRef.current?.focus(); }, [avatars]);

  const choose = async (a) => {
    if (a === current) return onClose();
    setSaving(a); setError(null);
    try {
      await api('/auth/me', { method: 'PATCH', body: { avatar: a } });
      await refresh();
      toast({ kind: 'success', icon: a, title: 'Avatar updated' });
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="modal-backdrop pf-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={dialogRef} className="modal card pf-picker pop" role="dialog" aria-modal="true" aria-labelledby="pf-picker-title">
        <div className="spread">
          <h2 id="pf-picker-title">Choose your avatar</h2>
          <button type="button" className="btn ghost small" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {error && <div className="alert error" role="alert">{error}</div>}
        {!avatars ? (
          <div className="pf-avatar-grid" aria-busy="true">
            {Array.from({ length: 12 }, (_, i) => <span key={i} className="pf-avatar-opt pf-skel" />)}
          </div>
        ) : (
          <div className="pf-avatar-grid" role="radiogroup" aria-label="Avatars">
            {avatars.map((a, i) => (
              <button
                key={a} ref={a === current || (i === 0 && !avatars.includes(current)) ? firstRef : undefined}
                type="button" role="radio" aria-checked={a === current} aria-label={`Avatar ${a}`}
                className={`pf-avatar-opt${a === current ? ' is-current' : ''}${saving === a ? ' is-saving' : ''}`}
                disabled={!!saving} onClick={() => choose(a)}
              >
                {a}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ClaimForm({ onSwitchToLogin }) {
  const { claim, toast, refresh } = useSession();
  const [f, setF] = useState({ username: '', email: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const upd = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    const v = validateClaim(f);
    if (v) return setError(v);
    setBusy(true); setError(null);
    try {
      await claim({ username: f.username.trim(), email: f.email.trim(), password: f.password });
      toast({ kind: 'success', icon: '🎉', title: 'Account claimed!', body: 'Your progress is now saved to your account.' });
    } catch (err) {
      setError(err.message);
      // The account may already be claimed (e.g. the follow-up achievement call failed): resync the session.
      refresh?.().catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="stack pf-form" onSubmit={submit} noValidate>
      <div>
        <h2>Claim your account</h2>
        <p className="muted small">Keep your XP, streak and achievements, and sign in on any device. Your current progress comes with you.</p>
      </div>
      {error && <div className="alert error" role="alert">{error}</div>}
      <label className="field">Username
        <input className="input" value={f.username} onChange={upd('username')} autoComplete="username"
          placeholder="3–20 letters, numbers or _" maxLength={20} required />
      </label>
      <label className="field">Email
        <input className="input" type="email" value={f.email} onChange={upd('email')} autoComplete="email" placeholder="you@example.com" required />
      </label>
      <div className="pf-field">
        <label htmlFor="pf-claim-pw">Password</label>
        <span className="pf-pw">
          <input id="pf-claim-pw" className="input" type={showPw ? 'text' : 'password'} value={f.password} onChange={upd('password')}
            autoComplete="new-password" placeholder="At least 8 characters" minLength={8} required />
          <button type="button" className="btn ghost small pf-pw-toggle" onClick={() => setShowPw((s) => !s)}
            aria-pressed={showPw}>{showPw ? 'Hide' : 'Show'}</button>
        </span>
      </div>
      <button className="btn block" disabled={busy}>{busy ? 'Claiming…' : '🔐 Claim account'}</button>
      <p className="small muted center pf-switch">
        Already have an account? <button type="button" className="pf-linkbtn" onClick={onSwitchToLogin}>Log in</button>
      </p>
    </form>
  );
}

function LoginForm({ isGuest, onCancel }) {
  const { login, toast } = useSession();
  const [f, setF] = useState({ login: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const upd = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!f.login.trim() || !f.password) return setError('Enter your username or email and password');
    setBusy(true); setError(null);
    try {
      const p = await login(f.login.trim(), f.password);
      toast({ kind: 'success', icon: p.user.avatar, title: `Welcome back, ${p.user.username}!` });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <form className="stack pf-form" onSubmit={submit} noValidate>
      <div>
        <h2>Log in</h2>
        {isGuest && (
          <p className="muted small">Signing in switches to your saved account. Progress from this guest session won’t carry over — claim it instead if you want to keep it.</p>
        )}
      </div>
      {error && <div className="alert error" role="alert">{error}</div>}
      <label className="field">Username or email
        <input className="input" value={f.login} onChange={upd('login')} autoComplete="username" required />
      </label>
      <label className="field">Password
        <input className="input" type="password" value={f.password} onChange={upd('password')} autoComplete="current-password" required />
      </label>
      <button className="btn block" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
      {onCancel && (
        <p className="small muted center pf-switch">
          New here? <button type="button" className="pf-linkbtn" onClick={onCancel}>Claim this account instead</button>
        </p>
      )}
    </form>
  );
}

function Account({ profile }) {
  const { logout, toast } = useSession();
  const isGuest = profile.user.is_guest;
  const [mode, setMode] = useState(isGuest ? 'claim' : 'account');
  const [busy, setBusy] = useState(false);
  const wantLogin = useRef(false);

  // Session changed (claimed, logged in, logged out) → reset the panel.
  useEffect(() => {
    setMode(isGuest ? (wantLogin.current ? 'login' : 'claim') : 'account');
    wantLogin.current = false;
  }, [isGuest, profile.user.id]);

  const doLogout = async (thenLogin) => {
    setBusy(true);
    wantLogin.current = thenLogin;
    try {
      await logout();
      toast({ kind: 'info', icon: '👋', title: 'Logged out', body: thenLogin ? 'Log in with another account below.' : 'You’re playing as a new guest.' });
    } catch (e) {
      wantLogin.current = false;
      toast({ kind: 'error', icon: '⚠️', title: 'Could not log out', body: e.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id="account" className="card pf-account" aria-label="Account">
      {mode === 'claim' && <ClaimForm onSwitchToLogin={() => setMode('login')} />}
      {mode === 'login' && <LoginForm isGuest={isGuest} onCancel={isGuest ? () => setMode('claim') : null} />}
      {mode === 'account' && (
        <div className="stack">
          <div>
            <h2>Account</h2>
            <p className="muted small">Signed in as <strong>{profile.user.username}</strong>{profile.user.email ? ` · ${profile.user.email}` : ''}</p>
          </div>
          <div className="row">
            <button type="button" className="btn secondary" disabled={busy} onClick={() => doLogout(true)}>Switch account</button>
            <button type="button" className="btn danger" disabled={busy} onClick={() => doLogout(false)}>Log out</button>
          </div>
        </div>
      )}
    </section>
  );
}

export default function Profile() {
  const { profile } = useSession() || {};
  const { hash } = useLocation();
  const [picker, setPicker] = useState(false);
  const [achFilter, setAchFilter] = useState('all');

  useEffect(() => {
    if (profile && hash === '#account') {
      const el = document.getElementById('account');
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      el?.querySelector('input')?.focus({ preventScroll: true });
    }
  }, [hash, !!profile]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!profile) {
    return (
      <div className="container pf-page" aria-busy="true">
        <div className="card pf-skel" style={{ height: 220 }} />
        <div className="card pf-skel" style={{ height: 300 }} />
      </div>
    );
  }

  const { user, level, levelXp, streak, stats = [], achievements = [] } = profile;
  const pct = levelPercent(levelXp);
  const unlocked = achievements.filter((a) => a.unlockedAt).length;
  const shownAch = achievements.filter((a) => achFilter === 'all' || (achFilter === 'unlocked' ? a.unlockedAt : !a.unlockedAt));
  const byGame = Object.fromEntries(stats.map((s) => [s.game, s]));
  const totalPlays = stats.reduce((n, s) => n + s.plays, 0);
  const totalWins = stats.reduce((n, s) => n + s.wins, 0);

  return (
    <div className="container pf-page">
      <section className="card pf-hero pop" aria-labelledby="pf-name">
        <button type="button" className="pf-avatar" onClick={() => setPicker(true)} aria-label="Change avatar">
          <span aria-hidden="true">{user.avatar}</span>
          <span className="pf-avatar-edit" aria-hidden="true">✎</span>
        </button>
        <div className="pf-hero-main">
          <div className="row pf-name-row">
            <h1 id="pf-name">{user.username}</h1>
            {user.is_guest ? <span className="badge">Guest</span> : <span className="badge done">✓ Registered</span>}
          </div>
          <p className="muted small pf-joined">Playing since {dateFmt(user.created_at)}</p>
          <div className="pf-level">
            <span className="pf-level-badge">Lv {level}</span>
            <div className="pf-level-bar">
              <div className="progress" role="progressbar" aria-label="Level progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
                <span style={{ width: `${pct}%` }} />
              </div>
              <span className="small muted mono">{formatNumber(levelXp.current)} / {formatNumber(levelXp.needed)} XP to level {level + 1}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="pf-kpis" aria-label="Totals">
        <div className="card pf-kpi"><span className="pf-kpi-icon" aria-hidden="true">✨</span><strong>{formatNumber(user.xp, true)}</strong><span className="muted small">Total XP</span></div>
        <div className="card pf-kpi"><span className="pf-kpi-icon" aria-hidden="true">🔥</span><strong>{streak.current}</strong><span className="muted small">Streak · best {streak.best}</span></div>
        <div className="card pf-kpi"><span className="pf-kpi-icon" aria-hidden="true">🪙</span><strong>{formatNumber(user.coins, true)}</strong><span className="muted small">Coins</span></div>
        <div className="card pf-kpi"><span className="pf-kpi-icon" aria-hidden="true">🎮</span><strong>{formatNumber(totalPlays)}</strong><span className="muted small">Games · {totalWins} wins</span></div>
      </section>

      <section className="card pf-stats" aria-labelledby="pf-stats-h">
        <h2 id="pf-stats-h">Stats by game</h2>
        <div className="pf-table" role="table" aria-label="Stats by game">
          <div className="pf-tr pf-th" role="row">
            <span role="columnheader">Game</span>
            <span role="columnheader">Plays</span>
            <span role="columnheader">Wins</span>
            <span role="columnheader">Win %</span>
            <span role="columnheader">Best</span>
          </div>
          {/* Travel games appear once played, so the table stays short for everyone else. */}
          {Object.entries(GAME_INFO).filter(([g]) => !g.startsWith('travel_') || byGame[g]).map(([g, info]) => {
            const s = byGame[g];
            return (
              <div key={g} className={`pf-tr${s ? '' : ' is-empty'}`} role="row">
                <span role="cell" className="pf-game">
                  <span aria-hidden="true">{info.icon}</span>
                  <Link to={info.to}>{info.name}</Link>
                </span>
                <span role="cell" className="mono">{s ? s.plays : '—'}</span>
                <span role="cell" className="mono">{s ? s.wins : '—'}</span>
                <span role="cell" className="mono">{winRate(s)}</span>
                <span role="cell" className="mono pf-best">{s?.best != null ? formatNumber(s.best) : '—'}</span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="card pf-ach" aria-labelledby="pf-ach-h">
        <div className="spread">
          <div>
            <h2 id="pf-ach-h">Achievements</h2>
            <p className="muted small pf-ach-count">{unlocked} of {achievements.length} unlocked</p>
          </div>
          <div className="pf-seg" role="group" aria-label="Filter achievements">
            {['all', 'unlocked', 'locked'].map((k) => (
              <button key={k} type="button" aria-pressed={achFilter === k}
                className={`pf-seg-btn${achFilter === k ? ' is-active' : ''}`} onClick={() => setAchFilter(k)}>
                {k[0].toUpperCase() + k.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="progress"><span style={{ width: `${achievements.length ? (unlocked / achievements.length) * 100 : 0}%` }} /></div>
        {shownAch.length ? (
          <ul className="pf-ach-grid">
            {shownAch.map((a) => (
              <li key={a.code} className={`pf-badge${a.unlockedAt ? ' is-unlocked' : ' is-locked'}`}>
                <span className="pf-badge-icon" aria-hidden="true">{a.unlockedAt ? a.icon : '🔒'}</span>
                <strong>{a.title}</strong>
                <span className="muted small">{a.desc}</span>
                {a.unlockedAt
                  ? <span className="pf-badge-date small">Unlocked {dateFmt(a.unlockedAt)}</span>
                  : <span className="pf-badge-date small muted">Locked</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted center">{achFilter === 'unlocked' ? 'Nothing unlocked yet — finish a game to earn your first badge!' : 'All unlocked. Impressive!'}</p>
        )}
      </section>

      <Account profile={profile} />

      {picker && <AvatarPicker current={user.avatar} onClose={() => setPicker(false)} />}
    </div>
  );
}
