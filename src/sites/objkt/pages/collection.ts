import type { ParsedFindInput } from '../../../types';

/**
 * parseObjktCollection recognizes Objkt collection pages. Current collection
 * token links use aliases, so rendered HTML extraction discovers the KT1
 * collection contract before building token coordinates.
 */
export function parseObjktCollection(url: URL): ParsedFindInput | null {
  const m = /^\/collections?\/([A-Za-z0-9][A-Za-z0-9_-]*)\/?$/.exec(url.pathname);
  if (m) {
    return { kind: 'objkt-collection', slug: m[1] };
  }
  return null;
}
