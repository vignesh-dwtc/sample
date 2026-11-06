import { Link, NavLink, useLocation } from 'react-router-dom';
import { useSession } from '../lib/session.jsx';
import Logo from './Logo.jsx';
import { IconPlay, IconParty, IconDetective, IconTrophy, IconUser } from './Icons.jsx';

const LINKS = [
  { to: '/', label: 'Play', Icon: IconPlay, match: (p) => p === '/' || p.startsWith('/play') },
  { to: '/party', label: 'Party', Icon: IconParty, match: (p) => p.startsWith('/party') },
  { to: '/detective', label: 'Detective', Icon: IconDetective, match: (p) => p.startsWith('/detective') },
  { to: '/leaderboard', label: 'Leaderboard', short: 'Ranks', Icon: IconTrophy, match: (p) => p.startsWith('/leaderboard') },
];

function useActive() {
  const { pathname } = useLocation();
  return (link) => link.match(pathname);
}

/** Avatar + level + streak chip linking to the profile. */
export function ProfileChip() {
  const { profile } = useSession() || {};
  if (!profile) {
    return <span className="pn-chip is-loading" aria-label="Loading profile"><span className="pn-chip-avatar" /></span>;
  }
  const { user, level, streak } = profile;
  const hot = streak?.current > 0;
  return (
    <Link to="/profile" className="pn-chip" aria-label={`${user.username}, level ${level}, ${streak?.current || 0}-day streak. Open profile`}>
      <span className="pn-chip-avatar" aria-hidden="true">{user.avatar}</span>
      <span className="pn-chip-meta">
        <span className="pn-chip-name">{user.username}</span>
        <span className="pn-chip-stats">
          <span className="pn-chip-level">Lv {level}</span>
          <span className={`pn-chip-streak${hot ? ' is-hot' : ''}${hot && !streak.playedToday ? ' is-risk' : ''}`}>
            🔥 {streak?.current || 0}
          </span>
        </span>
      </span>
    </Link>
  );
}

export function TopNav() {
  const isActive = useActive();
  return (
    <header className="pn-topbar">
      <div className="pn-topbar-inner">
        <Link to="/" className="pn-brand" aria-label="PlayNest home"><Logo size={34} /></Link>
        <nav className="pn-links" aria-label="Main">
          {LINKS.map((l) => (
            <NavLink
              key={l.to} to={l.to}
              className={() => `pn-link${isActive(l) ? ' is-active' : ''}`}
              aria-current={isActive(l) ? 'page' : undefined}
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
        <ProfileChip />
      </div>
    </header>
  );
}

/** Bottom tab bar (mobile only, hidden on wide screens via CSS). */
export function TabBar() {
  const isActive = useActive();
  const { profile } = useSession() || {};
  const { pathname } = useLocation();
  const meActive = pathname.startsWith('/profile');
  return (
    <nav className="pn-tabbar" aria-label="Tabs">
      {LINKS.map((l) => (
        <NavLink
          key={l.to} to={l.to}
          className={() => `pn-tab${isActive(l) ? ' is-active' : ''}`}
          aria-current={isActive(l) ? 'page' : undefined}
        >
          <l.Icon />
          <span>{l.short || l.label}</span>
        </NavLink>
      ))}
      <NavLink to="/profile" className={() => `pn-tab${meActive ? ' is-active' : ''}`} aria-current={meActive ? 'page' : undefined}>
        {profile ? <span className="pn-tab-avatar" aria-hidden="true">{profile.user.avatar}</span> : <IconUser />}
        <span>Me</span>
      </NavLink>
    </nav>
  );
}
