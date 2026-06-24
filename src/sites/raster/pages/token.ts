import type { ParsedFindInput } from '../../../types';
import { sourceTokenResult } from '../../../helpers';

/**
 * parseRasterToken parses Raster token pages. Raster artwork pages remain
 * series markers, but token pages already expose chain, contract, and token id.
 */
export function parseRasterToken(url: URL): ParsedFindInput | null {
  const m = /^\/token\/(ethereum|tezos)\/([^/]+)\/(\d+)\/?$/.exec(url.pathname);
  if (m) {
    const chain = m[1] === 'ethereum' ? 'ethereum' : 'tezos';
    return sourceTokenResult('raster', chain, m[2], m[3]);
  }
  return null;
}
