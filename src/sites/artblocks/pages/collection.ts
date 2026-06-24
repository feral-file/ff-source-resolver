import type { ParsedFindInput } from '../../../types';

/**
 * parseArtBlocksCollection parses collection slug URLs. The slug still needs
 * a live Art Blocks resolver to pick a representative token.
 */
export function parseArtBlocksCollection(url: URL): ParsedFindInput | null {
  const m = /^\/collections?\/([a-z0-9][a-z0-9-]*)\/?$/.exec(url.pathname);
  if (m) {
    return { kind: 'ab-collection', slug: m[1] };
  }
  return null;
}
