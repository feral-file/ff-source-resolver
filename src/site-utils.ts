import type { SourceSiteAdapter } from './types';
import { hasHostMatch } from './helpers';

/**
 * matchSite returns the adapter for a URL host, if the host is supported.
 */
export function matchSite(url: URL, adapters: readonly SourceSiteAdapter[]): SourceSiteAdapter | null {
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  return adapters.find((adapter) => hasHostMatch(host, adapter.hosts)) ?? null;
}
