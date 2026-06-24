import type { ParsedFindInput, SourceSiteAdapter } from '../../types';
import { htmlTokenResult } from '../../site-utils';
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
  extractFromHtml(url: URL, html: string): ParsedFindInput | null {
    return htmlTokenResult(this, html);
  },
};
