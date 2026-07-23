import type { PageContext } from '../context';
import { $ } from '../helpers';

export function renderOrder(ctx: PageContext): void {
  ctx.outlet.innerHTML = `
    <section class="page">
      <h1>Order status</h1>
      <p class="muted">Track a recent order.</p>
      <form id="track-form" class="form inline" novalidate>
        <input name="order" placeholder="Order # (e.g. NB-10423)" autocomplete="off" />
        <button class="btn primary" id="track" type="submit">Track order</button>
      </form>
      <div id="track-result" class="track-result"></div>
    </section>
  `;

  const form = $<HTMLFormElement>('#track-form', ctx.outlet);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const input = $<HTMLInputElement>('input[name="order"]', ctx.outlet);
    const result = $('#track-result', ctx.outlet);
    result.textContent = 'Looking up your order…';
    // BUG → error.js (kind: unhandledrejection). trackOrder() rejects and
    // nothing catches it (`void` — no .catch, not awaited), so the rejected
    // promise becomes an unhandledrejection the SDK auto-captures.
    void trackOrder(input.value || 'unknown');
  });
}

async function trackOrder(orderId: string): Promise<void> {
  await new Promise<void>((_resolve, reject) => {
    window.setTimeout(
      () => reject(new Error(`Order lookup failed for “${orderId}” (demo bug).`)),
      300,
    );
  });
}
