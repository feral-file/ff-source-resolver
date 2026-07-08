import type { ParsedFindInput, SourceSiteAdapter, TokenFindingsResult } from '../../types';
import { parseVerseItem } from './pages/item';
import {
  extractVerseSeriesTokenFromHtml,
  extractVerseSeriesTokensFromHtml,
  parseVerseSeries,
  resolveVerseSeriesFromApi,
} from './pages/series';

/**
 * verseAdapter owns Verse URL and page extraction rules.
 */
export const verseAdapter: SourceSiteAdapter = {
  source: 'verse',
  hosts: ['verse.works'],
  parseUrl(url: URL): ParsedFindInput {
    return (
      parseVerseItem(url) ??
      parseVerseSeries(url) ?? {
        kind: 'unsupported',
        reason:
          `Verse URL not recognized: ${url.pathname}. Expected ` +
          '/items/ethereum/{contract}/{tokenId} or /series/{slug}.',
      }
    );
  },
  extractFromHtml(url: URL, html: string): ParsedFindInput | null {
    if (parseVerseSeries(url)?.kind !== 'verse-series') {
      return null;
    }
    return extractVerseSeriesTokenFromHtml(html);
  },
  extractTokensFromHtml(url: URL, html: string): readonly ParsedFindInput[] {
    if (parseVerseSeries(url)?.kind !== 'verse-series') {
      return [];
    }
    return extractVerseSeriesTokensFromHtml(html);
  },
  async resolveTokensFromApi(_url, parsed, fetchImpl): Promise<TokenFindingsResult> {
    return resolveVerseSeriesFromApi(parsed, fetchImpl);
  },
};
