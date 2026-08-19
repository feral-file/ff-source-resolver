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
  extractRasterArtworkId,
  extractRasterArtworkTokenFromHtml,
  extractRasterArtworkTokensFromHtml,
  parseRasterArtwork,
} from './pages/artwork';
import type { RasterEnrichmentContext } from './graphql';
import { resolveRasterArtworkBySlug, resolveRasterArtworkWithTokens } from './graphql';
import { resolveRasterArtworkSources } from './pages/source';
import { parseRasterToken } from './pages/token';

/**
 * rasterAdapter owns Raster URL and page extraction rules.
 *
 * raster.art itself sits behind a Vercel bot-protection checkpoint that 429s
 * non-browser fetchers, so this adapter never fetches the page on its own:
 * page HTML is only consumed when the caller already holds it, and everything
 * else comes from the keyless GraphQL API with the kit REST API as fallback.
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

interface RasterTokenPage {
  tokens?: Array<{
    chain_id?: string;
    contract_address?: string;
    token_id?: string | number;
  }>;
  cursor?: number | string | null;
}

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
  const artwork = await resolveRasterArtworkWithTokens(parsed.slug, fetchImpl, targetCount);
  if (artwork) {
    const results: ParsedFindInput[] = [];
    for (const token of artwork.tokens) {
      const chain = rasterSupportedChain(token.chainId);
      const result =
        chain && token.contractAddress && token.tokenId
          ? sourceTokenResult('raster', chain, token.contractAddress, token.tokenId)
          : null;
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

  return resolveRasterArtworkTokensFromKit(parsed.slug, fetchImpl, context);
}

/**
 * resolveRasterArtworkTokensFromKit is the REST fallback enumeration, kept for
 * the day Raster's GraphQL endpoint starts demanding credentials. It needs the
 * numeric artwork id, which comes from already-fetched page HTML when the
 * caller has it and from the lightweight GraphQL id query otherwise.
 */
async function resolveRasterArtworkTokensFromKit(
  slug: string,
  fetchImpl: typeof fetch,
  context?: ResolveTokensFromApiContext
): Promise<TokenFindingsResult> {
  const html = context?.html ?? null;
  let artworkId = html ? extractRasterArtworkId(html) : null;
  let apiTitle: string | undefined;
  if (!artworkId) {
    const artwork = await resolveRasterArtworkBySlug(slug, fetchImpl);
    if (!artwork) {
      return { findings: [] };
    }
    artworkId = artwork.id;
    apiTitle = artwork.title;
  }

  const results: ParsedFindInput[] = [];
  let cursor = '0';
  let hasMore = false;
  const targetCount = tokenLimitTarget(context?.limit);
  for (let pageCount = 0; pageCount < 20; pageCount += 1) {
    const pageLimit =
      targetCount == null ? 100 : Math.min(100, Math.max(1, targetCount - results.length));
    const apiUrl = new URL(`/artwork/${artworkId}/tokens`, 'https://kit.raster.art');
    apiUrl.searchParams.set('cursor', cursor);
    apiUrl.searchParams.set('page_size', String(pageLimit));
    apiUrl.searchParams.set('sort', 'listing');
    apiUrl.searchParams.set('sort_direction', 'asc');

    const response = await fetchImpl(apiUrl.toString(), { headers: { Accept: 'application/json' } });
    if (!response.ok) {
      break;
    }
    const body = (await response.json().catch(() => null)) as RasterTokenPage | null;
    const tokens = body?.tokens ?? [];
    if (tokens.length === 0) {
      break;
    }
    for (const token of tokens) {
      const result = rasterApiToken(token);
      if (result) {
        results.push(result);
        if (targetCount != null && results.length >= targetCount) {
          hasMore = true;
          break;
        }
      }
    }
    if (hasMore) {
      break;
    }
    const nextCursor = body?.cursor == null ? '' : String(body.cursor);
    if (!nextCursor || nextCursor === cursor) {
      break;
    }
    cursor = nextCursor;
  }
  return {
    findings: limitTokenFindings(results, context?.limit),
    ...(apiTitle ? { title: apiTitle } : {}),
    ...(hasMore ? { hasMore } : {}),
  };
}

function rasterApiToken(token: NonNullable<RasterTokenPage['tokens']>[number]): ParsedFindInput | null {
  const chain = rasterSupportedChain(token.chain_id);
  const contract = token.contract_address ?? '';
  const tokenId = token.token_id == null ? '' : String(token.token_id);
  return chain && contract && tokenId ? sourceTokenResult('raster', chain, contract, tokenId) : null;
}
