import type {
  ArtworkSourceFinding,
  ResolveArtworkSourcesContext,
  TokenCoords,
} from '../../../types';
import { extractRasterArtworkId, parseRasterArtwork } from './artwork';
import { parseRasterToken } from './token';

const RASTER_KIT_ORIGIN = 'https://kit.raster.art';
const RASTER_BITS_ORIGIN = 'https://bits.raster.art';
const MAX_ARTWORK_PAGES = 20;

const RASTER_PAGE_HEADERS = {
  Accept: 'text/html,application/xhtml+xml',
  'Accept-Language': 'en-US,en;q=0.9',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
} as const;

interface RasterMediaMetadata {
  content_url?: string | null;
  media_hash?: string | null;
  media_type?: string | null;
  preview_hash?: string | null;
  preview_type?: string | null;
}

interface RasterTokenDetail {
  metadata?: RasterMediaMetadata | null;
}

interface RasterArtworkToken {
  chain_id?: string;
  contract_address?: string;
  token_id?: string | number;
  metadata?: RasterMediaMetadata | null;
}

interface RasterArtworkTokenPage {
  tokens?: RasterArtworkToken[];
  cursor?: number | string | null;
}

/**
 * resolveRasterArtworkSources uses Raster's keyless kit API. Direct token
 * pages prefer their original content URL, while artwork pages use batched CDN
 * renditions described by each token's preview hash and type.
 */
export async function resolveRasterArtworkSources(
  url: URL,
  coords: readonly TokenCoords[],
  fetchImpl: typeof fetch,
  context?: ResolveArtworkSourcesContext
): Promise<readonly ArtworkSourceFinding[]> {
  const parsedToken = parseRasterToken(url);
  if (parsedToken?.kind === 'token') {
    const coordsByKey = requestedCoords(coords);
    const requested = coordsByKey.get(coordsKey(parsedToken.coords));
    if (!requested) {
      return [];
    }
    const detail = await fetchRasterToken(requested, fetchImpl);
    const artworkSource = detail ? mediaSource(detail.metadata) : null;
    return artworkSource ? [{ coords: requested, artworkSource }] : [];
  }

  if (!parseRasterArtwork(url)) {
    return [];
  }
  const html = context?.html ?? (await fetchRasterHtml(url, fetchImpl));
  const artworkId = html ? extractRasterArtworkId(html) : null;
  if (!artworkId) {
    return [];
  }
  return fetchRasterArtworkSources(artworkId, coords, fetchImpl);
}

async function fetchRasterToken(
  coords: TokenCoords,
  fetchImpl: typeof fetch
): Promise<RasterTokenDetail | null> {
  const endpoint =
    `/token/${encodeURIComponent(coords.chain)}/` +
    `${encodeURIComponent(coords.contract)}/${encodeURIComponent(coords.tokenId)}`;
  return fetchRasterJson<RasterTokenDetail>(endpoint, fetchImpl);
}

async function fetchRasterArtworkSources(
  artworkId: string,
  coords: readonly TokenCoords[],
  fetchImpl: typeof fetch
): Promise<ArtworkSourceFinding[]> {
  const remaining = requestedCoords(coords);
  const results = new Map<string, ArtworkSourceFinding>();
  let cursor = '0';

  for (let pageCount = 0; pageCount < MAX_ARTWORK_PAGES && remaining.size > 0; pageCount += 1) {
    const apiUrl = new URL(`/artwork/${encodeURIComponent(artworkId)}/tokens`, RASTER_KIT_ORIGIN);
    apiUrl.searchParams.set('cursor', cursor);
    apiUrl.searchParams.set('page_size', '100');
    apiUrl.searchParams.set('sort', 'listing');
    apiUrl.searchParams.set('sort_direction', 'asc');

    const page = await fetchRasterUrlJson<RasterArtworkTokenPage>(apiUrl, fetchImpl);
    const tokens = page?.tokens ?? [];
    if (tokens.length === 0) {
      break;
    }
    for (const token of tokens) {
      const key = rasterTokenKey(token);
      const requested = key ? remaining.get(key) : undefined;
      if (key && requested) {
        remaining.delete(key);
        const artworkSource = mediaSource(token.metadata);
        if (artworkSource) {
          results.set(key, { coords: requested, artworkSource });
        }
      }
    }

    const nextCursor = page?.cursor == null ? '' : String(page.cursor);
    if (!nextCursor || nextCursor === cursor) {
      break;
    }
    cursor = nextCursor;
  }

  return coords.flatMap((value) => {
    const finding = results.get(coordsKey(value));
    return finding ? [finding] : [];
  });
}

async function fetchRasterHtml(url: URL, fetchImpl: typeof fetch): Promise<string | null> {
  try {
    const response = await fetchImpl(url.toString(), { headers: RASTER_PAGE_HEADERS });
    return response.ok ? await response.text() : null;
  } catch {
    return null;
  }
}

async function fetchRasterJson<T>(path: string, fetchImpl: typeof fetch): Promise<T | null> {
  return fetchRasterUrlJson(new URL(path, RASTER_KIT_ORIGIN), fetchImpl);
}

async function fetchRasterUrlJson<T>(url: URL, fetchImpl: typeof fetch): Promise<T | null> {
  try {
    const response = await fetchImpl(url.toString(), { headers: { Accept: 'application/json' } });
    return response.ok ? ((await response.json().catch(() => null)) as T | null) : null;
  } catch {
    return null;
  }
}

function mediaSource(metadata: RasterMediaMetadata | null | undefined): string | null {
  const original = browserContentUrl(metadata?.content_url);
  if (original) {
    return original;
  }
  return (
    rasterPreviewUrl(metadata?.media_hash, metadata?.media_type) ??
    rasterPreviewUrl(metadata?.preview_hash, metadata?.preview_type)
  );
}

function browserContentUrl(value: string | null | undefined): string | null {
  const candidate = value?.trim();
  if (!candidate) {
    return null;
  }
  if (candidate.startsWith('ipfs://')) {
    const path = candidate.slice('ipfs://'.length).replace(/^ipfs\//, '');
    return path ? `https://ipfs.io/ipfs/${path}` : null;
  }
  if (candidate.startsWith('ar://')) {
    const path = candidate.slice('ar://'.length);
    return path ? `https://arweave.net/${path}` : null;
  }
  try {
    const url = new URL(candidate);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * rasterPreviewUrl builds the largest documented playable rendition for a
 * Raster media handler. Animated types use animated AVIF, SVG preserves the
 * original vector, and still images use their largest generated rendition.
 */
function rasterPreviewUrl(
  previewHash: string | null | undefined,
  previewType: string | null | undefined
): string | null {
  const hash = previewHash?.trim();
  const type = previewType?.trim().toLowerCase();
  if (!hash || !/^[A-Fa-f0-9]{8,}$/.test(hash) || !type) {
    return null;
  }

  let filename: string;
  if (type.startsWith('svg/')) {
    filename = 'original';
  } else if (type.startsWith('gif/') || type.startsWith('video/')) {
    filename = '1500-anim.avif';
  } else if (type === 'image/1') {
    filename = '1500.avif';
  } else if (type.startsWith('image/') || type.startsWith('image-pixelart/')) {
    filename = '7200.avif';
  } else {
    return null;
  }

  return `${RASTER_BITS_ORIGIN}/${hash.slice(0, 4)}/${hash}/${filename}`;
}

function rasterTokenKey(token: RasterArtworkToken): string | null {
  const chain =
    token.chain_id === 'eip155:1'
      ? 'ethereum'
      : token.chain_id?.startsWith('tezos:') || token.chain_id === 'tezos'
        ? 'tezos'
        : null;
  if (!chain || !token.contract_address || token.token_id == null) {
    return null;
  }
  return coordsKey({
    chain,
    contract: token.contract_address,
    tokenId: String(token.token_id),
  });
}

function requestedCoords(coords: readonly TokenCoords[]): Map<string, TokenCoords> {
  return new Map(coords.map((value) => [coordsKey(value), value]));
}

function coordsKey(coords: TokenCoords): string {
  // Ethereum hex addresses are case-insensitive after validation, while Tezos
  // Base58 contracts must retain their exact casing.
  const contract = coords.chain === 'ethereum' ? coords.contract.toLowerCase() : coords.contract;
  return `${coords.chain}:${contract}:${coords.tokenId}`;
}
