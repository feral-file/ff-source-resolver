import type { ParsedFindInput } from '../../../types';

/**
 * parseFeralFileArtwork parses public Feral File artwork URLs. The public id
 * needs the Feral File API to derive on-chain coordinates.
 */
export function parseFeralFileArtwork(url: URL): ParsedFindInput | null {
  const m = /^\/exhibitions\/artwork\/([A-Za-z0-9]+)\/?$/.exec(url.pathname);
  if (m) {
    return { kind: 'ff-url', urlKind: 'artwork', identifier: m[1] };
  }
  return null;
}
