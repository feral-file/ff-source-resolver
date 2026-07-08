import type { ParsedFindInput, SourceSiteAdapter } from '../../types';
import { resolveOpenSeaCollectionFromApi } from './pages/api';
import { parseOpenSeaCollection } from './pages/collection';
import { extractOpenSeaEmbeddedItems, extractOpenSeaEmbeddedItemTokens } from './pages/embedded-items';
import { parseOpenSeaItem } from './pages/item';

/**
 * openSeaAdapter owns OpenSea URL and page extraction rules.
 */
export const openSeaAdapter: SourceSiteAdapter = {
  source: 'opensea',
  hosts: ['opensea.io'],
  parseUrl(url: URL): ParsedFindInput {
    return (
      parseOpenSeaItem(url) ??
      parseOpenSeaCollection(url) ?? {
        kind: 'unsupported',
        reason: `OpenSea URL not recognized: ${url.pathname}.`,
      }
    );
  },
  extractFromHtml(url: URL, html: string): ParsedFindInput | null {
    if (parseOpenSeaCollection(url)?.kind !== 'os-collection') {
      return null;
    }
    return extractOpenSeaEmbeddedItems(html);
  },
  extractTokensFromHtml(url: URL, html: string): readonly ParsedFindInput[] {
    if (parseOpenSeaCollection(url)?.kind !== 'os-collection') {
      return [];
    }
    return extractOpenSeaEmbeddedItemTokens(html);
  },
  async resolveTokensFromApi(url, parsed, fetchImpl): Promise<readonly ParsedFindInput[]> {
    return resolveOpenSeaCollectionFromApi(url, parsed, fetchImpl);
  },
};
