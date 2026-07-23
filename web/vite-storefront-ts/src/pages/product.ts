import type { PageContext } from '../context';
import type { RouteParams } from '../router';
import { $, esc, money, toast } from '../helpers';
import { loadProducts, findProduct, addToCart } from '../store';

export async function renderProduct(ctx: PageContext, params: RouteParams): Promise<void> {
  // Ensure the catalog is loaded so a deep link to /product/:id works.
  await loadProducts().catch(() => undefined);
  const product = findProduct(params.id);

  if (!product) {
    ctx.outlet.innerHTML = `
      <section class="page">
        <h1>Product not found</h1>
        <p class="muted">There is no product “${esc(params.id)}”.</p>
        <a class="btn" href="/products" data-link>← Back to shop</a>
      </section>`;
    return;
  }

  ctx.outlet.innerHTML = `
    <section class="page product">
      <a class="back" href="/products" data-link>← Shop</a>
      <div class="product-layout">
        <div class="product-media" aria-hidden="true">${esc(product.emoji)}</div>
        <div class="product-info">
          <h1>${esc(product.name)}</h1>
          <p class="price big">${money(product.price)}</p>
          <p class="blurb">${esc(product.blurb)}</p>
          <div class="product-actions">
            <button class="btn primary" id="add">Add to cart</button>
            <button class="btn ghost" id="wishlist">♡ Add to wishlist</button>
          </div>
          <div class="reviews">
            <button class="btn small" id="load-reviews">Load reviews</button>
            <div id="reviews-box" class="reviews-box"></div>
          </div>
        </div>
      </div>
    </section>
  `;

  $('#add', ctx.outlet).addEventListener('click', () => {
    addToCart(product);
    toast(`Added ${product.name} to cart`);
  });

  // BUG → error.js. Thrown synchronously inside a click handler: the browser
  // reports it to window.onerror, so the SDK auto-captures it — no try/catch,
  // no capture() call in this handler.
  $('#wishlist', ctx.outlet).addEventListener('click', () => {
    throw new Error('Wishlist service is unavailable (demo bug).');
  });

  // BUG → error.api. GET /api/products/:id/reviews returns 404. The SDK's fetch
  // wrapper records the error.api breadcrumb automatically; we only handle the
  // non-ok response to show a friendly message.
  $('#load-reviews', ctx.outlet).addEventListener('click', async () => {
    const box = $('#reviews-box', ctx.outlet);
    box.textContent = 'Loading reviews…';
    try {
      const res = await fetch(`/api/products/${encodeURIComponent(product.id)}/reviews`);
      if (!res.ok) {
        box.innerHTML = `<p class="error">Reviews are unavailable right now (HTTP ${res.status}).</p>`;
        return;
      }
      const data = (await res.json()) as { reviews: Array<{ text: string }> };
      box.innerHTML = data.reviews.map((r) => `<p>${esc(r.text)}</p>`).join('');
    } catch {
      box.innerHTML = `<p class="error">Couldn't reach the reviews service.</p>`;
    }
  });
}
