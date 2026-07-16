export type IndexerChain = 'ethereum' | 'tezos';

export interface TokenCoords {
  chain: IndexerChain;
  contract: string;
  tokenId: string;
}

/**
 * ArtworkSourceFinding pairs token identity with a browser-loadable artwork
 * URL returned by a marketplace page or keyless public API.
 */
export interface ArtworkSourceFinding {
  coords: TokenCoords;
  artworkSource: string;
}

export type MarketplaceSource =
  | 'objkt'
  | 'artblocks'
  | 'fxhash'
  | 'feralfile'
  | 'opensea'
  | 'superrare'
  | 'neort'
  | 'verse'
  | 'raster';

export type FeralFileUrlKind = 'artwork' | 'series' | 'show';

export type ParsedFindInput =
  | { kind: 'token'; coords: TokenCoords; source: 'raw' | MarketplaceSource }
  | { kind: 'address'; chain: IndexerChain; address: string }
  | { kind: 'ff-url'; urlKind: FeralFileUrlKind; identifier: string }
  | { kind: 'objkt-collection'; slug: string }
  | { kind: 'objkt-alias'; alias: string; tokenId: string }
  | { kind: 'ab-collection'; slug: string }
  | { kind: 'os-collection'; slug: string }
  | { kind: 'fxhash-iteration'; slug: string }
  | { kind: 'fxhash-project'; slug: string }
  | { kind: 'neort-art'; id: string }
  | { kind: 'verse-series'; slug: string }
  | { kind: 'raster-artwork'; slug: string }
  | { kind: 'unsupported'; reason: string };

export interface SourceSiteAdapter {
  readonly source: MarketplaceSource;
  readonly hosts: readonly string[];
  parseUrl(url: URL): ParsedFindInput;
  extractFromHtml?(url: URL, html: string): ParsedFindInput | null;
  extractTokensFromHtml?(url: URL, html: string): readonly ParsedFindInput[];
  extractTitleFromHtml?(url: URL, html: string, parsed: ParsedFindInput | null): string | null;
  resolveFromApi?(
    url: URL,
    parsed: ParsedFindInput | null,
    fetchImpl: typeof fetch
  ): Promise<SingleTokenFindingsResult>;
  resolveTokensFromApi?(
    url: URL,
    parsed: ParsedFindInput | null,
    fetchImpl: typeof fetch,
    context?: ResolveTokensFromApiContext
  ): Promise<TokenFindingsResult>;
  resolveArtworkSources?(
    url: URL,
    coords: readonly TokenCoords[],
    fetchImpl: typeof fetch,
    context?: ResolveArtworkSourcesContext
  ): Promise<readonly ArtworkSourceFinding[]>;
}

export interface ResolveTokensFromApiContext {
  /**
   * html carries the already-fetched page body into API resolvers that need
   * page state such as an internal project id before querying a public API.
   */
  html?: string | null;
  /**
   * limit is the maximum number of usable token findings the caller needs.
   * Adapters should use it to stop pagination early when the source API allows
   * bounded reads, while returning hasMore when additional source tokens exist.
   */
  limit?: number;
}

export interface ResolveArtworkSourcesContext {
  html?: string | null;
}

export type TokenFindingsResult =
  | readonly ParsedFindInput[]
  | {
      findings: readonly ParsedFindInput[];
      title?: string;
      hasMore?: boolean;
    };

export type SingleTokenFindingsResult =
  | ParsedFindInput
  | null
  | {
      finding: ParsedFindInput | null;
      title?: string;
    };

/**
 * HeadlessPageRenderer is the vendor-neutral browser hook used after URL
 * parsing and static DOM lookup miss. Implementations return rendered HTML;
 * callers choose and operate the browser infrastructure outside this package.
 */
export interface HeadlessPageRenderer {
  render(url: string): Promise<string | null>;
}

export interface ResolveTokenInfoOptions {
  fetch?: typeof fetch;
  renderer?: HeadlessPageRenderer;
  /**
   * Resolves browser-loadable artwork URLs in addition to token coordinates.
   * This may inspect page content or call a keyless marketplace API.
   */
  includeArtworkSource?: boolean;
}

/**
 * ResolveTokenInfosOptions configures collection-style token resolution.
 * limit bounds the number of token coordinates returned while preserving the
 * source fallback order and hasMore reporting.
 */
export interface ResolveTokenInfosOptions extends ResolveTokenInfoOptions {
  limit?: number;
}

export type TokenInfoResolutionMethod = 'url' | 'dom' | 'headless' | 'api';

export type TokenInfoResolution =
  | {
      kind: 'token';
      method: TokenInfoResolutionMethod;
      source: 'raw' | MarketplaceSource;
      coords: TokenCoords;
      artworkSource?: string;
    }
  | { kind: 'not-found'; reason: string };

export type TokenInfosResolution =
  | {
      kind: 'tokens';
      method: TokenInfoResolutionMethod;
      source: 'raw' | MarketplaceSource;
      coords: TokenCoords[];
      title?: string;
      hasMore?: boolean;
      artworkSources?: ArtworkSourceFinding[];
    }
  | { kind: 'not-found'; reason: string };
