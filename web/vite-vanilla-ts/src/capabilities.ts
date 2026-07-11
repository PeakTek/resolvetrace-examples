/**
 * Deployment capability probe.
 *
 * The demo runs against any ResolveTrace backend. Some features are only
 * available on managed (Platform / Enterprise) deployments — this probe asks
 * the backend which tier it is so the UI can activate those sections or show
 * them as availability teasers.
 *
 * `GET /api/capabilities` is a small, same-origin endpoint the *hosting
 * deployment* provides when the demo is served against ResolveTrace Platform.
 * A plain open-source deployment doesn't serve it. The probe therefore fails
 * **closed** to the OSS baseline on any non-JSON / error response, so the demo
 * never renders Platform features against a backend that can't honor them.
 */

export type Tier = 'oss' | 'platform' | 'enterprise';

export interface Capabilities {
  tier: Tier;
  /**
   * Backend supports + enforces consent-gated manual replay (a Platform
   * capability). The landing page badges it and the Platform page (`platform.ts`)
   * reads it to activate its controls — it does not change how the SDK works.
   */
  consent: boolean;
}

const OSS_BASELINE: Capabilities = { tier: 'oss', consent: false };

export async function probeCapabilities(): Promise<Capabilities> {
  try {
    const res = await fetch('/api/capabilities', {
      headers: { accept: 'application/json' },
    });
    if (!res.ok) return OSS_BASELINE;
    // A backend without this endpoint may SPA-fallback to index.html (200 HTML);
    // json() then throws and we fall through to the OSS baseline.
    const body = (await res.json()) as Partial<Capabilities>;
    const tier: Tier =
      body.tier === 'platform' || body.tier === 'enterprise'
        ? body.tier
        : 'oss';
    return { tier, consent: Boolean(body.consent) };
  } catch {
    return OSS_BASELINE;
  }
}
