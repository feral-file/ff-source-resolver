import type { ParsedFindInput } from '../../../types';

/**
 * resolveOpenSeaCollectionFromApi intentionally returns no results because the
 * documented OpenSea collection NFT listing endpoint requires an x-api-key:
 *
 *   GET https://api.opensea.io/api/v2/collection/{slug}/nfts
 *
 * This package stays keyless, so collection resolution must continue to use the
 * page HTML and caller-owned headless rendering fallbacks until OpenSea exposes
 * a public unauthenticated complete token listing.
 */
export async function resolveOpenSeaCollectionFromApi(
  _url: URL,
  _parsed: ParsedFindInput | null,
  _fetchImpl: typeof fetch
): Promise<ParsedFindInput[]> {
  return [];
}
