import type { ParsedFindInput } from '../../../types';

/**
 * parseSuperRareArtwork parses canonical SuperRare artwork pages.
 */
export function parseSuperRareArtwork(url: URL): ParsedFindInput | null {
  const m = /^\/artwork\/eth\/(0x[a-fA-F0-9]{40})\/(\d+)\/?$/.exec(url.pathname);
  if (m) {
    return {
      kind: 'token',
      source: 'superrare',
      coords: { chain: 'ethereum', contract: m[1].toLowerCase(), tokenId: m[2] },
    };
  }
  return null;
}
