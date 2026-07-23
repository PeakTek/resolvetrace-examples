/**
 * A ~50-line History-API router. This is the load-bearing choice for the demo:
 * navigating between routes swaps the outlet's contents WITHOUT a full page
 * reload, so the SDK's session (and its rrweb replay recording) stay alive in
 * one JS context across "pages". That is what lets session replay reconstruct
 * the navigation as one continuous recording. A classic multi-page app (a real
 * navigation per page) would reset the replay chunk sequence on every load and
 * the recordings would collide — so we route on the client.
 */

export type RouteParams = Record<string, string>;
export type PageRender = (params: RouteParams) => void | Promise<void>;

interface Route {
  pattern: RegExp;
  keys: string[];
  render: PageRender;
}

const routes: Route[] = [];
const navListeners = new Set<(path: string) => void>();
let notFound: PageRender = () => {};
let outletEl: HTMLElement | null = null;

function compile(path: string): { pattern: RegExp; keys: string[] } {
  const keys: string[] = [];
  const source = path.replace(/:[^/]+/g, (match) => {
    keys.push(match.slice(1));
    return '([^/]+)';
  });
  return { pattern: new RegExp(`^${source}$`), keys };
}

export function route(path: string, render: PageRender): void {
  const { pattern, keys } = compile(path);
  routes.push({ pattern, keys, render });
}

export function setNotFound(render: PageRender): void {
  notFound = render;
}

/** Fires on every navigation (including the initial load) with the pathname. */
export function onNavigate(fn: (path: string) => void): void {
  navListeners.add(fn);
}

export function navigate(to: string): void {
  if (to !== location.pathname + location.search) {
    history.pushState({}, '', to);
  }
  void renderPath(to.split('?')[0] ?? '/');
}

export function startRouter(outlet: HTMLElement): void {
  outletEl = outlet;
  document.addEventListener('click', onLinkClick);
  window.addEventListener('popstate', () => void renderPath(location.pathname));
  void renderPath(location.pathname);
}

function onLinkClick(event: MouseEvent): void {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return;
  }
  const target = event.target as HTMLElement | null;
  const link = target?.closest('a[data-link]') as HTMLAnchorElement | null;
  const href = link?.getAttribute('href');
  if (!href || !href.startsWith('/')) return;
  event.preventDefault();
  navigate(href);
}

async function renderPath(path: string): Promise<void> {
  if (!outletEl) return;
  for (const fn of navListeners) fn(path);
  for (const r of routes) {
    const match = r.pattern.exec(path);
    if (!match) continue;
    const params: RouteParams = {};
    r.keys.forEach((key, i) => {
      params[key] = decodeURIComponent(match[i + 1] ?? '');
    });
    window.scrollTo(0, 0);
    await r.render(params);
    return;
  }
  await notFound({});
}
