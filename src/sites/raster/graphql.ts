const RASTER_GRAPHQL_ENDPOINT = 'https://api.raster.art/graphql';

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
  let response: Response;
  try {
    response = await fetchImpl(RASTER_GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        query: 'query ArtworkBySlug($slug: String!) { artworkBySlug(slug: $slug) { id title } }',
        variables: { slug },
      }),
    });
  } catch {
    return null;
  }
  if (!response.ok) {
    return null;
  }

  const body = (await response.json().catch(() => null)) as RasterArtworkBySlugResponse | null;
  const artwork = body?.data?.artworkBySlug;
  if (artwork?.id == null) {
    return null;
  }
  return {
    id: String(artwork.id),
    ...(artwork.title ? { title: artwork.title } : {}),
  };
}
