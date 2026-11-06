// Share helpers for result panels: native share sheet when available, clipboard otherwise.

export const siteUrl = () => (typeof location !== 'undefined' ? location.origin : 'https://playnest.app');

/**
 * Share `text`. Uses navigator.share when present, otherwise copies to the clipboard
 * and reports via `toast` (from useSession()). Resolves to 'shared' | 'copied' | 'cancelled' | 'failed'.
 */
export async function shareResult(text, toast) {
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ text });
      return 'shared';
    } catch (e) {
      if (e?.name === 'AbortError') return 'cancelled';
      // fall through to clipboard (e.g. share not permitted in this context)
    }
  }
  const ok = await copyText(text);
  toast?.(ok
    ? { kind: 'info', icon: '📋', title: 'Copied to clipboard', body: 'Paste it anywhere to share your result' }
    : { kind: 'error', icon: '⚠️', title: 'Could not copy', body: 'Your browser blocked clipboard access' });
  return ok ? 'copied' : 'failed';
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
