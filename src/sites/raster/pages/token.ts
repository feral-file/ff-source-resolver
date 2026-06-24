import type { ParsedFindInput } from '../../../types';

/**
 * parseRasterToken parses Raster token pages. Raster artwork pages remain
 * series markers, but token pages already expose chain, contract, and token id.
 */
export function parseRasterToken(url: URL): ParsedFindInput | null {
  const m = /^\/token\/(ethereum|tezos)\/([^/]+)\/(\d+)\/?$/.exec(url.pathname);
  if (m) {
    const chain = m[1] === 'ethereum' ? 'ethereum' : 'tezos';
    if (chain === 'ethereum' && !/^0x[a-fA-F0-9]{40}$/.test(m[2])) {
      return null;
    }
    if (chain === 'tezos' && !/^KT[A-Za-z0-9]+$/.test(m[2])) {
      return null;
    }
    return {
      kind: 'token',
      source: 'raster',
      coords: {
        chain,
        contract: chain === 'ethereum' ? m[2].toLowerCase() : m[2],
        tokenId: m[3],
      },
    };
  }
  return null;
}
