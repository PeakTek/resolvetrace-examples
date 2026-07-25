import type { PageContext } from '../context';
import { $, esc, money } from '../helpers';
import { cartLines, cartTotal, clearCart } from '../store';

export function renderCheckout(ctx: PageContext): void {
  const total = cartTotal();
  const lines = cartLines();
  const itemCount = lines.reduce((n, l) => n + l.qty, 0);
  const note = itemCount
    ? `${itemCount} item${itemCount === 1 ? '' : 's'} · ${money(total)}`
    : 'Your cart is empty — but this is a demo, so you can still try to pay.';

  ctx.outlet.innerHTML = `
    <section class="page checkout">
      <h1>Checkout</h1>
      <p class="muted">${esc(note)}</p>
      <form id="pay-form" class="form" novalidate>
        <label>Full name
          <input name="name" autocomplete="name" placeholder="Ada Lovelace" />
        </label>
        <label>Email
          <input name="email" type="email" autocomplete="email" placeholder="ada@example.com" />
        </label>
        <label>Card number
          <input name="card" inputmode="numeric" autocomplete="cc-number" placeholder="4242 4242 4242 4242" />
        </label>
        <div class="form-row">
          <label>Expiry
            <input name="exp" autocomplete="cc-exp" placeholder="12/29" />
          </label>
          <label>CVC
            <input name="cvc" inputmode="numeric" autocomplete="cc-csc" placeholder="123" />
          </label>
        </div>
        <button class="btn primary block" id="pay" type="submit">Pay ${money(total)}</button>
        <p class="hint">
          These card fields are <strong>masked in session replay</strong> — the
          SDK masks all inputs before anything leaves the browser, so a support
          agent watching the replay never sees them.
        </p>
      </form>
      <div id="pay-result"></div>
    </section>
  `;

  const form = $<HTMLFormElement>('#pay-form', ctx.outlet);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const btn = $<HTMLButtonElement>('#pay', ctx.outlet);
    const result = $('#pay-result', ctx.outlet);
    btn.disabled = true;
    btn.textContent = 'Processing…';
    result.innerHTML = '';
    try {
      // BUG → error.api. POST /api/checkout always returns 500. The SDK's fetch
      // wrapper records the error.api breadcrumb automatically.
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          total,
          items: lines.map((l) => ({ id: l.product.id, qty: l.qty })),
        }),
      });
      if (!res.ok) {
        showFailure(result, res.status);
        return;
      }
      clearCart();
      result.innerHTML = `<div class="ok">Payment complete 🎉</div>`;
    } catch {
      showFailure(result, 0);
    } finally {
      btn.disabled = false;
      btn.textContent = `Pay ${money(total)}`;
    }
  });
}

function showFailure(result: HTMLElement, status: number): void {
  const detail = status ? `HTTP ${status}` : 'network error';
  result.innerHTML = `
    <div class="fail">
      <p>
        <strong>Payment failed (${esc(detail)}).</strong> The payment gateway
        returned an error. This was captured automatically as an
        <code>error.api</code> breadcrumb — no code in this page reports it.
      </p>
    </div>`;
}
