import type { ParsedFindInput } from '../../../types';
import { sourceTokenResult } from '../../../helpers';

/**
 * parseVerseItem parses Verse item pages whose path contains Ethereum token
 * coordinates. Other chain slugs remain unsupported for FF indexer coverage.
 */
export function parseVerseItem(url: URL): ParsedFindInput | null {
  let m = /^\/items\/ethereum\/(0x[a-fA-F0-9]{40})\/(\d+)\/?$/.exec(url.pathname);
  if (m) {
    return sourceTokenResult('verse', 'ethereum', m[1], m[2]);
  }
  m = /^\/items\/([^/]+)\//.exec(url.pathname);
  if (m) {
    return {
      kind: 'unsupported',
      reason:
        `Verse ${m[1]} item URLs are not supported — ff-cli covers Ethereum and Tezos mainnet only. ` +
        'Paste an Ethereum Verse item URL or raw `ethereum:{contract}:{tokenId}` coordinates.',
    };
  }
  return null;
}
