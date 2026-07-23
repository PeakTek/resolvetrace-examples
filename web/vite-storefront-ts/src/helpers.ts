/** Tiny DOM + formatting helpers (no framework). */

/** Query one element, throwing if missing (keeps call sites null-safe). */
export function $<T extends HTMLElement = HTMLElement>(
  selector: string,
  root: ParentNode = document,
): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`Missing element: ${selector}`);
  return el;
}

/** Query one element, or null. */
export function maybe<T extends HTMLElement = HTMLElement>(
  selector: string,
  root: ParentNode = document,
): T | null {
  return root.querySelector<T>(selector);
}

/** Escape a string for safe interpolation into innerHTML. */
export function esc(value: unknown): string {
  return String(value).replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;'
    : c === '<' ? '&lt;'
    : c === '>' ? '&gt;'
    : c === '"' ? '&quot;'
    : '&#39;',
  );
}

/** Format a whole-dollar amount. */
export function money(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

/** Show a transient toast in the corner. */
export function toast(message: string): void {
  let host = document.getElementById('toast-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toast-host';
    host.className = 'toast-host';
    document.body.appendChild(host);
  }
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  host.appendChild(el);
  window.setTimeout(() => el.classList.add('leaving'), 2200);
  window.setTimeout(() => el.remove(), 2600);
}
