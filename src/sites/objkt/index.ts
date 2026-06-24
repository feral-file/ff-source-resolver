import type { ParsedFindInput, SourceSiteAdapter } from '../../types';
import { parseObjktCollection } from './pages/collection';
import { extractObjktTokenFromHtml, parseObjktToken } from './pages/token';

/**
 * objktAdapter owns Objkt URL and page extraction rules.
 */
export const objktAdapter: SourceSiteAdapter = {
  source: 'objkt',
  hosts: ['objkt.com'],
  parseUrl(url: URL): ParsedFindInput {
    return (
      parseObjktToken(url) ??
      parseObjktCollection(url) ?? {
        kind: 'unsupported',
        reason: `Objkt URL not recognized: ${url.pathname}. Expected /tokens/{contract-or-alias}/{tokenId}.`,
      }
    );
  },
  extractFromHtml(url: URL, html: string): ParsedFindInput | null {
    return extractObjktTokenFromHtml(url, html);
  },
};
