import { RAW_COORDS, normalizeParsedFindInput } from './helpers';
import { matchSite } from './site-utils';
import { siteAdapters } from './sites';
import type { ParsedFindInput } from './types';
import { isValidWalletAddress, normalizeTokenCoords } from './validation';

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

  if (isValidWalletAddress('ethereum', trimmed)) {
    return { kind: 'address', chain: 'ethereum', address: trimmed.toLowerCase() };
  }
  if (isValidWalletAddress('tezos', trimmed)) {
    return { kind: 'address', chain: 'tezos', address: trimmed };
  }

  const rawMatch = RAW_COORDS.exec(trimmed);
  if (rawMatch) {
    const chain = rawMatch[1].toLowerCase() as 'ethereum' | 'tezos';
    const coords = normalizeTokenCoords({
      chain,
      contract: rawMatch[2],
      tokenId: rawMatch[3],
    });
    return coords
      ? {
          kind: 'token',
          source: 'raw',
          coords,
        }
      : null;
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
  return normalizeParsedFindInput(site.parseUrl(url));
}
