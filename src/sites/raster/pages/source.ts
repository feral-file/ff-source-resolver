import type {
  ArtworkSourceFinding,
  ResolveArtworkSourcesContext,
  TokenCoords,
} from '../../../types';
import { rasterSupportedChain } from '../chain';
import type { RasterArtworkWithTokens, RasterGraphqlToken } from '../graphql';
import {
  rasterEnrichmentArtwork,
  resolveRasterArtworkBySlug,
  resolveRasterArtworkWithTokens,
} from '../graphql';
import { extractRasterArtworkId, parseRasterArtwork } from './artwork';
import { parseRasterToken } from './token';

const RASTER_KIT_ORIGIN = 'https://kit.raster.art';
const RASTER_BITS_ORIGIN = 'https://bits.raster.art';
const MAX_ARTWORK_PAGES = 20;
/**
 * Kit token-detail lookups run 50 at a time: parallel enough that a large
 * webapp series finishes in a handful of rounds, bounded enough not to dogpile
 * the API or a Worker's connection pool.
 */
const DETAIL_FETCH_BATCH_SIZE = 50;

interface RasterMediaMetadata {
  content_url?: string | null;
  metadata_source_url?: string | null;
  media_hash?: string | null;
  media_type?: string | null;
  preview_hash?: string | null;
  preview_type?: string | null;
}

interface RasterTokenDetail {
  title?: string | null;
  description?: string | null;
  metadata?: RasterMediaMetadata | null;
}

interface RasterArtworkToken {
  chain_id?: string;
  contract_address?: string;
  token_id?: string | number;
  name?: string | null;
  metadata?: RasterMediaMetadata | null;
}

interface RasterArtworkTokenPage {
  tokens?: RasterArtworkToken[];
  cursor?: number | string | null;
}

/**
 * ArtworkLevelMeta is the series-wide presentation data every finding shares.
 */
interface ArtworkLevelMeta {
  description?: string;
  artists?: ReadonlyArray<{ name: string }>;
  creditLine?: string;
}

/**
 * resolveRasterArtworkSources resolves playable media plus presentation
 * metadata for Raster tokens, without touching raster.art pages (they sit
 * behind a bot-protection checkpoint).
 *
 * Direct token pages use the kit REST detail. Artwork pages reuse the GraphQL
 * enumeration handed over via enrichmentContext (or run it themselves), then
 * fetch kit REST details only for tokens whose GraphQL contentUrl is empty —
 * in practice the `webapp` artworks whose live renderer URL exists nowhere
 * else.
 */
export async function resolveRasterArtworkSources(
  url: URL,
  coords: readonly TokenCoords[],
  fetchImpl: typeof fetch,
  context?: ResolveArtworkSourcesContext
): Promise<readonly ArtworkSourceFinding[]> {
  const parsedToken = parseRasterToken(url);
  if (parsedToken?.kind === 'token') {
    const coordsByKey = requestedCoords(coords);
    const requested = coordsByKey.get(coordsKey(parsedToken.coords));
    if (!requested) {
      return [];
    }
    const detail = await fetchRasterToken(requested, fetchImpl);
    const artworkSource = detail ? mediaSource(detail.metadata) : null;
    if (!artworkSource) {
      return [];
    }
    return [
      {
        coords: requested,
        artworkSource,
        ...optionalText('title', detail?.title),
        ...optionalText('description', detail?.description),
        ...optionalThumbnail(detail?.metadata),
        ...optionalMetadataUri(detail?.metadata),
      },
    ];
  }

  const parsedArtwork = parseRasterArtwork(url);
  if (parsedArtwork?.kind !== 'raster-artwork') {
    return [];
  }

  const artwork =
    rasterEnrichmentArtwork(context?.enrichmentContext) ??
    (await resolveRasterArtworkWithTokens(parsedArtwork.slug, fetchImpl));
  if (artwork) {
    return graphqlArtworkSources(artwork, coords, fetchImpl);
  }

  // REST fallback: GraphQL is unavailable, so recover the numeric artwork id
  // (from caller-provided HTML or the lightweight id query) and walk the kit
  // listing. Listing rows carry no content_url, so details are fetched for
  // every matched token.
  const html = context?.html ?? null;
  let artworkId = html ? extractRasterArtworkId(html) : null;
  if (!artworkId) {
    artworkId = (await resolveRasterArtworkBySlug(parsedArtwork.slug, fetchImpl))?.id ?? null;
  }
  if (!artworkId) {
    return [];
  }
  return kitArtworkSources(artworkId, coords, fetchImpl);
}

/**
 * graphqlArtworkSources builds findings from the shared GraphQL enumeration,
 * fetching kit details only where GraphQL's contentUrl is empty.
 */
async function graphqlArtworkSources(
  artwork: RasterArtworkWithTokens,
  coords: readonly TokenCoords[],
  fetchImpl: typeof fetch
): Promise<ArtworkSourceFinding[]> {
  const remaining = requestedCoords(coords);
  const matches: Array<{ requested: TokenCoords; token: RasterGraphqlToken }> = [];
  for (const token of artwork.tokens) {
    const key = graphqlTokenKey(token);
    const requested = key ? remaining.get(key) : undefined;
    if (key && requested) {
      remaining.delete(key);
      matches.push({ requested, token });
    }
  }

  // A kit detail lookup costs one request per token, so it is the last resort:
  // it runs only for tokens the GraphQL enumeration could describe with neither
  // an original content URL nor a usable CDN preview -- in practice `svg/1`,
  // the one handler the CDN serves no rendition for.
  const needDetail = matches.filter(
    ({ token }) =>
      !browserContentUrl(token.contentUrl) &&
      !rasterPreviewUrl(token.previewHash, token.previewType)
  );
  const details = new Map<string, RasterTokenDetail | null>();
  await forEachBatch(needDetail, async ({ requested, token }) => {
    const detail = await fetchRasterTokenByChainId(
      token.chainId,
      token.contractAddress,
      token.tokenId,
      fetchImpl
    );
    details.set(coordsKey(requested), detail);
  });

  const meta = artworkMeta(artwork);
  const results = new Map<string, ArtworkSourceFinding>();
  for (const { requested, token } of matches) {
    const key = coordsKey(requested);
    const detail = details.get(key) ?? null;
    const artworkSource =
      browserContentUrl(token.contentUrl) ??
      rasterPreviewUrl(token.previewHash, token.previewType) ??
      (detail ? mediaSource(detail.metadata) : null);
    if (!artworkSource) {
      continue;
    }
    results.set(key, {
      coords: requested,
      artworkSource,
      ...optionalText('title', token.name, detail?.title),
      ...optionalText('description', detail?.description, meta.description),
      ...(meta.artists ? { artists: meta.artists } : {}),
      ...(meta.creditLine ? { creditLine: meta.creditLine } : {}),
      ...optionalUrl(
        'thumbnail',
        rasterPreviewUrl(token.previewHash, token.previewType) ??
          rasterPreviewUrl(detail?.metadata?.preview_hash, detail?.metadata?.preview_type) ??
          rasterPreviewUrl(detail?.metadata?.media_hash, detail?.metadata?.media_type)
      ),
      ...optionalMetadataUri(detail?.metadata),
      ...optionalStandard(token.tokenStandard),
    });
  }

  return coords.flatMap((value) => {
    const finding = results.get(coordsKey(value));
    return finding ? [finding] : [];
  });
}

/**
 * kitArtworkSources is the REST-only fallback: kit listing for matching plus
 * kit details for media, titles, and metadata URLs.
 */
async function kitArtworkSources(
  artworkId: string,
  coords: readonly TokenCoords[],
  fetchImpl: typeof fetch
): Promise<ArtworkSourceFinding[]> {
  const remaining = requestedCoords(coords);
  const matches: Array<{ requested: TokenCoords; token: RasterArtworkToken }> = [];
  let cursor = '0';

  for (let pageCount = 0; pageCount < MAX_ARTWORK_PAGES && remaining.size > 0; pageCount += 1) {
    const apiUrl = new URL(`/artwork/${encodeURIComponent(artworkId)}/tokens`, RASTER_KIT_ORIGIN);
    apiUrl.searchParams.set('cursor', cursor);
    apiUrl.searchParams.set('page_size', '100');
    apiUrl.searchParams.set('sort', 'listing');
    apiUrl.searchParams.set('sort_direction', 'asc');

    const page = await fetchRasterUrlJson<RasterArtworkTokenPage>(apiUrl, fetchImpl);
    const tokens = page?.tokens ?? [];
    if (tokens.length === 0) {
      break;
    }
    for (const token of tokens) {
      const key = rasterTokenKey(token);
      const requested = key ? remaining.get(key) : undefined;
      if (key && requested) {
        remaining.delete(key);
        matches.push({ requested, token });
      }
    }

    const nextCursor = page?.cursor == null ? '' : String(page.cursor);
    if (!nextCursor || nextCursor === cursor) {
      break;
    }
    cursor = nextCursor;
  }

  const details = new Map<string, RasterTokenDetail | null>();
  await forEachBatch(matches, async ({ requested, token }) => {
    const detail = await fetchRasterTokenByChainId(
      token.chain_id ?? null,
      token.contract_address ?? null,
      token.token_id == null ? null : String(token.token_id),
      fetchImpl
    );
    details.set(coordsKey(requested), detail);
  });

  const results = new Map<string, ArtworkSourceFinding>();
  for (const { requested, token } of matches) {
    const key = coordsKey(requested);
    const detail = details.get(key) ?? null;
    const artworkSource =
      (detail ? mediaSource(detail.metadata) : null) ?? mediaSource(token.metadata);
    if (!artworkSource) {
      continue;
    }
    results.set(key, {
      coords: requested,
      artworkSource,
      ...optionalText('title', detail?.title, token.name),
      ...optionalText('description', detail?.description),
      ...optionalThumbnail(token.metadata ?? detail?.metadata),
      ...optionalMetadataUri(detail?.metadata),
    });
  }

  return coords.flatMap((value) => {
    const finding = results.get(coordsKey(value));
    return finding ? [finding] : [];
  });
}

function artworkMeta(artwork: RasterArtworkWithTokens): ArtworkLevelMeta {
  return {
    ...(artwork.description ? { description: artwork.description } : {}),
    ...(artwork.artists.length > 0 ? { artists: artwork.artists } : {}),
    ...(artwork.platformName ? { creditLine: artwork.platformName } : {}),
  };
}

async function forEachBatch<T>(
  items: readonly T[],
  handler: (item: T) => Promise<void>
): Promise<void> {
  for (let start = 0; start < items.length; start += DETAIL_FETCH_BATCH_SIZE) {
    await Promise.all(items.slice(start, start + DETAIL_FETCH_BATCH_SIZE).map(handler));
  }
}

async function fetchRasterToken(
  coords: TokenCoords,
  fetchImpl: typeof fetch
): Promise<RasterTokenDetail | null> {
  const endpoint =
    `/token/${encodeURIComponent(coords.chain)}/` +
    `${encodeURIComponent(coords.contract)}/${encodeURIComponent(coords.tokenId)}`;
  return fetchRasterJson<RasterTokenDetail>(endpoint, fetchImpl);
}

/**
 * fetchRasterTokenByChainId addresses the kit detail endpoint with the raw
 * source chain id (`eip155:1`, `tezos:…`) exactly as Raster reported it,
 * which the kit API accepts alongside the chain-name form.
 */
async function fetchRasterTokenByChainId(
  chainId: string | null,
  contract: string | null,
  tokenId: string | null,
  fetchImpl: typeof fetch
): Promise<RasterTokenDetail | null> {
  if (!chainId || !contract || !tokenId) {
    return null;
  }
  const endpoint =
    `/token/${encodeURIComponent(chainId)}/` +
    `${encodeURIComponent(contract)}/${encodeURIComponent(tokenId)}`;
  return fetchRasterJson<RasterTokenDetail>(endpoint, fetchImpl);
}

async function fetchRasterJson<T>(path: string, fetchImpl: typeof fetch): Promise<T | null> {
  return fetchRasterUrlJson(new URL(path, RASTER_KIT_ORIGIN), fetchImpl);
}

async function fetchRasterUrlJson<T>(url: URL, fetchImpl: typeof fetch): Promise<T | null> {
  try {
    const response = await fetchImpl(url.toString(), { headers: { Accept: 'application/json' } });
    return response.ok ? ((await response.json().catch(() => null)) as T | null) : null;
  } catch {
    return null;
  }
}

/**
 * optionalText takes the first non-blank candidate. Raster reports absent
 * strings inconsistently -- GraphQL returns `""` for an Art Blocks token name
 * where the kit detail has the real one -- so `??` would stop at the empty
 * string and drop a value that exists one source over.
 */
function optionalText(
  key: 'title' | 'description',
  ...values: Array<string | null | undefined>
): Partial<ArtworkSourceFinding> {
  for (const value of values) {
    const text = value?.replace(/\s+/g, ' ').trim();
    if (text) {
      return { [key]: text };
    }
  }
  return {};
}

function optionalUrl(
  key: 'thumbnail' | 'metadataUri',
  value: string | null | undefined
): Partial<ArtworkSourceFinding> {
  const url = value ? browserContentUrl(value) : null;
  return url ? { [key]: url } : {};
}

function optionalThumbnail(
  metadata: RasterMediaMetadata | null | undefined
): Partial<ArtworkSourceFinding> {
  return optionalUrl(
    'thumbnail',
    rasterPreviewUrl(metadata?.preview_hash, metadata?.preview_type) ??
      rasterPreviewUrl(metadata?.media_hash, metadata?.media_type)
  );
}

function optionalMetadataUri(
  metadata: RasterMediaMetadata | null | undefined
): Partial<ArtworkSourceFinding> {
  return optionalUrl('metadataUri', metadata?.metadata_source_url);
}

function optionalStandard(tokenStandard: string | null): Partial<ArtworkSourceFinding> {
  const standard = tokenStandard?.toLowerCase();
  return standard === 'erc721' || standard === 'erc1155' || standard === 'fa2'
    ? { standard }
    : {};
}

function mediaSource(metadata: RasterMediaMetadata | null | undefined): string | null {
  const original = browserContentUrl(metadata?.content_url);
  if (original) {
    return original;
  }
  return (
    rasterPreviewUrl(metadata?.media_hash, metadata?.media_type) ??
    rasterPreviewUrl(metadata?.preview_hash, metadata?.preview_type)
  );
}

function browserContentUrl(value: string | null | undefined): string | null {
  const candidate = value?.trim();
  if (!candidate) {
    return null;
  }
  if (candidate.startsWith('ipfs://')) {
    const path = candidate.slice('ipfs://'.length).replace(/^ipfs\//, '');
    return path ? `https://ipfs.io/ipfs/${path}` : null;
  }
  if (candidate.startsWith('ar://')) {
    const path = candidate.slice('ar://'.length);
    return path ? `https://arweave.net/${path}` : null;
  }
  try {
    const url = new URL(candidate);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * rasterPreviewUrl builds a Raster CDN still for use as a thumbnail.
 *
 * 700px is the one rendition the CDN actually serves. Measured 2026-08 across
 * 17 image and gif assets it answered for every one, while the sizes the media
 * guide documents at the top of each ladder did not: `7200.avif` for `image/2`
 * 403s everywhere tested, and the `-anim.avif` variants documented for `gif`
 * and `video` 403 on every asset tried. `svg/1` serves no rendition at all --
 * neither `original` nor a sized AVIF -- so it yields no thumbnail rather than
 * a URL that is certain to fail.
 *
 * 700px is also the right size on merit: this is a thumbnail, not the work.
 */
function rasterPreviewUrl(
  previewHash: string | null | undefined,
  previewType: string | null | undefined
): string | null {
  const hash = previewHash?.trim();
  const type = previewType?.trim().toLowerCase();
  if (!hash || !/^[A-Fa-f0-9]{8,}$/.test(hash) || !type) {
    return null;
  }
  const served =
    type.startsWith('image/') ||
    type.startsWith('image-pixelart/') ||
    type.startsWith('gif/') ||
    type.startsWith('video/');
  if (!served) {
    return null;
  }
  return `${RASTER_BITS_ORIGIN}/${hash.slice(0, 4)}/${hash}/700.avif`;
}

function graphqlTokenKey(token: RasterGraphqlToken): string | null {
  const chain = rasterSupportedChain(token.chainId);
  if (!chain || !token.contractAddress || !token.tokenId) {
    return null;
  }
  return coordsKey({
    chain,
    contract: token.contractAddress,
    tokenId: token.tokenId,
  });
}

function rasterTokenKey(token: RasterArtworkToken): string | null {
  const chain = rasterSupportedChain(token.chain_id);
  if (!chain || !token.contract_address || token.token_id == null) {
    return null;
  }
  return coordsKey({
    chain,
    contract: token.contract_address,
    tokenId: String(token.token_id),
  });
}

function requestedCoords(coords: readonly TokenCoords[]): Map<string, TokenCoords> {
  return new Map(coords.map((value) => [coordsKey(value), value]));
}

function coordsKey(coords: TokenCoords): string {
  // Ethereum hex addresses are case-insensitive after validation, while Tezos
  // Base58 contracts must retain their exact casing.
  const contract = coords.chain === 'ethereum' ? coords.contract.toLowerCase() : coords.contract;
  return `${coords.chain}:${contract}:${coords.tokenId}`;
}
