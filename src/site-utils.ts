import type { ParsedFindInput, SourceSiteAdapter } from './types';
import { extractTokenFromText, hasHostMatch } from './helpers';

/**
 * matchSite returns the adapter for a URL host, if the host is supported.
 */
export function matchSite(url: URL, adapters: readonly SourceSiteAdapter[]): SourceSiteAdapter | null {
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  return adapters.find((adapter) => hasHostMatch(host, adapter.hosts)) ?? null;
}

/**
 * htmlTokenResult creates a site-scoped token parse result from deterministic
 * HTML text. The source attribution stays with the adapter that allowed the
 * DOM lookup, even though the token grammar itself is shared.
 */
export function htmlTokenResult(
  adapter: SourceSiteAdapter,
  html: string
): ParsedFindInput | null {
  const coords = extractTokenFromText(html);
  if (!coords) {
    return null;
  }
  return { kind: 'token', source: adapter.source, coords };
}
