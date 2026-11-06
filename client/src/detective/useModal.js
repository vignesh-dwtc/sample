import { useEffect, useRef } from 'react';

/** Escape to close, focus the dialog on open, trap Tab inside, restore focus on close. */
export function useModal(onClose) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const prev = document.activeElement;
    const node = ref.current;
    const focusables = () => [...node.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), textarea, [tabindex]:not([tabindex="-1"])')];
    (node.querySelector('[data-autofocus]') || focusables()[0] || node).focus();
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); closeRef.current?.(); }
      if (e.key === 'Tab') {
        const f = focusables();
        if (!f.length) return;
        const first = f[0]; const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, []);
  return ref;
}
