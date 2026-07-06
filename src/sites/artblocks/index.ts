import type { ParsedFindInput, SourceSiteAdapter } from '../../types';
import { parseArtBlocksCollection } from './pages/collection';
import { extractArtBlocksTokenFromHtml, extractArtBlocksTokensFromHtml } from './pages/html';
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
    if (parseArtBlocksCollection(url)?.kind !== 'ab-collection') {
      return null;
    }
    return extractArtBlocksTokenFromHtml(url, html);
  },
  extractTokensFromHtml(url: URL, html: string): readonly ParsedFindInput[] {
    return extractArtBlocksTokensFromHtml(url, html);
  },
};
