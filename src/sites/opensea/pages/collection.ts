import type { ParsedFindInput } from '../../../types';

/**
 * parseOpenSeaCollection parses collection slug URLs. A separate resolver can
 * inspect the collection page to choose a representative Ethereum token.
 */
export function parseOpenSeaCollection(url: URL): ParsedFindInput | null {
  const collectionMatch = /^\/collection\/([a-z0-9][a-z0-9-]*)\/?$/.exec(url.pathname);
  if (collectionMatch) {
    return { kind: 'os-collection', slug: collectionMatch[1] };
  }
  if (url.pathname.startsWith('/collection/')) {
    return {
      kind: 'unsupported',
      reason:
        `OpenSea collection URL not recognized: ${url.pathname}. ` +
        'Expected opensea.io/collection/{slug} with no extra path segments.',
    };
  }
  return null;
}
