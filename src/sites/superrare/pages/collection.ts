import type { ParsedFindInput } from '../../../types';

/**
 * parseSuperRareCollection recognizes per-artist contract collection pages.
 */
export function parseSuperRareCollection(url: URL): ParsedFindInput | null {
  if (parseSuperRareCollectionContract(url)) {
    return {
      kind: 'unsupported',
      reason:
        'SuperRare collection URLs (`/collection/{contract}` or `/collection/1-{contract}`) ' +
        'are not token URLs. Paste a specific token URL ' +
        '(superrare.com/artwork/eth/{contract}/{tokenId}) or use ' +
        '`ethereum:{contract}:{tokenId}` for single-token resolution.',
    };
  }
  return null;
}

/**
 * parseSuperRareCollectionContract extracts the stable Ethereum contract from
 * SuperRare collection URL shapes. The `1-` prefix is SuperRare's chain id
 * marker for Ethereum collection pages.
 */
export function parseSuperRareCollectionContract(url: URL): string | null {
  return /^\/collection\/(?:1-)?(0x[a-fA-F0-9]{40})\/?$/.exec(url.pathname)?.[1].toLowerCase() ?? null;
}
