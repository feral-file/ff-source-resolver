import { normalizeParsedFindInput, normalizeParsedFindInputs } from './helpers';
import { parseFindInput } from './parse';
import { matchSite } from './site-utils';
import { siteAdapters } from './sites';
import type {
  ParsedFindInput,
  ResolveTokenInfoOptions,
  ResolveTokenInfosOptions,
  SingleTokenFindingsResult,
  TokenInfoResolution,
  TokenInfoResolutionMethod,
  TokenFindingsResult,
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
  options: ResolveTokenInfosOptions = {}
): Promise<TokenInfosResolution> {
  const limit = normalizeResolveTokenInfosLimit(options.limit);
  const parsed = parseFindInput(input);
  if (parsed?.kind === 'token') {
    return {
      kind: 'tokens',
      method: 'url',
      source: parsed.source,
      coords: [parsed.coords],
      title: titleForParsedInput(parsed, null),
    };
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
    const apiFindings = await resolveApiParsedMany(site, url, parsed, options.fetch, fetched, limit);
    const apiTokens = normalizeTokenFindings(apiFindings.findings);
    if (apiTokens.length > 0) {
      return tokensResolution(
        'api',
        apiTokens,
        bestFetchedTitle(site, url, parsed, fetched, apiFindings.title),
        limit,
        apiFindings.hasMore
      );
    }
    return tokensResolution('dom', domTokens, bestFetchedTitle(site, url, parsed, fetched), limit);
  }

  if (options.renderer) {
    const rendered = await options.renderer.render(url.toString());
    const renderedTokens = rendered
      ? normalizeTokenFindings(extractTokenFindings(site, url, rendered))
      : [];
    if (renderedTokens.length > 0) {
      const apiFindings = await resolveApiParsedMany(
        site,
        url,
        parsed,
        options.fetch,
        rendered ?? fetched,
        limit
      );
      const apiTokens = normalizeTokenFindings(apiFindings.findings);
      if (apiTokens.length > 0) {
        return tokensResolution(
          'api',
          apiTokens,
          bestFetchedTitle(site, url, parsed, rendered ?? fetched ?? null, apiFindings.title),
          limit,
          apiFindings.hasMore
        );
      }
      return tokensResolution(
        'headless',
        renderedTokens,
        bestFetchedTitle(site, url, parsed, rendered ?? fetched ?? null),
        limit
      );
    }
  }

  const apiFindings = await resolveApiParsedMany(site, url, parsed, options.fetch, fetched, limit);
  const apiTokens = normalizeTokenFindings(apiFindings.findings);
  if (apiTokens.length > 0) {
    return tokensResolution(
      'api',
      apiTokens,
      bestFetchedTitle(site, url, parsed, fetched, apiFindings.title),
      limit,
      apiFindings.hasMore
    );
  }

  return {
    kind: 'not-found',
    reason: 'Could not extract token information from URL, static DOM, rendered page, or API.',
  };
}

function tokensResolution(
  method: TokenInfoResolutionMethod,
  tokens: Array<Extract<ParsedFindInput, { kind: 'token' }>>,
  title?: string,
  limit?: number,
  sourceHasMore = false
): TokenInfosResolution {
  const limited = limit == null ? tokens : tokens.slice(0, limit);
  const hasMore = sourceHasMore || (limit != null && tokens.length > limit);
  return {
    kind: 'tokens',
    method,
    source: limited[0].source,
    coords: limited.map((t) => t.coords),
    ...(title ? { title } : {}),
    ...(hasMore ? { hasMore } : {}),
  };
}

/**
 * normalizeResolveTokenInfosLimit validates limit once at the public boundary
 * so site adapters can trust it when sizing API pages. A positive integer
 * keeps the result contract unambiguous: token URLs always return their one
 * coordinate, and collection calls return between one and limit coordinates.
 */
function normalizeResolveTokenInfosLimit(limit: number | undefined): number | undefined {
  if (limit == null) {
    return undefined;
  }
  if (!Number.isInteger(limit) || limit < 1) {
    throw new TypeError(`resolveTokenInfos limit must be a positive integer, got ${limit}.`);
  }
  return limit;
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
    const result = normalizeSingleTokenFindingsResult(await site.resolveFromApi(url, parsed, doFetch));
    return normalizeParsedFindInput(result.finding);
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
  fetchImpl: typeof fetch | undefined,
  html?: string | null,
  limit?: number
): Promise<{ findings: readonly ParsedFindInput[]; title?: string; hasMore?: boolean }> {
  const doFetch = fetchImpl ?? globalThis.fetch;
  if (!doFetch) {
    return { findings: [] };
  }
  try {
    if (site.resolveTokensFromApi) {
      const result = normalizeTokenFindingsResult(
        await site.resolveTokensFromApi(url, parsed, doFetch, { html, limit })
      );
      if (result.findings.length > 0) {
        return result;
      }
    }
    if (site.resolveFromApi) {
      const result = normalizeSingleTokenFindingsResult(await site.resolveFromApi(url, parsed, doFetch));
      return {
        findings: result.finding ? [result.finding] : [],
        ...(result.title ? { title: result.title } : {}),
      };
    }
  } catch {
    return { findings: [] };
  }
  return { findings: [] };
}

function normalizeTokenFindingsResult(result: TokenFindingsResult): {
  findings: readonly ParsedFindInput[];
  title?: string;
  hasMore?: boolean;
} {
  return 'findings' in result
    ? {
        findings: result.findings,
        ...(result.title ? { title: result.title } : {}),
        ...(result.hasMore ? { hasMore: result.hasMore } : {}),
      }
    : { findings: result };
}

function normalizeSingleTokenFindingsResult(result: SingleTokenFindingsResult): {
  finding: ParsedFindInput | null;
  title?: string;
} {
  return result && 'finding' in result
    ? { finding: result.finding, ...(result.title ? { title: result.title } : {}) }
    : { finding: result };
}

function bestFetchedTitle(
  site: NonNullable<ReturnType<typeof matchSite>>,
  url: URL,
  parsed: ParsedFindInput | null,
  html: string | null,
  apiTitle?: string
): string | undefined {
  return (
    normalizeTitle(apiTitle) ??
    (html ? fetchedHtmlTitle(site, url, parsed, html) : null) ??
    titleForParsedInput(parsed, null)
  );
}

function fetchedHtmlTitle(
  site: NonNullable<ReturnType<typeof matchSite>>,
  url: URL,
  parsed: ParsedFindInput | null,
  html: string
): string | null {
  const adapterTitle = normalizeTitle(site.extractTitleFromHtml?.(url, html, parsed) ?? undefined);
  if (adapterTitle) {
    return adapterTitle;
  }
  const htmlTitle = extractHtmlTitle(html);
  return htmlTitle ? normalizeMarketplaceTitle(htmlTitle, site.source) : null;
}

function titleForParsedInput(parsed: ParsedFindInput | null, html: string | null): string | undefined {
  const htmlTitle = html ? extractHtmlTitle(html) : null;
  if (htmlTitle) {
    return htmlTitle;
  }
  if (!parsed) {
    return undefined;
  }
  if (parsed.kind === 'token') {
    return `${chainTitle(parsed.coords.chain)} ${shortContract(parsed.coords.contract)} #${parsed.coords.tokenId}`;
  }
  if (parsed.kind === 'objkt-collection') return humanizeIdentifier(parsed.slug);
  if (parsed.kind === 'ab-collection') return humanizeIdentifier(parsed.slug);
  if (parsed.kind === 'os-collection') return humanizeIdentifier(parsed.slug);
  if (parsed.kind === 'fxhash-project') return humanizeIdentifier(parsed.slug);
  if (parsed.kind === 'fxhash-iteration') return humanizeIdentifier(parsed.slug);
  if (parsed.kind === 'verse-series') return humanizeIdentifier(parsed.slug);
  if (parsed.kind === 'raster-artwork') return humanizeIdentifier(parsed.slug);
  if (parsed.kind === 'neort-art') return `Neort ${parsed.id}`;
  if (parsed.kind === 'ff-url') return humanizeIdentifier(parsed.identifier);
  return undefined;
}

function extractHtmlTitle(html: string): string | null {
  const metaTitle =
    metaContent(html, 'property', 'og:title') ??
    metaContent(html, 'name', 'twitter:title') ??
    metaContent(html, 'name', 'title');
  const title = metaTitle ?? /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  return normalizeTitle(title);
}

function normalizeMarketplaceTitle(title: string, source: string): string | null {
  const siteNames: Record<string, readonly string[]> = {
    artblocks: ['Art Blocks'],
    objkt: ['Objkt', 'objkt.com'],
    fxhash: ['fxhash'],
    feralfile: ['Feral File'],
    opensea: ['OpenSea'],
    superrare: ['SuperRare'],
    verse: ['Verse'],
    raster: ['Raster'],
    neort: ['NEORT', 'Neort'],
  };
  let normalized = title;
  for (const siteName of siteNames[source] ?? []) {
    normalized = normalized.replace(new RegExp(`\\s*[|–-]\\s*${escapeRegex(siteName)}\\s*$`, 'i'), '');
    if (normalized.trim().toLowerCase() === siteName.toLowerCase()) {
      return null;
    }
  }
  return normalizeTitle(normalized);
}

function metaContent(html: string, attrName: string, attrValue: string): string | null {
  const tagPattern = new RegExp(`<meta\\b[^>]*\\b${attrName}\\s*=\\s*["']${escapeRegex(attrValue)}["'][^>]*>`, 'i');
  const tag = tagPattern.exec(html)?.[0];
  if (!tag) {
    return null;
  }
  return /\bcontent\s*=\s*(["'])(.*?)\1/i.exec(tag)?.[2] ?? null;
}

function normalizeTitle(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  const decoded = value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
  const title = decoded.replace(/\s+/g, ' ').trim();
  return title || null;
}

function humanizeIdentifier(value: string): string {
  const words = value
    .replace(/[_-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1));
  return words.join(' ');
}

function chainTitle(chain: string): string {
  return chain.charAt(0).toUpperCase() + chain.slice(1);
}

function shortContract(contract: string): string {
  return contract.length > 14 ? `${contract.slice(0, 6)}...${contract.slice(-4)}` : contract;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
