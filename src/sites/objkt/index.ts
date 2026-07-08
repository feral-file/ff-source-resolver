import type { ParsedFindInput, SourceSiteAdapter, TokenFindingsResult } from '../../types';
import { resolveObjktCollectionFromApi } from './pages/api';
import { parseObjktCollection } from './pages/collection';
import {
  extractObjktCollectionTokensFromHtml,
  extractObjktTokenFromHtml,
  parseObjktToken,
} from './pages/token';

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
  extractTokensFromHtml(url: URL, html: string): readonly ParsedFindInput[] {
    return extractObjktCollectionTokensFromHtml(url, html);
  },
  async resolveTokensFromApi(_url, parsed, fetchImpl): Promise<TokenFindingsResult> {
    return resolveObjktCollectionFromApi(parsed, fetchImpl);
  },
};
