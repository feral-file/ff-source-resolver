import type { ParsedFindInput, SourceSiteAdapter } from '../../types';
import { resolveSuperRareCollectionFromApi } from './pages/api';
import { parseSuperRareArtwork } from './pages/artwork';
import { parseSuperRareCollection } from './pages/collection';
import {
  extractSuperRareCollectionArtwork,
  extractSuperRareCollectionArtworks,
} from './pages/extract-html';

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
    return extractSuperRareCollectionArtwork(url, html);
  },
  extractTokensFromHtml(url: URL, html: string): readonly ParsedFindInput[] {
    return extractSuperRareCollectionArtworks(url, html);
  },
  async resolveTokensFromApi(url, _parsed, fetchImpl): Promise<readonly ParsedFindInput[]> {
    return resolveSuperRareCollectionFromApi(url, fetchImpl);
  },
};
