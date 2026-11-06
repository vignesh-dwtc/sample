import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { useSession } from '../lib/session.jsx';

/**
 * Loads GET /api<path> once the session (guest token) exists.
 * Returns { data, setData, error, loading, reload }.
 */
export function useDailyGame(path) {
  const { user } = useSession() || {};
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);

  const reload = useCallback(async () => {
    const my = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const d = await api(path);
      if (my === seq.current) setData(d);
    } catch (e) {
      if (my === seq.current) setError(e.message || 'Could not load the puzzle');
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, [path]);

  const userId = user?.id;
  useEffect(() => { if (userId) reload(); }, [userId, reload]);

  return { data, setData, error, loading: loading || !userId, reload };
}
