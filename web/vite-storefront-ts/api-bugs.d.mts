// Types for the plain-Node `api-bugs.mjs`, so `vite.config.ts` (which imports
// it for the dev middleware) type-checks. The .mjs itself stays dependency-free
// JavaScript because serve.mjs runs it under bare `node` with no build step.
import type { IncomingMessage, ServerResponse } from 'node:http';

export interface Product {
  id: string;
  name: string;
  price: number;
  blurb: string;
  emoji: string;
}

export const PRODUCTS: Product[];

/** Handle an `/api/*` request. Returns true when handled. */
export function handleApi(req: IncomingMessage, res: ServerResponse): boolean;
