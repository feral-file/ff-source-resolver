import type { ParsedFindInput } from '../../../types';

/**
 * parseNeortArt parses Neort art pages. Neort is off-chain, so the result is
 * an art id marker rather than token coordinates.
 */
export function parseNeortArt(url: URL): ParsedFindInput | null {
  const m = /^\/(?:[a-z]{2}\/)?art\/([a-zA-Z0-9]+)\/?$/.exec(url.pathname);
  if (m) {
    return { kind: 'neort-art', id: m[1] };
  }
  return null;
}
