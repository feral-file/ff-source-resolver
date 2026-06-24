import type { ParsedFindInput } from '../../../types';

/**
 * parseVerseSeries parses Verse series pages. Static DOM extraction may later
 * find item links on the same page, but the CLI keeps this marker for its
 * existing series resolver.
 */
export function parseVerseSeries(url: URL): ParsedFindInput | null {
  const m = /^\/series\/([A-Za-z0-9][A-Za-z0-9_-]*)\/?$/.exec(url.pathname);
  if (m) {
    return { kind: 'verse-series', slug: m[1] };
  }
  return null;
}
