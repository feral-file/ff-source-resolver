import type { ParsedFindInput } from '../../../types';

/**
 * parseSuperRareCollection recognizes per-artist contract collection pages.
 */
export function parseSuperRareCollection(url: URL): ParsedFindInput | null {
  if (/^\/collection\/(0x[a-fA-F0-9]{40})\/?$/.test(url.pathname)) {
    return {
      kind: 'unsupported',
      reason:
        'SuperRare `/collection/{contract}` URLs (per-artist contract pages) are not yet ' +
        'supported in v1. Paste a specific token URL ' +
        '(superrare.com/artwork/eth/{contract}/{tokenId}) or use ' +
        '`ethereum:{contract}:{tokenId}`.',
    };
  }
  return null;
}
