import type { ParsedFindInput, SourceSiteAdapter } from '../../types';
import { htmlTokenResult } from '../../site-utils';
import { parseRasterArtwork } from './pages/artwork';

/**
 * rasterAdapter owns Raster URL and page extraction rules.
 */
export const rasterAdapter: SourceSiteAdapter = {
  source: 'raster',
  hosts: ['raster.art'],
  parseUrl(url: URL): ParsedFindInput {
    return (
      parseRasterArtwork(url) ?? {
        kind: 'unsupported',
        reason: `Raster URL not recognized: ${url.pathname}. Expected /artwork/{slug}.`,
      }
    );
  },
  extractFromHtml(url: URL, html: string): ParsedFindInput | null {
    return htmlTokenResult(this, html);
  },
};
