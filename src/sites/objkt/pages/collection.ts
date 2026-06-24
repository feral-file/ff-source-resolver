import type { ParsedFindInput } from '../../../types';

/**
 * parseObjktCollection recognizes Objkt collection pages and keeps them as an
 * explicit unsupported result. Collection pages do not identify a single token
 * without a marketplace-specific selection policy.
 */
export function parseObjktCollection(url: URL): ParsedFindInput | null {
  if (url.pathname.startsWith('/collections/') || url.pathname.startsWith('/collection/')) {
    return {
      kind: 'unsupported',
      reason:
        'Objkt collection URLs are not yet supported in v1. Paste a specific token URL ' +
        '(objkt.com/tokens/{contract-or-alias}/{tokenId}) or use `tezos:{contract}:{tokenId}`.',
    };
  }
  return null;
}
