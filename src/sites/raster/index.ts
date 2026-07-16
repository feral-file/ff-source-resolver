import type {
  ParsedFindInput,
  ResolveTokensFromApiContext,
  SourceSiteAdapter,
  TokenFindingsResult,
} from '../../types';
import { sourceTokenResult } from '../../helpers';
import { limitTokenFindings, tokenLimitTarget } from '../../limits';
import {
  extractRasterArtworkId,
  extractRasterArtworkTokenFromHtml,
  extractRasterArtworkTokensFromHtml,
  parseRasterArtwork,
} from './pages/artwork';
import { resolveRasterArtworkSources } from './pages/source';
import { parseRasterToken } from './pages/token';

const RASTER_PAGE_HEADERS = {
  Accept: 'text/html,application/xhtml+xml',
  'Accept-Language': 'en-US,en;q=0.9',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
} as const;

/**
 * rasterAdapter owns Raster URL and page extraction rules.
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
  let html = context?.html ?? null;
  if (!html) {
    const page = await fetchImpl(url.toString(), {
      headers: RASTER_PAGE_HEADERS,
    });
    if (!page.ok) {
      return { findings: [] };
    }
    html = await page.text();
  }
  const artworkId = extractRasterArtworkId(html);
  if (!artworkId) {
    return { findings: [] };
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
    ...(hasMore ? { hasMore } : {}),
  };
}

function rasterApiToken(token: NonNullable<RasterTokenPage['tokens']>[number]): ParsedFindInput | null {
  const chain = token.chain_id === 'eip155:1' ? 'ethereum' : null;
  const contract = token.contract_address ?? '';
  const tokenId = token.token_id == null ? '' : String(token.token_id);
  return chain && contract && tokenId ? sourceTokenResult('raster', chain, contract, tokenId) : null;
}
