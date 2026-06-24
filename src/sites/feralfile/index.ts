import type { ParsedFindInput, SourceSiteAdapter } from '../../types';
import { parseFeralFileArtwork } from './pages/artwork';
import { parseFeralFileSeries } from './pages/series';
import { parseFeralFileShow } from './pages/show';

/**
 * feralFileAdapter owns Feral File URL and page extraction rules.
 */
export const feralFileAdapter: SourceSiteAdapter = {
  source: 'feralfile',
  hosts: ['feralfile.com'],
  parseUrl(url: URL): ParsedFindInput {
    return (
      parseFeralFileArtwork(url) ??
      parseFeralFileSeries(url) ??
      parseFeralFileShow(url) ?? {
        kind: 'unsupported',
        reason:
          `Feral File URL not recognized: ${url.pathname}. Supported: ` +
          '/exhibitions/artwork/{tokenId}, /exhibitions/series/{slug}, /exhibitions/shows/{slug}.',
      }
    );
  },
};
