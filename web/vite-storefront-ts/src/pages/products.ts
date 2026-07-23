import type { PageContext } from '../context';
import { maybe } from '../helpers';
import { loadProducts } from '../store';
import { productCard, wireAddButtons } from '../components';

export async function renderProducts(ctx: PageContext): Promise<void> {
  ctx.outlet.innerHTML = `
    <section class="page">
      <div class="page-head">
        <h1>Shop all</h1>
        <p class="muted">Everything Nimbus makes. Prices in USD.</p>
      </div>
      <div id="catalog-grid" class="grid"><p class="muted">Loading products…</p></div>
    </section>
  `;
  try {
    const products = await loadProducts();
    const grid = maybe('#catalog-grid', ctx.outlet);
    if (grid) grid.innerHTML = products.map(productCard).join('');
    wireAddButtons(ctx.outlet);
  } catch {
    const grid = maybe('#catalog-grid', ctx.outlet);
    if (grid) {
      grid.innerHTML = `<p class="error">Couldn't load the catalog. Is the app's /api running?</p>`;
    }
  }
}
