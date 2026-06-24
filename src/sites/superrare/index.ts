import type { ParsedFindInput, SourceSiteAdapter } from '../../types';
import { htmlTokenResult } from '../../site-utils';
import { parseSuperRareArtwork } from './pages/artwork';
import { parseSuperRareCollection } from './pages/collection';

/**
 * superRareAdapter owns SuperRare URL and page extraction rules.
 */
export const superRareAdapter: SourceSiteAdapter = {
  source: 'superrare',
  hosts: ['superrare.com'],
  parseUrl(url: URL): ParsedFindInput {
    return (
      parseSuperRareArtwork(url) ??
      parseSuperRareCollection(url) ?? {
        kind: 'unsupported',
        reason:
          `SuperRare URL not recognized: ${url.pathname}. Expected ` +
          '/artwork/eth/{contract}/{tokenId}. For artist-slug URLs, paste the canonical ' +
          '/artwork/eth/... form (the SuperRare detail page links it under the artwork title).',
      }
    );
  },
  extractFromHtml(url: URL, html: string): ParsedFindInput | null {
    return htmlTokenResult(this, html);
  },
};
