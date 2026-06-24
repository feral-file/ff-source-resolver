import type { ParsedFindInput } from '../../../types';
import { sourceTokenResult } from '../../../helpers';

/**
 * parseArtBlocksToken parses Art Blocks token pages whose paths contain the
 * Ethereum contract and token id.
 */
export function parseArtBlocksToken(url: URL): ParsedFindInput | null {
  let m = /^\/token\/(0x[a-fA-F0-9]{40})-(\d+)\/?$/.exec(url.pathname);
  if (m) {
    return sourceTokenResult('artblocks', 'ethereum', m[1], m[2]);
  }
  m = /^\/token\/\d+\/(0x[a-fA-F0-9]{40})\/(\d+)\/?$/.exec(url.pathname);
  if (m) {
    return sourceTokenResult('artblocks', 'ethereum', m[1], m[2]);
  }
  m = /^\/marketplace\/collections\/(0x[a-fA-F0-9]{40})\/tokens\/(\d+)\/?$/.exec(
    url.pathname
  );
  if (m) {
    return sourceTokenResult('artblocks', 'ethereum', m[1], m[2]);
  }
  return null;
}
