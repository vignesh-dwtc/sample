import { useEffect, useRef, useState } from 'react';
import { useSession } from '../lib/session.jsx';
import { IconClose } from './Icons.jsx';

const EXIT_MS = 260;
const MAX_VISIBLE = 4;
const MAX_VISIBLE_PHONE = 2; // matches the 760px breakpoint in Layout.css
const phoneQuery = '(max-width: 760px)';
const KINDS = new Set(['xp', 'streak', 'level', 'achievement', 'error', 'success', 'info']);

// Oldest first: a burst (XP, streak, achievements) queues behind the cap instead of
// pushing the first and most important toast (+XP) off screen before it is seen.
function visible(items, max) {
  let shown = 0;
  return items.filter((t) => t.leaving || shown++ < max);
}

function useIsPhone() {
  const query = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(phoneQuery) : null);
  const [phone, setPhone] = useState(() => !!query()?.matches);
  useEffect(() => {
    const mq = query();
    if (!mq) return undefined;
    const on = () => setPhone(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return phone;
}

/**
 * Animated toast stack rendered from useSession().toasts.
 * Toasts that leave the session list are kept briefly with an exit animation.
 * Top-right on desktop, top-center on mobile (see Layout.css).
 */
export default function Toasts() {
  const { toasts = [] } = useSession() || {};
  const [items, setItems] = useState([]); // [{...toast, leaving}]
  const [dismissed, setDismissed] = useState(() => new Set());
  const timers = useRef(new Map());
  const phone = useIsPhone();

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
        {visible(items, phone ? MAX_VISIBLE_PHONE : MAX_VISIBLE).map((t) => {
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
