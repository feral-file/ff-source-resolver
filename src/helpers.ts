import type {
  FindingArtist,
  FindingArtistLink,
  IndexerChain,
  MarketplaceSource,
  ParsedFindInput,
  TokenCoords,
} from './types';
import {
  isValidTokenId,
  isValidWalletAddress,
  normalizeTokenCoords,
} from './validation';

export const RAW_COORDS = /^(ethereum|tezos):([^:]+):([^:]+)$/i;

/**
 * tokenResult builds a token parse result only when the chain-specific
 * contract and token id are valid.
 */
export function tokenResult(
  chain: IndexerChain,
  contract: string,
  tokenId: string
): { kind: 'token'; coords: TokenCoords } | null {
  const coords = normalizeTokenCoords({ chain, contract, tokenId });
  return coords ? { kind: 'token', coords } : null;
}

/**
 * sourceTokenResult builds a marketplace-scoped token parse result only after
 * chain-specific coordinate validation.
 */
export function sourceTokenResult(
  source: MarketplaceSource,
  chain: IndexerChain,
  contract: string,
  tokenId: string
): ParsedFindInput | null {
  const result = tokenResult(chain, contract, tokenId);
  return result ? { ...result, source } : null;
}

/**
 * normalizeParsedFindInput validates and normalizes token, address, and
 * alias-token findings before they leave parser or resolver paths.
 */
export function normalizeParsedFindInput(result: ParsedFindInput | null): ParsedFindInput | null {
  if (!result) {
    return null;
  }
  if (result.kind === 'token') {
    const coords = normalizeTokenCoords(result.coords);
    return coords ? { ...result, coords } : null;
  }
  if (result.kind === 'address') {
    if (!isValidWalletAddress(result.chain, result.address)) {
      return null;
    }
    return {
      ...result,
      address: result.chain === 'ethereum' ? result.address.toLowerCase() : result.address,
    };
  }
  if (result.kind === 'objkt-alias' && !isValidTokenId('tezos', result.tokenId)) {
    return null;
  }
  return result;
}

/**
 * normalizeParsedFindInputs keeps valid findings in their first-seen order and
 * removes duplicate token coordinates from collection extractors.
 */
export function normalizeParsedFindInputs(results: readonly ParsedFindInput[]): ParsedFindInput[] {
  const normalized: ParsedFindInput[] = [];
  const seenTokens = new Set<string>();
  for (const result of results) {
    const item = normalizeParsedFindInput(result);
    if (!item) {
      continue;
    }
    if (item.kind === 'token') {
      const key = `${item.coords.chain}:${item.coords.contract}:${item.coords.tokenId}`;
      if (seenTokens.has(key)) {
        continue;
      }
      seenTokens.add(key);
    }
    normalized.push(item);
  }
  return normalized;
}

/**
 * hasHostMatch checks both exact hosts and subdomains against a site host
 * allowlist. The caller strips a leading `www.` before this helper runs.
 */
export function hasHostMatch(host: string, hosts: readonly string[]): boolean {
  return hosts.some((candidate) => host === candidate || host.endsWith(`.${candidate}`));
}

/**
 * cleanArtistAddresses returns the wallets an adapter reported for one artist
 * as a finding must carry them: trimmed, with blanks and nulls dropped and
 * duplicates collapsed in first-seen order. Nothing else is touched -- EVM case
 * is kept as the source wrote it and Tezos is case-sensitive -- because which
 * wallets count as an identity is the caller's rule, not this package's.
 */
export function cleanArtistAddresses(
  addresses: ReadonlyArray<string | null | undefined> | null | undefined
): string[] {
  return Array.from(
    new Set(
      (addresses ?? []).flatMap((address) => {
        // A source map value that is not a string (Feral File's per-chain
        // map is typed as strings but arrives from JSON) must not throw here:
        // an adapter error costs every finding in the batch, not one wallet.
        const trimmed = typeof address === 'string' ? address.trim() : '';
        return trimmed ? [trimmed] : [];
      })
    )
  );
}

/**
 * RawFindingArtist is what an adapter hands to `cleanFindingArtist`: every
 * profile field as the source's response spells it, nullable and untrimmed.
 */
export interface RawFindingArtist {
  name?: string | null;
  addresses?: ReadonlyArray<string | null | undefined> | null;
  slug?: string | null;
  bio?: string | null;
  avatar?: string | null;
  links?: ReadonlyArray<{ url?: string | null; type?: string | null } | null> | null;
}

/**
 * cleanFindingArtist is the one place a source's artist profile becomes a
 * `FindingArtist`. Every adapter calls it, and `optionalFindingArtists` on the
 * public path calls it again, so an adapter that forgets cannot hand a caller
 * an unclean artist and the two can never disagree on what "clean" means.
 *
 * The rules, per field: `name` is whitespace-collapsed and the artist is
 * dropped (null) when nothing is left, since a nameless credit is useless to
 * every caller. `addresses` go through `cleanArtistAddresses`. `slug` and `bio`
 * are trimmed at the ends only -- a bio keeps the blank lines sources use to
 * separate paragraphs. `avatar` and every `links[].url` must parse as http(s),
 * because a caller loads them in a browser and a bare handle or an `ipfs://`
 * URI would not load; adapters that hold a gateway convert first. Links are
 * de-duplicated by URL, first seen wins. A field that cleans to nothing is
 * absent, never empty, so callers test presence alone.
 */
export function cleanFindingArtist(raw: RawFindingArtist): FindingArtist | null {
  const name = raw.name?.replace(/\s+/g, ' ').trim() ?? '';
  if (!name) return null;
  const addresses = cleanArtistAddresses(raw.addresses);
  const slug = raw.slug?.trim() ?? '';
  const bio = raw.bio?.trim() ?? '';
  const avatar = httpUrl(raw.avatar);
  const seen = new Set<string>();
  const links = (raw.links ?? []).flatMap((link): FindingArtistLink[] => {
    const url = httpUrl(link?.url);
    if (!url || seen.has(url)) return [];
    seen.add(url);
    const type = link?.type?.trim() ?? '';
    return [type ? { url, type } : { url }];
  });
  return {
    name,
    ...(addresses.length > 0 ? { addresses } : {}),
    ...(slug ? { slug } : {}),
    ...(bio ? { bio } : {}),
    ...(avatar ? { avatar } : {}),
    ...(links.length > 0 ? { links } : {}),
  };
}

/** httpUrl returns the normalised http(s) URL a value parses to, or null. */
export function httpUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}
