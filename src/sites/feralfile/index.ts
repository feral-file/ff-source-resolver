import type { ParsedFindInput, SourceSiteAdapter } from '../../types';
import { sourceTokenResult } from '../../helpers';
import { parseFeralFileArtwork } from './pages/artwork';
import { parseFeralFileSeries } from './pages/series';
import { parseFeralFileShow } from './pages/show';

interface FeralFileApiResponse<T> {
  result?: T;
}

interface FeralFileShow {
  id?: string;
  series?: Array<{ id?: string } | null>;
}

interface FeralFileSeries {
  id?: string;
}

interface FeralFileArtwork {
  chain?: string;
  contractAddress?: string;
  tokenID?: string | number;
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
  async resolveTokensFromApi(_url, parsed, fetchImpl): Promise<readonly ParsedFindInput[]> {
    return resolveFeralFileTokensFromApi(parsed, fetchImpl);
  },
};

async function resolveFeralFileTokensFromApi(
  parsed: ParsedFindInput | null,
  fetchImpl: typeof fetch
): Promise<ParsedFindInput[]> {
  if (parsed?.kind !== 'ff-url') {
    return [];
  }
  if (parsed.urlKind === 'show') {
    const show = await fetchFeralFileApi<FeralFileShow>(
      `/api/exhibitions/${encodeURIComponent(parsed.identifier)}`,
      fetchImpl
    );
    const seriesIds = (show?.series ?? []).flatMap((series) => (series?.id ? [series.id] : []));
    if (seriesIds.length === 0) {
      return [];
    }
    const results: ParsedFindInput[] = [];
    for (const seriesId of seriesIds) {
      const artworks = await fetchFeralFileApi<FeralFileArtwork[]>(
        `/api/artworks?seriesID=${encodeURIComponent(seriesId)}`,
        fetchImpl
      );
      results.push(...feralFileArtworkTokens(artworks ?? []));
    }
    return results;
  }
  if (parsed.urlKind === 'series') {
    const series = await fetchFeralFileApi<FeralFileSeries>(
      `/api/series/${encodeURIComponent(parsed.identifier)}`,
      fetchImpl
    );
    if (!series?.id) {
      return [];
    }
    const artworks = await fetchFeralFileApi<FeralFileArtwork[]>(
      `/api/artworks?seriesID=${encodeURIComponent(series.id)}`,
      fetchImpl
    );
    return feralFileArtworkTokens(artworks ?? []);
  }
  return [];
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
