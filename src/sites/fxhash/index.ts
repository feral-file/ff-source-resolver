import type { ParsedFindInput, SourceSiteAdapter, TokenFindingsResult } from '../../types';
import { resolveFxhashFromApi, resolveFxhashProjectFromApi } from './pages/api';
import { parseFxhashGentk } from './pages/gentk';
import { parseFxhashIteration } from './pages/iteration';
import { parseFxhashProject } from './pages/project';

/**
 * fxhashAdapter owns fxhash URL and page extraction rules.
 */
export const fxhashAdapter: SourceSiteAdapter = {
  source: 'fxhash',
  hosts: ['fxhash.xyz'],
  parseUrl(url: URL): ParsedFindInput {
    return (
      parseFxhashGentk(url) ??
      parseFxhashIteration(url) ??
      parseFxhashProject(url) ?? {
        kind: 'unsupported',
        reason: `fxhash URL not recognized: ${url.pathname}.`,
      }
    );
  },
  extractFromHtml(): ParsedFindInput | null {
    // fxhash project and iteration pages do not expose FX1 coordinates in a
    // stable, narrow DOM scope. Keep page inspection disabled instead of
    // scanning broad rendered HTML or embedded app state.
    return null;
  },
  async resolveFromApi(_url, parsed, fetchImpl): Promise<ParsedFindInput | null> {
    return resolveFxhashFromApi(parsed, fetchImpl);
  },
  async resolveTokensFromApi(_url, parsed, fetchImpl): Promise<TokenFindingsResult> {
    return resolveFxhashProjectFromApi(parsed, fetchImpl);
  },
};
