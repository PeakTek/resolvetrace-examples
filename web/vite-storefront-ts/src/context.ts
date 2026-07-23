import type { ResolveTraceClient } from '@peaktek/resolvetrace-sdk';

/** Everything a page render needs, handed to it by main.ts. */
export interface PageContext {
  /** The single SDK client for the whole app. */
  rt: ResolveTraceClient;
  /** The route outlet element pages render into. */
  outlet: HTMLElement;
  /** Programmatic client-side navigation (no full page reload). */
  navigate: (to: string) => void;
}
