const RASTER_GRAPHQL_ENDPOINT = 'https://api.raster.art/graphql';
/**
 * Raster caps the tokens connection at 250 rows and silently truncates a
 * larger `first` rather than erroring, so 250 is both the maximum and the
 * cheapest page: a 999-token series takes 4 requests instead of 10, measured
 * at 1.3s against 3.2s.
 */
const RASTER_GRAPHQL_PAGE_SIZE = 250;
const RASTER_GRAPHQL_MAX_PAGES = 20;

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
  errors?: unknown[];
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
type RasterTokenConnection = NonNullable<RasterArtworkWithTokensNode['tokens']>;
type RasterPageInfo = NonNullable<RasterTokenConnection['pageInfo']>;

const RASTER_ARTWORK_WITH_TOKENS_QUERY =
  'query ArtworkWithTokens($slug: String!, $first: Int!, $after: String) {' +
  ' artworkBySlug(slug: $slug) {' +
  ' id title description artists { name } platform { name }' +
  ' tokens(first: $first, after: $after) {' +
  ' totalCount pageInfo { hasNextPage endCursor }' +
  ' nodes { chainId contractAddress tokenId tokenStandard name' +
  ' media { contentUrl previewHash previewType } } } } }';

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
  limit?: number,
  countsTowardLimit: (token: RasterGraphqlToken) => boolean = () => true
): Promise<RasterArtworkWithTokens | null> {
  let after: string | null = null;
  let artwork: RasterArtworkWithTokens | null = null;
  const tokens: RasterGraphqlToken[] = [];
  let usable = 0;
  let hasMore = false;
  let totalCount = 0;

  for (let page = 0; page < RASTER_GRAPHQL_MAX_PAGES; page += 1) {
    // Always ask for a full page. A limit counts tokens the caller can use,
    // and rows this package drops -- an artwork also minted on a chain it does
    // not resolve -- are not knowable before they arrive, so sizing the
    // request by the limit would stop paging on rows that count for nothing.
    const first = RASTER_GRAPHQL_PAGE_SIZE;
    const body: RasterArtworkWithTokensResponse | null =
      await postRasterGraphql<RasterArtworkWithTokensResponse>(
        fetchImpl,
        RASTER_ARTWORK_WITH_TOKENS_QUERY,
        { slug, first, ...(after ? { after } : {}) }
      );
    // Every page must be provably whole before its rows join the inventory.
    // A caller cannot tell a 100-token series from one whose second page came
    // back damaged, so anything less than a complete page fails the whole
    // enumeration rather than shortening it silently. GraphQL reports
    // field-level failures as `errors` beside a 200 body, so a present `data`
    // is not on its own evidence of a good read.
    if (Array.isArray(body?.errors) && body.errors.length > 0) {
      return null;
    }
    const node: RasterArtworkWithTokensNode | null | undefined = body?.data?.artworkBySlug;
    if (node?.id == null) {
      return null;
    }
    const connection: RasterTokenConnection | null | undefined = node.tokens;
    if (!connection || !Array.isArray(connection.nodes) || !connection.pageInfo) {
      return null;
    }
    const pageInfo: RasterPageInfo = connection.pageInfo;
    // `totalCount` and `hasNextPage` are non-null in the schema, so a missing
    // or mistyped one is a damaged page rather than a shorter series. Reading
    // an absent hasNextPage as "no more pages" would end the walk early and
    // call the result complete.
    if (!Number.isInteger(connection.totalCount) || (connection.totalCount ?? -1) < 0) {
      return null;
    }
    if (typeof pageInfo.hasNextPage !== 'boolean') {
      return null;
    }
    if (pageInfo.hasNextPage && !pageInfo.endCursor) {
      // More pages exist and there is no way to ask for them.
      return null;
    }
    totalCount = connection.totalCount ?? 0;
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
    for (const row of connection.nodes) {
      // A row the connection counted but this package cannot read is a token
      // silently missing from the inventory, which is the shape of failure
      // this walk exists to refuse.
      if (!row || row.tokenId == null) {
        return null;
      }
      const token: RasterGraphqlToken = {
        chainId: row.chainId ?? null,
        contractAddress: row.contractAddress ?? null,
        tokenId: String(row.tokenId),
        tokenStandard: row.tokenStandard ?? null,
        name: row.name ?? null,
        contentUrl: row.media?.contentUrl ?? null,
        previewHash: row.media?.previewHash ?? null,
        previewType: row.media?.previewType ?? null,
      };
      tokens.push(token);
      if (countsTowardLimit(token)) {
        usable += 1;
      }
    }
    const nextPage = pageInfo.hasNextPage === true;
    if (limit != null && usable >= limit) {
      hasMore = nextPage || usable > limit;
      break;
    }
    if (!nextPage) {
      // The connection is exhausted, so every token it counted should be in
      // hand. Anything less means rows went missing between pages, and the
      // caller has no way to see the gap.
      if (tokens.length !== totalCount) {
        return null;
      }
      break;
    }
    after = pageInfo.endCursor ?? null;
    // Running out of pages with more pending is the same incompleteness as a
    // failed page, and callers cannot see the difference either.
    if (page === RASTER_GRAPHQL_MAX_PAGES - 1) {
      return null;
    }
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
