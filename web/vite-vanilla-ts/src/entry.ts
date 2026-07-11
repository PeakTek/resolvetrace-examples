/**
 * Landing page. Probes the deployment's capabilities and points the visitor at
 * the two feature surfaces — the OSS features page (works on any backend) and
 * the Platform features page (consent-gated replay + operator controls). The
 * card matching the detected backend is highlighted.
 */

import { probeCapabilities } from './capabilities';
import { $ } from './shared';

const caps = await probeCapabilities();

const badge = $('tier-badge');
const isPlatform = caps.tier === 'platform';
badge.textContent = isPlatform ? 'Platform' : 'OSS';
badge.className = `tier tier-${isPlatform ? 'platform' : 'oss'}`;

const endpointEl = document.getElementById('cfg-endpoint');
if (endpointEl) {
  endpointEl.textContent = String(window.__RT_CONFIG__?.endpoint ?? '—');
}

// Point at the surface that matches the backend and label Platform availability.
const availability = $('platform-availability');
if (caps.consent) {
  $('card-platform').classList.add('recommended');
  availability.textContent = 'Available on this deployment';
  availability.className = 'availability available';
} else {
  $('card-oss').classList.add('recommended');
  availability.textContent = 'Preview — needs a ResolveTrace Platform backend';
  availability.className = 'availability preview';
}
