import { useEffect, useRef, useState } from 'react';
import { useSession } from '../lib/session.jsx';
import { IconClose } from './Icons.jsx';

const EXIT_MS = 260;
const MAX_VISIBLE = 4;
const KINDS = new Set(['xp', 'streak', 'level', 'achievement', 'error', 'success', 'info']);

/**
 * Animated toast stack rendered from useSession().toasts.
 * Toasts that leave the session list are kept briefly with an exit animation.
 * Top-right on desktop, top-center on mobile (see Layout.css).
 */
// Oldest first: a burst (XP, streak, achievements) queues behind the cap instead of
// pushing the first and most important toast (+XP) off screen before it is seen.
function visible(items) {
  let shown = 0;
  return items.filter((t) => t.leaving || shown++ < MAX_VISIBLE);
}

export default function Toasts() {
  const { toasts = [] } = useSession() || {};
  const [items, setItems] = useState([]); // [{...toast, leaving}]
  const [dismissed, setDismissed] = useState(() => new Set());
  const timers = useRef(new Map());

  useEffect(() => {
    const live = new Set(toasts.filter((t) => !dismissed.has(t.id)).map((t) => t.id));
    setItems((prev) => {
      const known = new Set(prev.map((t) => t.id));
      const next = prev.map((t) => (live.has(t.id) || t.leaving ? t : { ...t, leaving: true }));
      for (const t of toasts) if (!known.has(t.id) && live.has(t.id)) next.push({ ...t, leaving: false });
      return next;
    });
  }, [toasts, dismissed]);

  // Remove items after their exit animation.
  useEffect(() => {
    for (const t of items) {
      if (t.leaving && !timers.current.has(t.id)) {
        timers.current.set(t.id, setTimeout(() => {
          timers.current.delete(t.id);
          setItems((prev) => prev.filter((x) => x.id !== t.id));
        }, EXIT_MS));
      }
    }
  }, [items]);

  useEffect(() => () => { for (const id of timers.current.values()) clearTimeout(id); }, []);

  // Forget dismissed ids once the session has dropped them too.
  useEffect(() => {
    setDismissed((d) => {
      if (!d.size) return d;
      const ids = new Set(toasts.map((t) => t.id));
      const next = new Set([...d].filter((id) => ids.has(id)));
      return next.size === d.size ? d : next;
    });
  }, [toasts]);

  return (
    <div className="pn-toasts" role="region" aria-label="Notifications">
      <div aria-live="polite" aria-atomic="false" className="pn-toasts-inner">
        {visible(items).map((t) => {
          const kind = KINDS.has(t.kind) ? t.kind : 'info';
          return (
            <div key={t.id} className={`pn-toast pn-toast-${kind}${t.leaving ? ' is-leaving' : ''}`} role="status">
              {t.icon && <span className="pn-toast-icon" aria-hidden="true">{t.icon}</span>}
              <div className="pn-toast-text">
                {kind === 'achievement' && <span className="pn-toast-eyebrow">Achievement unlocked</span>}
                {t.title && <strong className="pn-toast-title">{t.title}</strong>}
                {t.body && <span className="pn-toast-body">{t.body}</span>}
              </div>
              <button
                type="button" className="pn-toast-close" aria-label="Dismiss notification"
                onClick={() => setDismissed((d) => new Set(d).add(t.id))}
              >
                <IconClose />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
