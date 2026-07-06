export type IndexerChain = 'ethereum' | 'tezos';

export interface TokenCoords {
  chain: IndexerChain;
  contract: string;
  tokenId: string;
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
  resolveFromApi?(
    url: URL,
    parsed: ParsedFindInput | null,
    fetchImpl: typeof fetch
  ): Promise<ParsedFindInput | null>;
}

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
}

export type TokenInfoResolutionMethod = 'url' | 'dom' | 'headless' | 'api';

export type TokenInfoResolution =
  | {
      kind: 'token';
      method: TokenInfoResolutionMethod;
      source: 'raw' | MarketplaceSource;
      coords: TokenCoords;
    }
  | { kind: 'not-found'; reason: string };
