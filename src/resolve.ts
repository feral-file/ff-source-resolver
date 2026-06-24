import { parseFindInput } from './parse';
import { matchSite } from './site-utils';
import { siteAdapters } from './sites';
import type { ParsedFindInput, ResolveTokenInfoOptions, TokenInfoResolution } from './types';

/**
 * resolveTokenInfo resolves chain, contract address, and token id from an
 * input string using the required fallback order:
 *
 * 1. URL/input parsing.
 * 2. Static DOM lookup via caller-provided or global fetch.
 * 3. Optional headless browser rendering via caller-provided renderer.
 *
 * The library does not own headless browser infrastructure or secrets; callers
 * provide those adapters when they want rendered-page inspection.
 */
export async function resolveTokenInfo(
  input: string,
  options: ResolveTokenInfoOptions = {}
): Promise<TokenInfoResolution> {
  const parsed = parseFindInput(input);
  if (parsed?.kind === 'token') {
    return { kind: 'token', method: 'url', source: parsed.source, coords: parsed.coords };
  }

  const url = parseUrl(input);
  if (!url) {
    return { kind: 'not-found', reason: 'Input is not a URL or raw token coordinate.' };
  }
  const site = matchSite(url, siteAdapters);
  if (!site?.extractFromHtml) {
    return { kind: 'not-found', reason: 'No static page extractor is registered for this site.' };
  }

  const fetched = await fetchStaticHtml(url, options.fetch);
  if (fetched) {
    const domParsed = site.extractFromHtml(url, fetched);
    if (domParsed?.kind === 'token') {
      return { kind: 'token', method: 'dom', source: domParsed.source, coords: domParsed.coords };
    }
  }

  if (options.renderer) {
    const rendered = await options.renderer.render(url.toString());
    if (rendered) {
      const renderedParsed = site.extractFromHtml(url, rendered);
      if (renderedParsed?.kind === 'token') {
        return {
          kind: 'token',
          method: 'headless',
          source: renderedParsed.source,
          coords: renderedParsed.coords,
        };
      }
    }
  }

  return {
    kind: 'not-found',
    reason: 'Could not extract token information from URL, static DOM, or rendered page.',
  };
}

/**
 * resolveFindInput preserves the CLI's rich parse result while opportunistically
 * using page inspection to turn non-token URL pages into token coordinates.
 */
export async function resolveFindInput(
  input: string,
  options: ResolveTokenInfoOptions = {}
): Promise<ParsedFindInput | null> {
  const parsed = parseFindInput(input);
  if (parsed?.kind === 'token' || parsed?.kind === 'address') {
    return parsed;
  }
  const token = await resolveTokenInfo(input, options);
  if (token.kind === 'token') {
    return { kind: 'token', source: token.source, coords: token.coords };
  }
  return parsed;
}

/**
 * parseUrl parses URL inputs without throwing; callers use null to distinguish
 * non-URL source forms.
 */
function parseUrl(input: string): URL | null {
  try {
    return new URL(input.trim());
  } catch {
    return null;
  }
}

/**
 * fetchStaticHtml retrieves raw HTML only when fetch is available. Failing
 * static fetches intentionally fall through to the optional renderer.
 */
async function fetchStaticHtml(url: URL, fetchImpl: typeof fetch | undefined): Promise<string | null> {
  const doFetch = fetchImpl ?? globalThis.fetch;
  if (!doFetch) {
    return null;
  }
  try {
    const response = await doFetch(url.toString(), {
      headers: { Accept: 'text/html,application/xhtml+xml' },
    });
    if (!response.ok) {
      return null;
    }
    return await response.text();
  } catch {
    return null;
  }
}
