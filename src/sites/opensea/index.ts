import type { ParsedFindInput, SourceSiteAdapter } from '../../types';
import { htmlTokenResult } from '../../site-utils';
import { parseOpenSeaCollection } from './pages/collection';
import { extractOpenSeaEmbeddedItems } from './pages/embedded-items';
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
    return extractOpenSeaEmbeddedItems(html) ?? htmlTokenResult(this, html);
  },
};
