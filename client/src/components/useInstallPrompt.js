import { useCallback, useEffect, useState } from 'react';

// The browser fires `beforeinstallprompt` once, possibly before React mounts — capture it at module load.
let deferred = null;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn(deferred));

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    notify();
  });
  window.addEventListener('appinstalled', () => { deferred = null; notify(); });
}

/** { canInstall, install() } — install() resolves to true when the user accepted. */
export function useInstallPrompt() {
  const [evt, setEvt] = useState(deferred);
  useEffect(() => {
    listeners.add(setEvt);
    return () => listeners.delete(setEvt);
  }, []);
  const install = useCallback(async () => {
    if (!deferred) return false;
    const e = deferred;
    deferred = null;
    notify();
    try {
      await e.prompt();
      const choice = await e.userChoice;
      return choice?.outcome === 'accepted';
    } catch {
      return false; // prompt() can reject (already shown, not allowed): never leak an unhandled rejection
    }
  }, []);
  return { canInstall: !!evt, install };
}
