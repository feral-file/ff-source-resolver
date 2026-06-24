import type { ParsedFindInput, SourceSiteAdapter } from '../../types';
import { htmlTokenResult } from '../../site-utils';
import { parseVerseItem } from './pages/item';
import { parseVerseSeries } from './pages/series';

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
    return htmlTokenResult(this, html);
  },
};
