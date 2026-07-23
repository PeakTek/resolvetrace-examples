import type { PageContext } from '../context';
import { maybe } from '../helpers';
import { loadProducts } from '../store';
import { productCard, wireAddButtons } from '../components';

export async function renderHome(ctx: PageContext): Promise<void> {
  ctx.outlet.innerHTML = `
    <section class="hero">
      <div class="hero-copy">
        <p class="eyebrow">A deliberately buggy demo store</p>
        <h1>Gear that <em>mostly</em> works.</h1>
        <p class="lede">
          Browse, add to cart, and try to check out — things break on purpose.
          Every uncaught JS error, every failed API call, and your whole journey
          (as masked session replay) are captured by
          <code>@peaktek/resolvetrace-sdk</code>. There is no tracking code in
          any of these click handlers.
        </p>
        <div class="hero-cta">
          <a class="btn primary" href="/products" data-link>Shop the catalog →</a>
          <a class="btn ghost" href="/checkout" data-link>Skip to checkout</a>
        </div>
      </div>
      <div class="hero-art" aria-hidden="true">🛰️</div>
    </section>

    <section class="reco">
      <h2>Recommended for you</h2>
      <div id="reco-list" class="reco-list"><p class="muted">Personalizing…</p></div>
    </section>

    <section class="featured">
      <h2>Featured</h2>
      <div id="featured-grid" class="grid"><p class="muted">Loading products…</p></div>
    </section>
  `;

  // Featured products — the ONE app API call that succeeds (GET /api/products).
  // The SDK records it as a `perf.api_latency` breadcrumb: healthy traffic
  // shown next to the broken calls.
  try {
    const products = await loadProducts();
    const grid = maybe('#featured-grid', ctx.outlet);
    if (grid) grid.innerHTML = products.slice(0, 3).map(productCard).join('');
    wireAddButtons(ctx.outlet);
  } catch {
    const grid = maybe('#featured-grid', ctx.outlet);
    if (grid) grid.innerHTML = `<p class="error">Couldn't load products right now.</p>`;
  }

  // BUG → error.js. The "Recommended for you" widget assumes the personalization
  // service returned at least one item. It returned none, so reading `.title`
  // off `undefined` throws. Deferred with setTimeout so the page still renders
  // and the throw surfaces as an UNCAUGHT error — exactly what the SDK
  // auto-captures via window.onerror, no try/catch and no capture() call.
  window.setTimeout(() => renderRecommendations(ctx.outlet), 60);
}

function renderRecommendations(root: HTMLElement): void {
  const box = maybe('#reco-list', root);
  if (!box) return; // the user already navigated away — nothing to render into
  const recommendations: Array<{ id: string; title: string }> = [];
  const topPick = recommendations[0];
  // topPick is undefined → TypeError: Cannot read properties of undefined.
  box.textContent = `Your top pick: ${topPick.title}`;
}
