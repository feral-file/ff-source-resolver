const RASTER_GRAPHQL_ENDPOINT = 'https://api.raster.art/graphql';
const RASTER_GRAPHQL_PAGE_SIZE = 100;
const RASTER_GRAPHQL_MAX_PAGES = 20;

export interface RasterArtworkRef {
  id: string;
  title?: string;
}

interface RasterArtworkBySlugResponse {
  data?: {
    artworkBySlug?: {
      id?: string | number;
      title?: string;
    } | null;
  };
}

/**
 * RasterGraphqlToken is one row of the artwork's token connection, kept in
 * Raster's own vocabulary (CAIP-2 chainId, upper-case TokenStandard enum) so
 * callers decide how to map chains and standards.
 */
export interface RasterGraphqlToken {
  chainId: string | null;
  contractAddress: string | null;
  tokenId: string;
  tokenStandard: string | null;
  name: string | null;
  contentUrl: string | null;
  previewHash: string | null;
  previewType: string | null;
}

/**
 * RasterArtworkWithTokens is everything one paginated artworkBySlug query
 * exposes: artwork-level presentation metadata plus the token inventory.
 */
export interface RasterArtworkWithTokens {
  id: string;
  title?: string;
  description?: string;
  artists: ReadonlyArray<{ name: string }>;
  platformName?: string;
  tokens: readonly RasterGraphqlToken[];
  hasMore: boolean;
}

interface RasterArtworkWithTokensResponse {
  data?: {
    artworkBySlug?: {
      id?: string | number;
      title?: string | null;
      description?: string | null;
      artists?: Array<{ name?: string | null } | null> | null;
      platform?: { name?: string | null } | null;
      tokens?: {
        totalCount?: number;
        pageInfo?: { hasNextPage?: boolean; endCursor?: string | null } | null;
        nodes?: Array<{
          chainId?: string | null;
          contractAddress?: string | null;
          tokenId?: string | number | null;
          tokenStandard?: string | null;
          name?: string | null;
          media?: {
            contentUrl?: string | null;
            previewHash?: string | null;
            previewType?: string | null;
          } | null;
        } | null> | null;
      } | null;
    } | null;
  };
}

type RasterArtworkWithTokensNode = NonNullable<
  NonNullable<RasterArtworkWithTokensResponse['data']>['artworkBySlug']
>;

const RASTER_ARTWORK_WITH_TOKENS_QUERY =
  'query ArtworkWithTokens($slug: String!, $first: Int!, $after: String) {' +
  ' artworkBySlug(slug: $slug) {' +
  ' id title description artists { name } platform { name }' +
  ' tokens(first: $first, after: $after) {' +
  ' totalCount pageInfo { hasNextPage endCursor }' +
  ' nodes { chainId contractAddress tokenId tokenStandard name' +
  ' media { contentUrl previewHash previewType } } } } }';

/**
 * resolveRasterArtworkBySlug maps an artwork slug to Raster's numeric artwork
 * id (and title) via the public keyless GraphQL API.
 *
 * Raster's web pages sit behind a Vercel bot-protection checkpoint (observed
 * 2026-07: HTTP 429 challenge page for non-browser fetchers), so the
 * serialized page payload is not a reliable source for the artwork id. The
 * GraphQL API answers without credentials and models not-found as a null
 * query field rather than an HTTP error.
 */
export async function resolveRasterArtworkBySlug(
  slug: string,
  fetchImpl: typeof fetch
): Promise<RasterArtworkRef | null> {
  const body = await postRasterGraphql<RasterArtworkBySlugResponse>(
    fetchImpl,
    'query ArtworkBySlug($slug: String!) { artworkBySlug(slug: $slug) { id title } }',
    { slug }
  );
  const artwork = body?.data?.artworkBySlug;
  if (artwork?.id == null) {
    return null;
  }
  return {
    id: String(artwork.id),
    ...(artwork.title ? { title: artwork.title } : {}),
  };
}

/**
 * resolveRasterArtworkWithTokens resolves an artwork slug to its metadata and
 * full token inventory through the paginated artworkBySlug tokens connection.
 *
 * One query shape covers nearly everything this package needs from Raster:
 * coordinates, token standard, per-token name, the original content URL for
 * non-webapp media, and preview hashes for thumbnails. Only webapp content
 * URLs are missing (empty in GraphQL) and require the kit REST detail call.
 *
 * limit bounds how many token rows the caller needs; pagination stops as soon
 * as that many rows are collected, with hasMore reporting the remainder.
 */
export async function resolveRasterArtworkWithTokens(
  slug: string,
  fetchImpl: typeof fetch,
  limit?: number
): Promise<RasterArtworkWithTokens | null> {
  let after: string | null = null;
  let artwork: RasterArtworkWithTokens | null = null;
  const tokens: RasterGraphqlToken[] = [];
  let hasMore = false;

  for (let page = 0; page < RASTER_GRAPHQL_MAX_PAGES; page += 1) {
    const first =
      limit == null
        ? RASTER_GRAPHQL_PAGE_SIZE
        : Math.min(RASTER_GRAPHQL_PAGE_SIZE, Math.max(1, limit - tokens.length));
    const body: RasterArtworkWithTokensResponse | null =
      await postRasterGraphql<RasterArtworkWithTokensResponse>(
        fetchImpl,
        RASTER_ARTWORK_WITH_TOKENS_QUERY,
        { slug, first, ...(after ? { after } : {}) }
      );
    const node: RasterArtworkWithTokensNode | null | undefined = body?.data?.artworkBySlug;
    if (node?.id == null) {
      // A failed page after a successful one returns the partial inventory
      // rather than pretending the artwork does not exist.
      break;
    }
    if (!artwork) {
      artwork = {
        id: String(node.id),
        ...(node.title ? { title: node.title } : {}),
        ...(node.description ? { description: node.description } : {}),
        artists: (node.artists ?? []).flatMap((artist): Array<{ name: string }> =>
          artist?.name ? [{ name: artist.name }] : []
        ),
        ...(node.platform?.name ? { platformName: node.platform.name } : {}),
        tokens,
        hasMore: false,
      };
    }
    for (const row of node.tokens?.nodes ?? []) {
      if (!row || row.tokenId == null) continue;
      tokens.push({
        chainId: row.chainId ?? null,
        contractAddress: row.contractAddress ?? null,
        tokenId: String(row.tokenId),
        tokenStandard: row.tokenStandard ?? null,
        name: row.name ?? null,
        contentUrl: row.media?.contentUrl ?? null,
        previewHash: row.media?.previewHash ?? null,
        previewType: row.media?.previewType ?? null,
      });
    }
    const pageInfo: NonNullable<RasterArtworkWithTokensNode['tokens']>['pageInfo'] | undefined =
      node.tokens?.pageInfo;
    const nextPage = pageInfo?.hasNextPage === true && Boolean(pageInfo.endCursor);
    if (limit != null && tokens.length >= limit) {
      hasMore = nextPage || tokens.length > limit;
      break;
    }
    if (!nextPage) {
      break;
    }
    after = pageInfo?.endCursor ?? null;
    // Reaching the page cap with more pages pending is still hasMore.
    hasMore = page === RASTER_GRAPHQL_MAX_PAGES - 2 ? true : hasMore;
  }

  if (!artwork) {
    return null;
  }
  return { ...artwork, tokens, hasMore };
}

async function postRasterGraphql<T>(
  fetchImpl: typeof fetch,
  query: string,
  variables: Record<string, unknown>
): Promise<T | null> {
  let response: Response;
  try {
    response = await fetchImpl(RASTER_GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
  } catch {
    return null;
  }
  if (!response.ok) {
    return null;
  }
  return (await response.json().catch(() => null)) as T | null;
}

/**
 * RasterEnrichmentContext is the payload resolveTokensFromApi hands to
 * resolveArtworkSources through the library's opaque enrichmentContext slot,
 * so one paginated GraphQL enumeration serves both passes.
 */
export interface RasterEnrichmentContext {
  artwork: RasterArtworkWithTokens;
}

/**
 * rasterEnrichmentArtwork recovers the shared enumeration from the opaque
 * context slot. The structural check keeps a foreign payload (another
 * adapter's, or a stale shape) from being misread as Raster data.
 */
export function rasterEnrichmentArtwork(context: unknown): RasterArtworkWithTokens | null {
  if (!context || typeof context !== 'object') return null;
  const artwork = (context as { artwork?: unknown }).artwork;
  if (!artwork || typeof artwork !== 'object') return null;
  const candidate = artwork as RasterArtworkWithTokens;
  if (typeof candidate.id !== 'string' || !Array.isArray(candidate.tokens)) return null;
  return candidate;
}
