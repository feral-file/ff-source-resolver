import type { ArtworkSourceFinding, TokenCoords } from '../../../types';
import { parseFeralFileArtwork } from './artwork';
import { parseFeralFileSeries } from './series';
import { parseFeralFileShow } from './show';

const FERAL_FILE_ORIGIN = 'https://feralfile.com';
const FERAL_FILE_ASSET_ORIGIN = 'https://cdn.feralfileassets.com';

interface FeralFileApiResponse<T> {
  result?: T;
}

interface FeralFileArtworkSourceRecord {
  id?: string;
  seriesID?: string;
  index?: number;
  chain?: string;
  contractAddress?: string;
  tokenID?: string | number;
  previewURI?: string | null;
  previewDisplay?: { HLS?: string | null } | null;
  metadata?: {
    alternativePreviewURI?: string | null;
    previewCloudFlareURL?: string | null;
  } | null;
}

interface FeralFileSeriesSourceRecord {
  id?: string;
  medium?: string;
  uniquePreviewPath?: string | null;
  previewFile?: { uri?: string | null } | null;
}

interface FeralFileShowSourceRecord {
  series?: Array<FeralFileSeriesSourceRecord | null>;
}

/**
 * resolveFeralFileArtworkSources resolves playable artwork URLs from Feral
 * File's keyless public API. Collection pages are fetched per series so one
 * request covers every artwork in that series.
 */
export async function resolveFeralFileArtworkSources(
  url: URL,
  coords: readonly TokenCoords[],
  fetchImpl: typeof fetch
): Promise<readonly ArtworkSourceFinding[]> {
  const artworkPage = parseFeralFileArtwork(url);
  if (artworkPage?.kind === 'ff-url') {
    const artwork = await fetchFeralFileApi<FeralFileArtworkSourceRecord>(
      `/api/artworks/${encodeURIComponent(artworkPage.identifier)}`,
      fetchImpl
    );
    if (!artwork) {
      return [];
    }
    const series = artwork.seriesID
      ? await fetchSeriesForFallback(artwork, fetchImpl)
      : null;
    return sourceFindings([artwork], coords, series ? new Map([[series.id ?? '', series]]) : undefined);
  }

  const seriesPage = parseFeralFileSeries(url);
  if (seriesPage?.kind === 'ff-url') {
    const series = await fetchFeralFileApi<FeralFileSeriesSourceRecord>(
      `/api/series/${encodeURIComponent(seriesPage.identifier)}`,
      fetchImpl
    );
    if (!series?.id) {
      return [];
    }
    const artworks = await fetchSeriesArtworks(series.id, fetchImpl);
    return sourceFindings(artworks, coords, new Map([[series.id, series]]));
  }

  const showPage = parseFeralFileShow(url);
  if (showPage?.kind === 'ff-url') {
    const show = await fetchFeralFileApi<FeralFileShowSourceRecord>(
      `/api/exhibitions/${encodeURIComponent(showPage.identifier)}`,
      fetchImpl
    );
    const series = (show?.series ?? []).filter(
      (value): value is FeralFileSeriesSourceRecord => Boolean(value?.id)
    );
    const artworkGroups = await Promise.all(
      series.map((value) => fetchSeriesArtworks(value.id ?? '', fetchImpl))
    );
    return sourceFindings(
      artworkGroups.flat(),
      coords,
      new Map(series.map((value) => [value.id ?? '', value]))
    );
  }

  return [];
}

async function fetchSeriesForFallback(
  artwork: FeralFileArtworkSourceRecord,
  fetchImpl: typeof fetch
): Promise<FeralFileSeriesSourceRecord | null> {
  if (artworkSourceUrl(artwork)) {
    return null;
  }
  return fetchFeralFileApi<FeralFileSeriesSourceRecord>(
    `/api/series/${encodeURIComponent(artwork.seriesID ?? '')}`,
    fetchImpl
  );
}

async function fetchSeriesArtworks(
  seriesId: string,
  fetchImpl: typeof fetch
): Promise<FeralFileArtworkSourceRecord[]> {
  return (
    (await fetchFeralFileApi<FeralFileArtworkSourceRecord[]>(
      `/api/artworks?seriesID=${encodeURIComponent(seriesId)}`,
      fetchImpl
    )) ?? []
  );
}

async function fetchFeralFileApi<T>(path: string, fetchImpl: typeof fetch): Promise<T | null> {
  try {
    const response = await fetchImpl(new URL(path, FERAL_FILE_ORIGIN).toString(), {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      return null;
    }
    const body = (await response.json().catch(() => null)) as FeralFileApiResponse<T> | null;
    return body?.result ?? null;
  } catch {
    return null;
  }
}

function sourceFindings(
  artworks: readonly FeralFileArtworkSourceRecord[],
  requestedCoords: readonly TokenCoords[],
  seriesById?: ReadonlyMap<string, FeralFileSeriesSourceRecord>
): ArtworkSourceFinding[] {
  const requested = new Map(requestedCoords.map((coords) => [coordsKey(coords), coords]));
  const findings: ArtworkSourceFinding[] = [];

  for (const artwork of artworks) {
    const key = artworkCoordsKey(artwork);
    const coords = key ? requested.get(key) : undefined;
    const artworkSource = artworkSourceUrl(artwork, seriesById?.get(artwork.seriesID ?? ''));
    if (coords && artworkSource) {
      findings.push({ coords, artworkSource });
    }
  }
  return findings;
}

/**
 * artworkSourceUrl follows Feral File's display precedence: artwork-specific
 * overrides and HLS first, then the original preview asset, then series-level
 * fallbacks. Thumbnail fields are intentionally excluded.
 */
function artworkSourceUrl(
  artwork: FeralFileArtworkSourceRecord,
  series?: FeralFileSeriesSourceRecord
): string | null {
  const direct = firstArtworkUrl([
    artwork.metadata?.alternativePreviewURI,
    artwork.metadata?.previewCloudFlareURL,
    artwork.previewDisplay?.HLS,
    artwork.previewURI,
  ]);
  if (direct) {
    return direct;
  }

  if (series?.uniquePreviewPath && artwork.index != null) {
    const suffix = series.medium === 'software' ? `${artwork.index}/` : String(artwork.index);
    const seriesPreview = browserUrl(`${series.uniquePreviewPath.replace(/\/$/, '')}/${suffix}`);
    if (seriesPreview) {
      return seriesPreview;
    }
  }
  return browserUrl(series?.previewFile?.uri);
}

function firstArtworkUrl(values: readonly (string | null | undefined)[]): string | null {
  for (const value of values) {
    const url = browserUrl(value);
    if (url) {
      return url;
    }
  }
  return null;
}

function browserUrl(value: string | null | undefined): string | null {
  const candidate = value?.trim();
  if (!candidate) {
    return null;
  }
  try {
    const url = new URL(candidate, FERAL_FILE_ASSET_ORIGIN);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    if (url.hostname === 'imagedelivery.net' && /^\/[^/]+\/[^/]+\/?$/.test(url.pathname)) {
      url.pathname = `${url.pathname.replace(/\/$/, '')}/public`;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function artworkCoordsKey(artwork: FeralFileArtworkSourceRecord): string | null {
  if (
    (artwork.chain !== 'ethereum' && artwork.chain !== 'tezos') ||
    !artwork.contractAddress ||
    artwork.tokenID == null
  ) {
    return null;
  }
  return coordsKey({
    chain: artwork.chain,
    contract: artwork.contractAddress,
    tokenId: String(artwork.tokenID),
  });
}

function coordsKey(coords: TokenCoords): string {
  // Ethereum hex addresses are case-insensitive after validation, while Tezos
  // Base58 contracts must retain their exact casing.
  const contract = coords.chain === 'ethereum' ? coords.contract.toLowerCase() : coords.contract;
  return `${coords.chain}:${contract}:${coords.tokenId}`;
}
