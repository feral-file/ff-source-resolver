import type { ParsedFindInput } from '../../../types';
import { sourceTokenResult } from '../../../helpers';

/**
 * parseFxhashGentk parses fxhash token URLs. Only FX1 Tezos gentks are
 * supported because FF indexer coverage for fxhash is Tezos-only in v1.
 */
export function parseFxhashGentk(url: URL): ParsedFindInput | null {
  const m = /^\/(?:gentk|iteration\/id)\/FX1-(KT[A-Za-z0-9]+)-(\d+)\/?$/.exec(url.pathname);
  if (m) {
    return sourceTokenResult('fxhash', 'tezos', m[1], m[2]);
  }
  if (/^\/gentk\/FX2-/.test(url.pathname)) {
    return {
      kind: 'unsupported',
      reason:
        'fxhash FX2 (EVM) tokens are not supported — FF indexer covers Tezos mainnet only ' +
        'for fxhash. Paste a Tezos fxhash token or a different marketplace URL.',
    };
  }
  if (/^\/gentk\/\d+\/?$/.test(url.pathname)) {
    return {
      kind: 'unsupported',
      reason:
        'fxhash legacy numeric gentk URLs require an fxhash API lookup — not supported in v1. ' +
        'Paste the FX1-{contract}-{tokenId} form or use `tezos:{contract}:{tokenId}`.',
    };
  }
  return null;
}
