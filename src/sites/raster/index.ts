import type {
  ParsedFindInput,
  ResolveTokensFromApiContext,
  SourceSiteAdapter,
  TokenFindingsResult,
} from '../../types';
import { sourceTokenResult } from '../../helpers';
import { limitTokenFindings, tokenLimitTarget } from '../../limits';
import { rasterSupportedChain } from './chain';
import {
  extractRasterArtworkTokenFromHtml,
  extractRasterArtworkTokensFromHtml,
  parseRasterArtwork,
} from './pages/artwork';
import type { RasterEnrichmentContext, RasterGraphqlToken } from './graphql';
import { resolveRasterArtworkWithTokens } from './graphql';
import { resolveRasterArtworkSources } from './pages/source';
import { parseRasterToken } from './pages/token';

/**
 * rasterAdapter owns Raster URL and page extraction rules.
 *
 * raster.art itself sits behind a Vercel bot-protection checkpoint that 429s
 * non-browser fetchers, so this adapter never fetches the page on its own and
 * declares skipStaticFetch: page markup is consumed only when a caller
 * supplies it or a renderer produces it.
 *
 * Collections are enumerated through the keyless GraphQL API alone. Raster's
 * REST API is the same backend rather than an independent source -- it reports
 * the same internal id, content size and media hash for a token -- so there is
 * no fallback to reach for, and a GraphQL outage resolves as not-found. The
 * kit REST API is still used for per-token media, but only for tokens GraphQL
 * describes with neither a content URL nor a usable preview.
 */
export const rasterAdapter: SourceSiteAdapter = {
  source: 'raster',
  hosts: ['raster.art'],
  parseUrl(url: URL): ParsedFindInput {
    return (
      parseRasterToken(url) ??
      parseRasterArtwork(url) ?? {
        kind: 'unsupported',
        reason: `Raster URL not recognized: ${url.pathname}. Expected /artwork/{slug}.`,
      }
    );
  },
  // raster.art answers non-browser fetchers with a 429 challenge, so the page
  // request is a guaranteed miss; everything comes from the keyless API.
  skipStaticFetch: true,
  extractFromHtml(url: URL, html: string): ParsedFindInput | null {
    return extractRasterArtworkTokenFromHtml(url, html);
  },
  extractTokensFromHtml(url: URL, html: string): readonly ParsedFindInput[] {
    return extractRasterArtworkTokensFromHtml(url, html);
  },
  async resolveTokensFromApi(url, parsed, fetchImpl, context): Promise<TokenFindingsResult> {
    return resolveRasterArtworkTokensFromApi(url, parsed, fetchImpl, context);
  },
  resolveArtworkSources: resolveRasterArtworkSources,
};

async function resolveRasterArtworkTokensFromApi(
  url: URL,
  parsed: ParsedFindInput | null,
  fetchImpl: typeof fetch,
  context?: ResolveTokensFromApiContext
): Promise<TokenFindingsResult> {
  if (parsed?.kind !== 'raster-artwork') {
    return { findings: [] };
  }
  const targetCount = tokenLimitTarget(context?.limit);

  // GraphQL first: one paginated query yields coordinates plus the artwork
  // metadata and media fields the enrichment pass needs, so its result is
  // replayed through enrichmentContext instead of being fetched twice.
  const artwork = await resolveRasterArtworkWithTokens(
    parsed.slug,
    fetchImpl,
    targetCount,
    (token) => rasterCoordinates(token) !== null
  );
  if (artwork) {
    const results: ParsedFindInput[] = [];
    for (const token of artwork.tokens) {
      const result = rasterCoordinates(token);
      if (result) {
        results.push(result);
      }
    }
    if (results.length > 0) {
      const hasMore =
        artwork.hasMore || (context?.limit != null && results.length > context.limit);
      const enrichmentContext: RasterEnrichmentContext = { artwork };
      return {
        findings: limitTokenFindings(results, context?.limit),
        ...(artwork.title ? { title: artwork.title } : {}),
        ...(hasMore ? { hasMore } : {}),
        enrichmentContext,
      };
    }
  }

  return { findings: [] };
}

/**
 * rasterCoordinates maps one GraphQL token row to source coordinates, or null
 * when this package does not resolve its chain. Pagination and enumeration
 * share it so a row that stops the page loop is exactly a row that produces a
 * finding.
 */
function rasterCoordinates(token: RasterGraphqlToken): ParsedFindInput | null {
  const chain = rasterSupportedChain(token.chainId);
  if (!chain || !token.contractAddress || !token.tokenId) {
    return null;
  }
  return sourceTokenResult('raster', chain, token.contractAddress, token.tokenId);
}
