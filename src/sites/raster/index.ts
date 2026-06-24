import type { ParsedFindInput, SourceSiteAdapter } from '../../types';
import { extractRasterArtworkTokenFromHtml, parseRasterArtwork } from './pages/artwork';
import { parseRasterToken } from './pages/token';

/**
 * rasterAdapter owns Raster URL and page extraction rules.
 */
export const rasterAdapter: SourceSiteAdapter = {
  source: 'raster',
  hosts: ['raster.art'],
  parseUrl(url: URL): ParsedFindInput {
    return (
      parseRasterToken(url) ??
      parseRasterArtwork(url) ?? {
        kind: 'unsupported',
        reason: `Raster URL not recognized: ${url.pathname}. Expected /artwork/{slug}.`,
      }
    );
  },
  extractFromHtml(url: URL, html: string): ParsedFindInput | null {
    return extractRasterArtworkTokenFromHtml(url, html);
  },
};
