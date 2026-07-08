import { normalizeParsedFindInput, normalizeParsedFindInputs } from './helpers';
import { parseFindInput } from './parse';
import { matchSite } from './site-utils';
import { siteAdapters } from './sites';
import type {
  ParsedFindInput,
  ResolveTokenInfoOptions,
  TokenInfoResolution,
  TokenInfosResolution,
} from './types';

/**
 * resolveTokenInfo resolves chain, contract address, and token id from an
 * input string using the required fallback order:
 *
 * 1. URL/input parsing.
 * 2. Static DOM lookup via caller-provided or global fetch.
 * 3. Optional headless browser rendering via caller-provided renderer.
 * 4. Narrow public marketplace API lookup where site adapters expose one.
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
    const domParsed = normalizeParsedFindInput(site.extractFromHtml(url, fetched));
    if (domParsed?.kind === 'token') {
      return { kind: 'token', method: 'dom', source: domParsed.source, coords: domParsed.coords };
    }
  }

  if (options.renderer) {
    const rendered = await options.renderer.render(url.toString());
    if (rendered) {
      const renderedParsed = normalizeParsedFindInput(site.extractFromHtml(url, rendered));
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

  const apiParsed = await resolveApiParsed(site, url, parsed, options.fetch);
  if (apiParsed?.kind === 'token') {
    return { kind: 'token', method: 'api', source: apiParsed.source, coords: apiParsed.coords };
  }

  return {
    kind: 'not-found',
    reason: 'Could not extract token information from URL, static DOM, or rendered page.',
  };
}

/**
 * resolveTokenInfos resolves every token coordinate exposed by a source input.
 * Token URLs return a one-item array; collection-like pages may use static DOM,
 * caller-provided rendering, or keyless public APIs to return many tokens.
 */
export async function resolveTokenInfos(
  input: string,
  options: ResolveTokenInfoOptions = {}
): Promise<TokenInfosResolution> {
  const parsed = parseFindInput(input);
  if (parsed?.kind === 'token') {
    return { kind: 'tokens', method: 'url', source: parsed.source, coords: [parsed.coords] };
  }

  const url = parseUrl(input);
  if (!url) {
    return { kind: 'not-found', reason: 'Input is not a URL or raw token coordinate.' };
  }
  const site = matchSite(url, siteAdapters);
  if (!site) {
    return { kind: 'not-found', reason: 'No source adapter is registered for this site.' };
  }

  const fetched = await fetchStaticHtml(url, options.fetch);
  const domTokens = fetched ? normalizeTokenFindings(extractTokenFindings(site, url, fetched)) : [];
  if (domTokens.length > 0) {
    const apiTokens = normalizeTokenFindings(await resolveApiParsedMany(site, url, parsed, options.fetch));
    if (apiTokens.length > 0) {
      return tokensResolution('api', apiTokens);
    }
    return { kind: 'tokens', method: 'dom', source: domTokens[0].source, coords: domTokens.map((t) => t.coords) };
  }

  if (options.renderer) {
    const rendered = await options.renderer.render(url.toString());
    const renderedTokens = rendered
      ? normalizeTokenFindings(extractTokenFindings(site, url, rendered))
      : [];
    if (renderedTokens.length > 0) {
      const apiTokens = normalizeTokenFindings(await resolveApiParsedMany(site, url, parsed, options.fetch));
      if (apiTokens.length > 0) {
        return tokensResolution('api', apiTokens);
      }
      return tokensResolution('headless', renderedTokens);
    }
  }

  const apiTokens = normalizeTokenFindings(await resolveApiParsedMany(site, url, parsed, options.fetch));
  if (apiTokens.length > 0) {
    return tokensResolution('api', apiTokens);
  }

  return {
    kind: 'not-found',
    reason: 'Could not extract token information from URL, static DOM, rendered page, or API.',
  };
}

function tokensResolution(
  method: 'dom' | 'headless' | 'api',
  tokens: Array<Extract<ParsedFindInput, { kind: 'token' }>>
): TokenInfosResolution {
  return { kind: 'tokens', method, source: tokens[0].source, coords: tokens.map((t) => t.coords) };
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

/**
 * resolveApiParsed lets site adapters use public, keyless marketplace APIs
 * after deterministic URL, static DOM, and optional rendered DOM paths miss.
 */
async function resolveApiParsed(
  site: NonNullable<ReturnType<typeof matchSite>>,
  url: URL,
  parsed: ParsedFindInput | null,
  fetchImpl: typeof fetch | undefined
): Promise<ParsedFindInput | null> {
  if (!site.resolveFromApi) {
    return null;
  }
  const doFetch = fetchImpl ?? globalThis.fetch;
  if (!doFetch) {
    return null;
  }
  try {
    return normalizeParsedFindInput(await site.resolveFromApi(url, parsed, doFetch));
  } catch {
    return null;
  }
}

function extractTokenFindings(
  site: NonNullable<ReturnType<typeof matchSite>>,
  url: URL,
  html: string
): readonly ParsedFindInput[] {
  const results: ParsedFindInput[] = [];
  if (site.extractTokensFromHtml) {
    results.push(...site.extractTokensFromHtml(url, html));
  }
  if (site.extractFromHtml) {
    const result = site.extractFromHtml(url, html);
    if (result) {
      results.push(result);
    }
  }
  return results;
}

function normalizeTokenFindings(
  results: readonly ParsedFindInput[]
): Array<Extract<ParsedFindInput, { kind: 'token' }>> {
  return normalizeParsedFindInputs(results).filter(
    (result): result is Extract<ParsedFindInput, { kind: 'token' }> => result.kind === 'token'
  );
}

async function resolveApiParsedMany(
  site: NonNullable<ReturnType<typeof matchSite>>,
  url: URL,
  parsed: ParsedFindInput | null,
  fetchImpl: typeof fetch | undefined
): Promise<readonly ParsedFindInput[]> {
  const doFetch = fetchImpl ?? globalThis.fetch;
  if (!doFetch) {
    return [];
  }
  try {
    if (site.resolveTokensFromApi) {
      const results = await site.resolveTokensFromApi(url, parsed, doFetch);
      if (results.length > 0) {
        return results;
      }
    }
    if (site.resolveFromApi) {
      const result = await site.resolveFromApi(url, parsed, doFetch);
      return result ? [result] : [];
    }
  } catch {
    return [];
  }
  return [];
}
