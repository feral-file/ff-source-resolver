import { ETH_ADDR, RAW_COORDS, TEZOS_ADDR, normalizeContract } from './helpers';
import { matchSite } from './site-utils';
import { siteAdapters } from './sites';
import type { ParsedFindInput } from './types';

/**
 * parseFindInput parses any source input understood by the FF find flow.
 *
 * The function is synchronous and deterministic. It only parses information
 * encoded in the input string itself; callers that want page inspection should
 * use resolveTokenInfo.
 */
export function parseFindInput(input: string): ParsedFindInput | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  if (ETH_ADDR.test(trimmed)) {
    return { kind: 'address', chain: 'ethereum', address: trimmed.toLowerCase() };
  }
  if (TEZOS_ADDR.test(trimmed)) {
    return { kind: 'address', chain: 'tezos', address: trimmed };
  }

  const rawMatch = RAW_COORDS.exec(trimmed);
  if (rawMatch) {
    return {
      kind: 'token',
      source: 'raw',
      coords: {
        chain: rawMatch[1].toLowerCase() as 'ethereum' | 'tezos',
        contract: normalizeContract(rawMatch[2]),
        tokenId: rawMatch[3],
      },
    };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(trimmed);
  } catch {
    return null;
  }

  return parseMarketplaceUrl(parsedUrl);
}

/**
 * parseMarketplaceUrl dispatches a URL to its site adapter. Unknown hosts
 * return null so non-marketplace URLs can still be treated as playable media
 * by callers such as `ff-cli play`.
 */
export function parseMarketplaceUrl(url: URL): ParsedFindInput | null {
  const site = matchSite(url, siteAdapters);
  if (!site) {
    return null;
  }
  return site.parseUrl(url);
}
