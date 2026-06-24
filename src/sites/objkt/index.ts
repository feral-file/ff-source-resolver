import type { ParsedFindInput, SourceSiteAdapter } from '../../types';
import { htmlTokenResult } from '../../site-utils';
import { parseObjktCollection } from './pages/collection';
import { parseObjktToken } from './pages/token';

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
    return htmlTokenResult(this, html);
  },
};
