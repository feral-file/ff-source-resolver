import type { ParsedFindInput } from '../../../types';

/**
 * parseArtBlocksLegacyProject handles the old `/projects/{id}` route with a
 * specific unsupported result so callers can give useful guidance.
 */
export function parseArtBlocksLegacyProject(url: URL): ParsedFindInput | null {
  if (url.pathname.startsWith('/projects/')) {
    return {
      kind: 'unsupported',
      reason:
        'Art Blocks `/projects/{id}` URLs are legacy and no longer resolve on artblocks.io. ' +
        'Paste the current `/collection/{slug}` URL or a specific token URL.',
    };
  }
  return null;
}
