import type { ParsedFindInput, SourceSiteAdapter } from '../../types';
import { htmlTokenResult } from '../../site-utils';
import { parseArtBlocksCollection } from './pages/collection';
import { parseArtBlocksLegacyProject } from './pages/legacy-project';
import { parseArtBlocksToken } from './pages/token';

/**
 * artBlocksAdapter owns Art Blocks URL and page extraction rules.
 */
export const artBlocksAdapter: SourceSiteAdapter = {
  source: 'artblocks',
  hosts: ['artblocks.io'],
  parseUrl(url: URL): ParsedFindInput {
    return (
      parseArtBlocksToken(url) ??
      parseArtBlocksCollection(url) ??
      parseArtBlocksLegacyProject(url) ?? {
        kind: 'unsupported',
        reason: `Art Blocks URL not recognized: ${url.pathname}.`,
      }
    );
  },
  extractFromHtml(url: URL, html: string): ParsedFindInput | null {
    return htmlTokenResult(this, html);
  },
};
