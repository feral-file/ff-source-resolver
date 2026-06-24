import type { ParsedFindInput } from '../../../types';
import { sourceTokenResult } from '../../../helpers';

/**
 * parseSuperRareArtwork parses canonical SuperRare artwork pages.
 */
export function parseSuperRareArtwork(url: URL): ParsedFindInput | null {
  const m = /^\/artwork\/eth\/(0x[a-fA-F0-9]{40})\/(\d+)\/?$/.exec(url.pathname);
  if (m) {
    return sourceTokenResult('superrare', 'ethereum', m[1], m[2]);
  }
  return null;
}
