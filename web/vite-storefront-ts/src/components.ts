/** Small shared view bits used by more than one page. */
import { esc, money, toast } from './helpers';
import { type Product, addToCart, findProduct } from './store';

export function productCard(p: Product): string {
  return `
    <article class="card">
      <a class="card-media" href="/product/${esc(p.id)}" data-link aria-label="${esc(p.name)}">
        <span>${esc(p.emoji)}</span>
      </a>
      <div class="card-body">
        <a class="card-title" href="/product/${esc(p.id)}" data-link>${esc(p.name)}</a>
        <p class="card-blurb">${esc(p.blurb)}</p>
        <div class="card-foot">
          <span class="price">${money(p.price)}</span>
          <button class="btn small" data-add="${esc(p.id)}">Add to cart</button>
        </div>
      </div>
    </article>`;
}

/** Wire every `[data-add]` button under `root` to add its product to the cart. */
export function wireAddButtons(root: HTMLElement): void {
  root.querySelectorAll<HTMLButtonElement>('button[data-add]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.add;
      const product = id ? findProduct(id) : undefined;
      if (!product) return;
      addToCart(product);
      toast(`Added ${product.name} to cart`);
    });
  });
}
