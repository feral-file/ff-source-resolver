import type { ParsedFindInput } from '../../../types';
import { sourceTokenResult } from '../../../helpers';

/**
 * parseObjktToken parses Objkt token pages that encode a Tezos contract and
 * token id directly in the path. Alias-backed URLs deliberately return their
 * own marker because a keyless static lookup is required to discover the KT1
 * contract behind the alias.
 */
export function parseObjktToken(url: URL): ParsedFindInput | null {
  const direct = /^\/(?:tokens|asset)\/(KT[A-Za-z0-9]+)\/(\d+)\/?$/.exec(url.pathname);
  if (direct) {
    return sourceTokenResult('objkt', 'tezos', direct[1], direct[2]);
  }
  const alias = /^\/(?:tokens|asset)\/([a-zA-Z][a-zA-Z0-9_-]*)\/(\d+)\/?$/.exec(url.pathname);
  if (alias) {
    return { kind: 'objkt-alias', alias: alias[1], tokenId: alias[2] };
  }
  return null;
}
