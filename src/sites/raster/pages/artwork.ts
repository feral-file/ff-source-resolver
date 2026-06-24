import type { ParsedFindInput } from '../../../types';

/**
 * parseRasterArtwork parses Raster artwork pages. Raster is a series resolver
 * in the CLI, so this parser returns the slug marker rather than coordinates.
 */
export function parseRasterArtwork(url: URL): ParsedFindInput | null {
  const m = /^\/artwork\/([A-Za-z0-9][A-Za-z0-9_-]*)\/?$/.exec(url.pathname);
  if (m) {
    return { kind: 'raster-artwork', slug: m[1] };
  }
  return null;
}
