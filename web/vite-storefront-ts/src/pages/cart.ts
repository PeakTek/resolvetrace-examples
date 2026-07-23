import type { PageContext } from '../context';
import { esc, money } from '../helpers';
import { cartLines, cartTotal, setQty } from '../store';

export function renderCart(ctx: PageContext): void {
  const lines = cartLines();

  if (lines.length === 0) {
    ctx.outlet.innerHTML = `
      <section class="page">
        <h1>Your cart</h1>
        <div class="empty">
          <p>Your cart is empty.</p>
          <a class="btn primary" href="/products" data-link>Browse the catalog →</a>
        </div>
      </section>`;
    return;
  }

  ctx.outlet.innerHTML = `
    <section class="page">
      <h1>Your cart</h1>
      <div class="cart">
        ${lines
          .map(
            (l) => `
          <div class="cart-line">
            <span class="cart-emoji" aria-hidden="true">${esc(l.product.emoji)}</span>
            <span class="cart-name">
              <a href="/product/${esc(l.product.id)}" data-link>${esc(l.product.name)}</a>
            </span>
            <span class="cart-qty">
              <button class="qty" data-dec="${esc(l.product.id)}" aria-label="Decrease quantity">−</button>
              <span class="qty-value">${l.qty}</span>
              <button class="qty" data-inc="${esc(l.product.id)}" aria-label="Increase quantity">+</button>
            </span>
            <span class="cart-line-total">${money(l.qty * l.product.price)}</span>
          </div>`,
          )
          .join('')}
        <div class="cart-total"><span>Total</span><strong>${money(cartTotal())}</strong></div>
        <a class="btn primary block" href="/checkout" data-link>Proceed to checkout →</a>
      </div>
    </section>
  `;

  ctx.outlet.querySelectorAll<HTMLButtonElement>('button[data-inc]').forEach((btn) => {
    btn.addEventListener('click', () => {
      bump(btn.dataset.inc ?? '', +1);
      renderCart(ctx);
    });
  });
  ctx.outlet.querySelectorAll<HTMLButtonElement>('button[data-dec]').forEach((btn) => {
    btn.addEventListener('click', () => {
      bump(btn.dataset.dec ?? '', -1);
      renderCart(ctx);
    });
  });
}

function bump(productId: string, delta: number): void {
  const line = cartLines().find((l) => l.product.id === productId);
  if (!line) return;
  setQty(productId, line.qty + delta);
}
