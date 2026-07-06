import type { ParsedFindInput } from '../../../types';

/**
 * parseFxhashIteration parses single-iteration slug pages.
 */
export function parseFxhashIteration(url: URL): ParsedFindInput | null {
  const iter = /^\/iteration\/([a-z0-9][a-z0-9.-]*)\/?$/.exec(url.pathname);
  if (iter) {
    return { kind: 'fxhash-iteration', slug: iter[1] };
  }
  return null;
}
