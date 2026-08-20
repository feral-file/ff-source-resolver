import type {
  ArtworkSourceFinding,
  ResolveArtworkSourcesContext,
  TokenCoords,
} from '../../../types';
import { rasterSupportedChain } from '../chain';
import type { RasterArtworkWithTokens, RasterGraphqlToken } from '../graphql';
import { rasterEnrichmentArtwork, resolveRasterArtworkWithTokens } from '../graphql';
import { parseRasterArtwork } from './artwork';
import { parseRasterToken } from './token';

const RASTER_KIT_ORIGIN = 'https://kit.raster.art';
const RASTER_BITS_ORIGIN = 'https://bits.raster.art';
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
  return artwork ? graphqlArtworkSources(artwork, coords, fetchImpl) : [];
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
  const matches: Array<{ requested: TokenCoords; token: RasterGraphqlToken; mintIndex: number }> =
    [];
  for (const [mintIndex, token] of artwork.tokens.entries()) {
    // The enumeration keeps the connection's shape, so a token's position is
    // the mint index Raster ordered it by. Raster exposes the index itself
    // only over REST, and measured across six series with no per-token name
    // (600 tokens) the two agree exactly; the series whose index is 1-based
    // all carry names, so the derivation below never runs for them.
    const key = graphqlTokenKey(token);
    const requested = key ? remaining.get(key) : undefined;
    if (key && requested) {
      remaining.delete(key);
      matches.push({ requested, token, mintIndex });
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
  for (const { requested, token, mintIndex } of matches) {
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
      ...optionalText('title', token.name, detail?.title, seriesTitle(artwork.title, mintIndex)),
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
 * seriesTitle names an edition the way Raster names it when the token carries
 * no metadata name of its own: the artwork title followed by the mint index.
 * Reproducing that convention keeps generative series -- where every name is
 * empty -- from arriving as a wall of untitled items.
 */
function seriesTitle(artworkTitle: string | undefined, mintIndex: number): string | undefined {
  const title = artworkTitle?.trim();
  return title ? `${title} #${String(mintIndex)}` : undefined;
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
 * rasterPreviewUrl builds a Raster CDN still for use as a thumbnail, following
 * the rendition table in Raster's media guide.
 *
 * 700px is offered by every handler that has sized renditions, and is the right
 * size on merit: this is a thumbnail, not the work. The two exceptions come
 * from the table itself -- `svg/1` publishes only the literal `original`, and
 * `gif/2` publishes only animated variants.
 *
 * A note for anyone verifying these URLs by hand: bits.raster.art answers 403
 * to a default curl User-Agent on paths its CDN has not cached, which reads
 * exactly like a missing rendition. Send a browser User-Agent when checking.
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

  let file: string;
  if (type.startsWith('svg/')) {
    file = 'original';
  } else if (type === 'gif/2') {
    file = '700-anim.avif';
  } else if (
    type.startsWith('image/') ||
    type.startsWith('image-pixelart/') ||
    type.startsWith('gif/') ||
    type.startsWith('video/')
  ) {
    file = '700.avif';
  } else {
    return null;
  }

  return `${RASTER_BITS_ORIGIN}/${hash.slice(0, 4)}/${hash}/${file}`;
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

function requestedCoords(coords: readonly TokenCoords[]): Map<string, TokenCoords> {
  return new Map(coords.map((value) => [coordsKey(value), value]));
}

function coordsKey(coords: TokenCoords): string {
  // Ethereum hex addresses are case-insensitive after validation, while Tezos
  // Base58 contracts must retain their exact casing.
  const contract = coords.chain === 'ethereum' ? coords.contract.toLowerCase() : coords.contract;
  return `${coords.chain}:${contract}:${coords.tokenId}`;
}
