import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, getToken, setToken } from './api.js';

const SessionCtx = createContext(null);

/**
 * Provides { user, profile, refresh, login, claim, logout, celebrate, toasts }.
 * - Auto-creates a guest account on first visit (zero-friction play).
 * - celebrate(progressResult) shows XP / level-up / streak / achievement toasts and refreshes the profile.
 *   Every game should call it with the `progress` object returned by the server.
 */
export function SessionProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [toasts, setToasts] = useState([]);
  const liveToasts = useRef(0);

  const refresh = useCallback(async () => {
    const p = await api('/profile');
    setProfile(p);
    setUser(p.user);
    return p;
  }, []);

  useEffect(() => {
    (async () => {
      try {
        if (getToken()) return await refresh();
      } catch { setToken(null); }
      const { token } = await api('/auth/guest', { method: 'POST' });
      setToken(token);
      await refresh();
    })().catch((e) => console.error(e));
  }, [refresh]);

  const toast = useCallback((t) => {
    const id = Math.random().toString(36).slice(2);
    // Layout shows at most 4 at once; toasts queued behind that get extra time so they are seen.
    const queued = Math.max(0, liveToasts.current - 3);
    liveToasts.current += 1;
    setToasts((ts) => [...ts, { id, ...t }]);
    setTimeout(() => {
      liveToasts.current -= 1;
      setToasts((ts) => ts.filter((x) => x.id !== id));
    }, (t.duration || 4000) + queued * 1500);
  }, []);

  const celebrate = useCallback((progress) => {
    if (!progress) return;
    if (progress.xpGained) toast({ kind: 'xp', icon: '✨', title: `+${progress.xpGained} XP`, body: `+${progress.coinsGained} coins` });
    if (progress.streak?.extended) toast({ kind: 'streak', icon: '🔥', title: `${progress.streak.current}-day streak!`, body: 'Come back tomorrow to keep it going' });
    if (progress.levelUp) toast({ kind: 'level', icon: '⬆️', title: `Level ${progress.level}!`, body: 'You leveled up', duration: 5000 });
    for (const a of progress.achievements || []) toast({ kind: 'achievement', icon: a.icon, title: a.title, body: a.desc, duration: 5000 });
    refresh().catch(() => {});
  }, [toast, refresh]);

  const login = useCallback(async (login, password) => {
    const { token } = await api('/auth/login', { method: 'POST', body: { login, password } });
    setToken(token);
    return refresh();
  }, [refresh]);

  const claim = useCallback(async (fields) => {
    const { token } = await api('/auth/claim', { method: 'POST', body: fields });
    setToken(token);
    const { achievements } = await api('/profile/registered', { method: 'POST' });
    celebrate({ achievements });
    return refresh();
  }, [refresh, celebrate]);

  const logout = useCallback(async () => {
    setToken(null);
    const { token } = await api('/auth/guest', { method: 'POST' });
    setToken(token);
    return refresh();
  }, [refresh]);

  const value = useMemo(() => ({ user, profile, refresh, login, claim, logout, celebrate, toast, toasts }),
    [user, profile, refresh, login, claim, logout, celebrate, toast, toasts]);
  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}

export const useSession = () => useContext(SessionCtx);
