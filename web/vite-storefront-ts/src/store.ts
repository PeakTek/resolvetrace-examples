/**
 * Storefront state: the catalog (fetched once from the app's own `/api`) and an
 * in-memory cart. Because this is an SPA the cart lives for the life of the tab
 * — no reload wipes it mid-session, which is also what keeps session replay a
 * single continuous recording.
 */

export interface Product {
  id: string;
  name: string;
  price: number;
  blurb: string;
  emoji: string;
}

export interface CartLine {
  product: Product;
  qty: number;
}

let catalog: Product[] | null = null;
const cart = new Map<string, CartLine>();
const cartListeners = new Set<(count: number) => void>();

/**
 * Load the catalog from `GET /api/products`. This is the ONE app API call that
 * succeeds — the SDK records it as a `perf.api_latency` breadcrumb, so the demo
 * shows healthy calls alongside the broken ones.
 */
export async function loadProducts(): Promise<Product[]> {
  if (catalog) return catalog;
  const res = await fetch('/api/products');
  if (!res.ok) throw new Error(`GET /api/products → ${res.status}`);
  const body = (await res.json()) as { products: Product[] };
  catalog = body.products;
  return catalog;
}

/** A product from the already-loaded catalog, or undefined. */
export function findProduct(id: string): Product | undefined {
  return catalog?.find((p) => p.id === id);
}

export function addToCart(product: Product): void {
  const line = cart.get(product.id);
  if (line) line.qty += 1;
  else cart.set(product.id, { product, qty: 1 });
  emitCart();
}

export function setQty(productId: string, qty: number): void {
  const line = cart.get(productId);
  if (!line) return;
  if (qty <= 0) cart.delete(productId);
  else line.qty = qty;
  emitCart();
}

export function cartLines(): CartLine[] {
  return [...cart.values()];
}

export function cartCount(): number {
  return cartLines().reduce((n, l) => n + l.qty, 0);
}

export function cartTotal(): number {
  return cartLines().reduce((n, l) => n + l.qty * l.product.price, 0);
}

export function clearCart(): void {
  cart.clear();
  emitCart();
}

/** Subscribe to cart-count changes; fires immediately with the current count. */
export function onCartChange(fn: (count: number) => void): void {
  cartListeners.add(fn);
  fn(cartCount());
}

function emitCart(): void {
  for (const fn of cartListeners) fn(cartCount());
}
