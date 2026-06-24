import type { ParsedFindInput } from '../../../types';

/**
 * parseFeralFileSeries parses public Feral File series URLs.
 */
export function parseFeralFileSeries(url: URL): ParsedFindInput | null {
  const m = /^\/exhibitions\/series\/([^/]+)\/?$/.exec(url.pathname);
  if (m) {
    return { kind: 'ff-url', urlKind: 'series', identifier: m[1] };
  }
  return null;
}
