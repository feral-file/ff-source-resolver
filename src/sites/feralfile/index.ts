import type {
  ParsedFindInput,
  ResolveTokensFromApiContext,
  SourceSiteAdapter,
  TokenFindingsResult,
} from '../../types';
import { sourceTokenResult } from '../../helpers';
import { limitTokenFindings, tokenLimitTarget } from '../../limits';
import { parseFeralFileArtwork } from './pages/artwork';
import { parseFeralFileSeries } from './pages/series';
import { parseFeralFileShow } from './pages/show';
import { resolveFeralFileArtworkSources } from './pages/source';

interface FeralFileApiResponse<T> {
  result?: T;
}

interface FeralFileShow {
  id?: string;
  title?: string;
  name?: string;
  series?: Array<{ id?: string } | null>;
}

interface FeralFileSeries {
  id?: string;
  title?: string;
  name?: string;
}

interface FeralFileArtwork {
  chain?: string;
  contractAddress?: string;
  tokenID?: string | number;
  title?: string;
  name?: string;
}

/**
 * feralFileAdapter owns Feral File URL and page extraction rules.
 */
export const feralFileAdapter: SourceSiteAdapter = {
  source: 'feralfile',
  hosts: ['feralfile.com'],
  parseUrl(url: URL): ParsedFindInput {
    return (
      parseFeralFileArtwork(url) ??
      parseFeralFileSeries(url) ??
      parseFeralFileShow(url) ?? {
        kind: 'unsupported',
        reason:
          `Feral File URL not recognized: ${url.pathname}. Supported: ` +
          '/exhibitions/artwork/{tokenId}, /exhibitions/series/{slug}, /exhibitions/shows/{slug}.',
      }
    );
  },
  async resolveTokensFromApi(_url, parsed, fetchImpl, context): Promise<TokenFindingsResult> {
    return resolveFeralFileTokensFromApi(parsed, fetchImpl, context);
  },
  resolveArtworkSources: resolveFeralFileArtworkSources,
};

async function resolveFeralFileTokensFromApi(
  parsed: ParsedFindInput | null,
  fetchImpl: typeof fetch,
  context?: ResolveTokensFromApiContext
): Promise<TokenFindingsResult> {
  if (parsed?.kind !== 'ff-url') {
    return { findings: [] };
  }
  if (parsed.urlKind === 'show') {
    const show = await fetchFeralFileApi<FeralFileShow>(
      `/api/exhibitions/${encodeURIComponent(parsed.identifier)}`,
      fetchImpl
    );
    const seriesIds = (show?.series ?? []).flatMap((series) => (series?.id ? [series.id] : []));
    if (seriesIds.length === 0) {
      return { findings: [] };
    }
    const results: ParsedFindInput[] = [];
    let hasMore = false;
    const targetCount = tokenLimitTarget(context?.limit);
    for (const seriesId of seriesIds) {
      const artworks = await fetchFeralFileApi<FeralFileArtwork[]>(
        `/api/artworks?seriesID=${encodeURIComponent(seriesId)}`,
        fetchImpl
      );
      for (const token of feralFileArtworkTokens(artworks ?? [])) {
        results.push(token);
        if (targetCount != null && results.length >= targetCount) {
          hasMore = true;
          break;
        }
      }
      if (hasMore) {
        break;
      }
    }
    const title = feralFileTitle(show);
    return {
      findings: limitTokenFindings(results, context?.limit),
      ...(title ? { title } : {}),
      ...(hasMore ? { hasMore } : {}),
    };
  }
  if (parsed.urlKind === 'series') {
    const series = await fetchFeralFileApi<FeralFileSeries>(
      `/api/series/${encodeURIComponent(parsed.identifier)}`,
      fetchImpl
    );
    if (!series?.id) {
      return { findings: [] };
    }
    const artworks = await fetchFeralFileApi<FeralFileArtwork[]>(
      `/api/artworks?seriesID=${encodeURIComponent(series.id)}`,
      fetchImpl
    );
    const results = feralFileArtworkTokens(artworks ?? []);
    const hasMore = context?.limit != null && results.length > context.limit;
    const title = feralFileTitle(series);
    return {
      findings: limitTokenFindings(results, context?.limit),
      ...(title ? { title } : {}),
      ...(hasMore ? { hasMore } : {}),
    };
  }
  if (parsed.urlKind === 'artwork') {
    const artwork = await fetchFeralFileApi<FeralFileArtwork>(
      `/api/artworks/${encodeURIComponent(parsed.identifier)}`,
      fetchImpl
    );
    const findings = artwork ? feralFileArtworkTokens([artwork]) : [];
    const title = feralFileTitle(artwork);
    return { findings, ...(findings.length > 0 && title ? { title } : {}) };
  }
  return { findings: [] };
}

async function fetchFeralFileApi<T>(path: string, fetchImpl: typeof fetch): Promise<T | null> {
  const response = await fetchImpl(new URL(path, 'https://feralfile.com').toString(), {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    return null;
  }
  const body = (await response.json().catch(() => null)) as FeralFileApiResponse<T> | null;
  return body?.result ?? null;
}

function feralFileArtworkTokens(artworks: readonly FeralFileArtwork[]): ParsedFindInput[] {
  const results: ParsedFindInput[] = [];
  for (const artwork of artworks) {
    const chain = artwork.chain === 'tezos' ? 'tezos' : artwork.chain === 'ethereum' ? 'ethereum' : null;
    const contract = artwork.contractAddress ?? '';
    const tokenId = artwork.tokenID == null ? '' : String(artwork.tokenID);
    if (!chain || !contract || !tokenId) {
      continue;
    }
    const result = sourceTokenResult('feralfile', chain, contract, tokenId);
    if (result) {
      results.push(result);
    }
  }
  return results;
}

function feralFileTitle(value: { title?: string | null; name?: string | null } | null | undefined): string | undefined {
  return value?.title ?? value?.name ?? undefined;
}
