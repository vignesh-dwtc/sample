import { Link, NavLink, useLocation } from 'react-router-dom';
import { useSession } from '../lib/session.jsx';
import Logo from './Logo.jsx';
import { IconPlay, IconParty, IconDetective, IconTrophy, IconUser, IconTravel, IconArcade, IconSoundOn, IconSoundOff } from './Icons.jsx';
import { setMuted, sound, useMuted } from '../fx/index.js';

const LINKS = [
  { to: '/', label: 'Play', Icon: IconPlay, match: (p) => p === '/' || p.startsWith('/play') },
  { to: '/arcade', label: 'Arcade', Icon: IconArcade, match: (p) => p.startsWith('/arcade'), isNew: true },
  // Party leaves the phone tab bar for Arcade: rooms are mostly joined from a shared link or code,
  // and Home keeps the join-code box + host buttons. Party stays in the desktop nav and footer.
  { to: '/party', label: 'Party', Icon: IconParty, match: (p) => p.startsWith('/party'), tab: false },
  { to: '/travel', label: 'Travel', Icon: IconTravel, match: (p) => p.startsWith('/travel') },
  // Detective stays in the desktop nav, Home and the footer; the phone tab bar keeps 5 tabs.
  { to: '/detective', label: 'Detective', Icon: IconDetective, match: (p) => p.startsWith('/detective'), tab: false },
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

/** Sound on/off (persisted by the FX toolkit). */
export function MuteToggle() {
  const muted = useMuted();
  const toggle = () => {
    setMuted(!muted);
    if (muted) sound('coin'); // just unmuted: a tiny confirmation chirp
  };
  return (
    <button
      type="button" className="pn-mute" data-sfx="off" onClick={toggle}
      aria-pressed={!muted} aria-label="Sound effects"
      title={muted ? 'Sound off' : 'Sound on'}
    >
      {muted ? <IconSoundOff /> : <IconSoundOn />}
    </button>
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
              {l.isNew && <span className="pn-link-new" aria-label="new">NEW</span>}
            </NavLink>
          ))}
        </nav>
        <div className="pn-nav-right">
          <MuteToggle />
          <ProfileChip />
        </div>
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
      {LINKS.filter((l) => l.tab !== false).map((l) => (
        <NavLink
          key={l.to} to={l.to}
          className={() => `pn-tab${isActive(l) ? ' is-active' : ''}`}
          aria-current={isActive(l) ? 'page' : undefined}
        >
          <l.Icon />
          {l.isNew && !isActive(l) && <span className="pn-tab-new" aria-hidden="true" />}
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
