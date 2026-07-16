import type {
  ArtworkSourceFinding,
  ResolveArtworkSourcesContext,
  TokenCoords,
} from '../../../types';
import { parseVerseSeries } from './series';

const VERSE_GRAPHQL_ENDPOINT = 'https://verse.works/query';
const APOLLO_TRANSPORT_MARKER = 'ApolloSSRDataTransport';
const VERSE_IPFS_GATEWAY = 'https://ipfs.verse.works/ipfs/';
const MAX_JSON_DEPTH = 100;

const SERIES_ARTWORK_SOURCES_QUERY = `
  query ResolveVerseArtworkSources($slug: String!) {
    collectionsPage(request: { filter: { slugs: [$slug] }, first: 1 }) {
      nodes {
        artworks {
          editions {
            tokenId
            contractInfo {
              chain
              contractAddress
            }
            staticAsset {
              __typename
              ... on IFrameAsset {
                iframeUrl
                baseUrl
                previewImageUrl
              }
              ... on VideoAsset {
                baseUrl
                previewImageUrl
              }
              ... on SVGAsset {
                baseUrl
                previewImageUrl
              }
              ... on ImageAsset {
                baseUrl
              }
            }
          }
        }
      }
    }
  }
`;

interface VerseSourceEdition {
  tokenId?: string | number | null;
  contractInfo?: {
    chain?: string | null;
    contractAddress?: string | null;
  } | null;
  staticAsset?: VerseStaticAsset | null;
}

interface VerseStaticAsset {
  __typename?: string | null;
  iframeUrl?: string | null;
  baseUrl?: string | null;
  previewImageUrl?: string | null;
}

interface VerseArtworkSourcesResponse {
  data?: {
    collectionsPage?: {
      nodes?: Array<{
        artworks?: Array<{
          editions?: Array<VerseSourceEdition | null> | null;
        } | null> | null;
      } | null> | null;
    } | null;
  };
}

/**
 * resolveVerseArtworkSources resolves playable edition assets from Verse's
 * keyless page hydration or public GraphQL endpoint. Page HTML is inspected
 * first; series pages use one collection query for all requested editions.
 */
export async function resolveVerseArtworkSources(
  url: URL,
  coords: readonly TokenCoords[],
  fetchImpl: typeof fetch,
  context?: ResolveArtworkSourcesContext
): Promise<ArtworkSourceFinding[]> {
  const requested = new Map(
    coords
      .filter(({ chain }) => chain === 'ethereum')
      .map((tokenCoords) => [coordsKey(tokenCoords), tokenCoords] as const)
  );
  const findings = new Map<string, ArtworkSourceFinding>();

  if (context?.html) {
    addVerseSourceFindings(extractVersePageEditions(context.html), requested, findings);
  }

  const parsedSeries = parseVerseSeries(url);
  if (parsedSeries?.kind === 'verse-series' && findings.size < requested.size) {
    const editions = await fetchVerseSeriesSources(parsedSeries.slug, fetchImpl);
    addVerseSourceFindings(editions, requested, findings);
  } else if (!context?.html && findings.size < requested.size) {
    const html = await fetchVerseHtml(url, fetchImpl);
    if (html) {
      addVerseSourceFindings(extractVersePageEditions(html), requested, findings);
    }
  }

  return coords.flatMap((tokenCoords) => {
    const finding = findings.get(coordsKey(tokenCoords));
    return finding ? [finding] : [];
  });
}

async function fetchVerseSeriesSources(
  slug: string,
  fetchImpl: typeof fetch
): Promise<VerseSourceEdition[]> {
  const response = await fetchImpl(VERSE_GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: SERIES_ARTWORK_SOURCES_QUERY,
      variables: { slug },
    }),
  });
  if (!response.ok) {
    return [];
  }

  const body = (await response.json().catch(() => null)) as VerseArtworkSourcesResponse | null;
  const editions: VerseSourceEdition[] = [];
  for (const collection of body?.data?.collectionsPage?.nodes ?? []) {
    for (const artwork of collection?.artworks ?? []) {
      for (const edition of artwork?.editions ?? []) {
        if (edition) {
          editions.push(edition);
        }
      }
    }
  }
  return editions;
}

async function fetchVerseHtml(url: URL, fetchImpl: typeof fetch): Promise<string | null> {
  const response = await fetchImpl(url.toString(), {
    headers: { Accept: 'text/html,application/xhtml+xml' },
  });
  if (!response.ok) {
    return null;
  }
  return response.text();
}

function addVerseSourceFindings(
  editions: readonly VerseSourceEdition[],
  requested: ReadonlyMap<string, TokenCoords>,
  findings: Map<string, ArtworkSourceFinding>
): void {
  for (const edition of editions) {
    if (edition.contractInfo?.chain !== 'ETHEREUM') {
      continue;
    }
    const contract = edition.contractInfo.contractAddress ?? '';
    const tokenId = edition.tokenId == null ? '' : String(edition.tokenId);
    const key = coordsKey({ chain: 'ethereum', contract, tokenId });
    const tokenCoords = requested.get(key);
    const artworkSource = verseStaticAssetUrl(edition.staticAsset);
    if (tokenCoords && artworkSource && !findings.has(key)) {
      findings.set(key, { coords: tokenCoords, artworkSource });
    }
  }
}

/**
 * verseStaticAssetUrl mirrors Verse's renderer: interactive iframe URLs are
 * live artwork, while video, SVG, and image assets use their original base URL.
 * Preview images are retained only as a fallback.
 */
function verseStaticAssetUrl(asset: VerseStaticAsset | null | undefined): string | null {
  if (!asset) {
    return null;
  }
  switch (asset.__typename) {
    case 'IFrameAsset':
      return playableVerseUrl(asset.iframeUrl, asset.baseUrl, asset.previewImageUrl);
    case 'VideoAsset':
    case 'SVGAsset':
      return playableVerseUrl(asset.baseUrl, asset.previewImageUrl);
    case 'ImageAsset':
      return playableVerseUrl(asset.baseUrl);
    default:
      return playableVerseUrl(asset.iframeUrl, asset.baseUrl, asset.previewImageUrl);
  }
}

function playableVerseUrl(...candidates: Array<string | null | undefined>): string | null {
  for (const candidate of candidates) {
    let value = candidate?.trim();
    if (!value) {
      continue;
    }
    value = value.replaceAll('{{SIZE}}', 'source').replaceAll('@{{FORMAT}}', '');
    if (/^ipfs:\/\//i.test(value)) {
      const path = value.replace(/^ipfs:\/\/(?:ipfs\/)?/i, '').replace(/^\/+/, '');
      if (path) {
        return `${VERSE_IPFS_GATEWAY}${path}`;
      }
    }
    try {
      const parsed = new URL(value);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        return parsed.toString();
      }
    } catch {
      // Try the next media candidate when Verse embeds a malformed URL.
    }
  }
  return null;
}

function extractVersePageEditions(html: string): VerseSourceEdition[] {
  const editions: VerseSourceEdition[] = [];
  for (const payload of extractApolloPayloads(html)) {
    collectVerseEditions(payload, editions, 0);
  }
  return editions;
}

function extractApolloPayloads(html: string): unknown[] {
  const payloads: unknown[] = [];
  let searchFrom = 0;
  for (;;) {
    const marker = html.indexOf(APOLLO_TRANSPORT_MARKER, searchFrom);
    if (marker < 0) {
      return payloads;
    }
    const push = html.indexOf('.push(', marker);
    if (push < 0 || push - marker > 200) {
      searchFrom = marker + APOLLO_TRANSPORT_MARKER.length;
      continue;
    }
    const objectStart = skipWhitespace(html, push + '.push('.length);
    const objectEnd = findJsonObjectEnd(html, objectStart);
    if (objectEnd < 0) {
      searchFrom = objectStart + 1;
      continue;
    }
    try {
      const objectText = replaceBareUndefined(html.slice(objectStart, objectEnd + 1));
      payloads.push(JSON.parse(objectText) as unknown);
    } catch {
      // Ignore malformed Apollo entries and continue scanning later pushes.
    }
    searchFrom = objectEnd + 1;
  }
}

function collectVerseEditions(value: unknown, editions: VerseSourceEdition[], depth: number): void {
  if (depth > MAX_JSON_DEPTH || value == null || typeof value !== 'object') {
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectVerseEditions(entry, editions, depth + 1);
    }
    return;
  }

  const candidate = value as VerseSourceEdition & { __typename?: string };
  if (
    candidate.__typename === 'Edition' &&
    candidate.tokenId != null &&
    candidate.contractInfo?.contractAddress &&
    candidate.staticAsset
  ) {
    editions.push(candidate);
  }
  for (const entry of Object.values(value)) {
    collectVerseEditions(entry, editions, depth + 1);
  }
}

function replaceBareUndefined(text: string): string {
  let result = '';
  let inString = false;
  let escaped = false;
  for (let cursor = 0; cursor < text.length; ) {
    const char = text[cursor];
    if (inString) {
      result += char;
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      cursor += 1;
      continue;
    }
    if (char === '"') {
      inString = true;
      result += char;
      cursor += 1;
    } else if (text.startsWith('undefined', cursor)) {
      result += 'null';
      cursor += 'undefined'.length;
    } else {
      result += char;
      cursor += 1;
    }
  }
  return result;
}

function skipWhitespace(text: string, start: number): number {
  let cursor = start;
  while (/\s/.test(text[cursor] ?? '')) {
    cursor += 1;
  }
  return cursor;
}

function findJsonObjectEnd(text: string, start: number): number {
  if (text[start] !== '{') {
    return -1;
  }
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let cursor = start; cursor < text.length; cursor += 1) {
    const char = text[cursor];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
    } else if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return cursor;
      }
    }
  }
  return -1;
}

function coordsKey({ chain, contract, tokenId }: TokenCoords): string {
  return `${chain}:${contract.toLowerCase()}:${tokenId}`;
}
