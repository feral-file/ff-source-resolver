import type { ParsedFindInput } from '../../../types';

/**
 * parseFxhashProject parses fxhash project and legacy generative slug pages.
 */
export function parseFxhashProject(url: URL): ParsedFindInput | null {
  const project = /^\/(?:(?:project|generative)\/|project\/id\/)([a-z0-9][a-z0-9-]*)\/?$/.exec(
    url.pathname
  );
  if (project) {
    return { kind: 'fxhash-project', slug: project[1] };
  }
  return null;
}
