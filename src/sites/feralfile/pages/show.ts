import type { ParsedFindInput } from '../../../types';

/**
 * parseFeralFileShow parses public Feral File show URLs.
 */
export function parseFeralFileShow(url: URL): ParsedFindInput | null {
  const m = /^\/exhibitions\/shows\/([^/]+)\/?$/.exec(url.pathname);
  if (m) {
    return { kind: 'ff-url', urlKind: 'show', identifier: m[1] };
  }
  return null;
}
