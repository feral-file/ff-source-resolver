import type { ParsedFindInput, SourceSiteAdapter } from '../../types';
import { parseNeortArt } from './pages/art';

/**
 * neortAdapter owns Neort URL rules.
 */
export const neortAdapter: SourceSiteAdapter = {
  source: 'neort',
  hosts: ['neort.io'],
  parseUrl(url: URL): ParsedFindInput {
    return (
      parseNeortArt(url) ?? {
        kind: 'unsupported',
        reason: `Neort URL not recognized: ${url.pathname}. Expected /art/{id}.`,
      }
    );
  },
};
