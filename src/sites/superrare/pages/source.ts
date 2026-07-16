import type {
  ArtworkSourceFinding,
  ResolveArtworkSourcesContext,
  TokenCoords,
} from '../../../types';

const SUPER_RARE_GRAPHQL_ENDPOINT = 'https://api.superrare.com/graphql';
const SUPER_RARE_SOURCE_BATCH_SIZE = 100;
const EMBEDDED_TOKEN_SCAN_CHARS = 8_000;

const ARTWORK_SOURCES_QUERY = `
  query ResolveSuperRareArtworkSources(
    $filter: NftFilterInput!
    $nftPagination: NftPaginationInput
  ) {
    getNfts(filter: $filter, nftPagination: $nftPagination) {
      nfts {
        chainId
        contractAddress
        tokenId
        metadata {
          mediaDetails {
            original {
              html { uri }
              video { uri }
              audio { uri }
              threeD { uri }
              image { uri isAnimated }
            }
          }
          rawMetadata
        }
      }
    }
  }
`;

interface SuperRareMediaResource {
  uri?: string | null;
}

interface SuperRareOriginalMedia {
  html?: SuperRareMediaResource | null;
  video?: SuperRareMediaResource | null;
  audio?: SuperRareMediaResource | null;
  threeD?: SuperRareMediaResource | null;
  image?: (SuperRareMediaResource & { isAnimated?: boolean | null }) | null;
}

interface SuperRareApiNft {
  chainId?: string | number | null;
  contractAddress?: string | null;
  tokenId?: string | number | null;
  metadata?: {
    mediaDetails?: {
      original?: SuperRareOriginalMedia | null;
    } | null;
    rawMetadata?: unknown;
  } | null;
}

interface SuperRareArtworkSourcesResponse {
  data?: {
    getNfts?: {
      nfts?: Array<SuperRareApiNft | null> | null;
    } | null;
  };
}

/**
 * resolveSuperRareArtworkSources resolves original artwork media from the
 * current page payload first, then batches unresolved tokens through
 * SuperRare's public keyless GraphQL API.
 */
export async function resolveSuperRareArtworkSources(
  _url: URL,
  coords: readonly TokenCoords[],
  fetchImpl: typeof fetch,
  context?: ResolveArtworkSourcesContext
): Promise<readonly ArtworkSourceFinding[]> {
  const expected = ethereumCoords(coords);
  if (expected.length === 0) {
    return [];
  }

  const sources = sourcesFromHtml(context?.html ?? null, expected);
  const unresolved = expected.filter((token) => !sources.has(coordsKey(token)));

  for (let offset = 0; offset < unresolved.length; offset += SUPER_RARE_SOURCE_BATCH_SIZE) {
    const batch = unresolved.slice(offset, offset + SUPER_RARE_SOURCE_BATCH_SIZE);
    const nfts = await fetchArtworkSourceBatch(batch, fetchImpl);
    collectApiSources(sources, batch, nfts);
  }

  return expected.flatMap((token) => {
    const artworkSource = sources.get(coordsKey(token));
    return artworkSource ? [{ coords: token, artworkSource }] : [];
  });
}

function ethereumCoords(coords: readonly TokenCoords[]): TokenCoords[] {
  return coords.filter(({ chain }) => chain === 'ethereum');
}

async function fetchArtworkSourceBatch(
  coords: readonly TokenCoords[],
  fetchImpl: typeof fetch
): Promise<readonly (SuperRareApiNft | null)[]> {
  const response = await fetchImpl(SUPER_RARE_GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: ARTWORK_SOURCES_QUERY,
      variables: {
        filter: {
          universalTokenId: {
            in: coords.map(superRareUniversalTokenId),
          },
        },
        nftPagination: {
          take: coords.length,
          skip: 0,
          sortBy: 'createdAt',
          order: 'asc',
        },
      },
    }),
  });
  if (!response.ok) {
    return [];
  }

  const body = (await response.json().catch(() => null)) as
    | SuperRareArtworkSourcesResponse
    | null;
  return body?.data?.getNfts?.nfts ?? [];
}

function collectApiSources(
  sources: Map<string, string>,
  expectedCoords: readonly TokenCoords[],
  nfts: readonly (SuperRareApiNft | null)[]
): void {
  const expected = new Map(expectedCoords.map((token) => [coordsKey(token), token]));
  for (const nft of nfts) {
    const coords = apiNftCoords(nft);
    if (!coords || !expected.has(coordsKey(coords))) {
      continue;
    }
    const source = preferredArtworkSource(
      nft?.metadata?.mediaDetails?.original,
      nft?.metadata?.rawMetadata
    );
    if (source) {
      sources.set(coordsKey(coords), source);
    }
  }
}

function apiNftCoords(nft: SuperRareApiNft | null): TokenCoords | null {
  const contract = nft?.contractAddress?.toLowerCase() ?? '';
  const tokenId = nft?.tokenId == null ? '' : String(nft.tokenId);
  if (String(nft?.chainId ?? '') !== '1' || !contract || !tokenId) {
    return null;
  }
  return { chain: 'ethereum', contract, tokenId };
}

function sourcesFromHtml(
  html: string | null,
  expectedCoords: readonly TokenCoords[]
): Map<string, string> {
  const sources = new Map<string, string>();
  if (!html) {
    return sources;
  }

  // Next.js serializes the same keyless NFT payload into escaped RSC strings.
  // Decode only JSON quote escapes, then anchor every media scan to the exact
  // universal token id so recommendation media cannot be associated wrongly.
  const decoded = html.replace(/\\"/g, '"');
  for (const coords of expectedCoords) {
    const original = findEmbeddedOriginalMedia(decoded, superRareUniversalTokenId(coords));
    const source = preferredArtworkSource(original, null);
    if (source) {
      sources.set(coordsKey(coords), source);
    }
  }
  return sources;
}

function findEmbeddedOriginalMedia(
  html: string,
  universalTokenId: string
): SuperRareOriginalMedia | null {
  const needle = `"universalTokenId":"${universalTokenId}"`;
  let offset = 0;
  while (offset < html.length) {
    const tokenIndex = html.indexOf(needle, offset);
    if (tokenIndex < 0) {
      return null;
    }
    offset = tokenIndex + needle.length;

    const nft = containingEmbeddedNft(html, tokenIndex, universalTokenId);
    const original = nft?.metadata?.mediaDetails?.original;
    if (original) {
      return original;
    }
  }
  return null;
}

/**
 * containingEmbeddedNft parses the nearest complete JSON object that owns the
 * matched universal token id, preventing a forward scan from crossing into a
 * neighboring NFT record when metadata is absent.
 */
function containingEmbeddedNft(
  html: string,
  tokenIndex: number,
  universalTokenId: string
): SuperRareApiNft | null {
  const scanStart = Math.max(0, tokenIndex - EMBEDDED_TOKEN_SCAN_CHARS);
  for (let objectStart = tokenIndex; objectStart >= scanStart; objectStart -= 1) {
    if (html[objectStart] !== '{') {
      continue;
    }
    const objectJson = extractJsonObject(html, objectStart);
    if (!objectJson) {
      continue;
    }
    try {
      const nft = JSON.parse(objectJson) as SuperRareApiNft & { universalTokenId?: unknown };
      if (nft.universalTokenId === universalTokenId) {
        return nft;
      }
    } catch {
      continue;
    }
  }
  return null;
}

function extractJsonObject(input: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < input.length; index += 1) {
    const character = input[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }
    if (character === '"') {
      inString = true;
    } else if (character === '{') {
      depth += 1;
    } else if (character === '}') {
      depth -= 1;
      if (depth === 0) {
        return input.slice(start, index + 1);
      }
    }
  }
  return null;
}

function preferredArtworkSource(
  original: SuperRareOriginalMedia | null | undefined,
  rawMetadata: unknown
): string | null {
  const originalCandidates = [
    original?.html?.uri,
    original?.video?.uri,
    original?.audio?.uri,
    original?.threeD?.uri,
    original?.image?.uri,
  ];
  for (const candidate of originalCandidates) {
    const source = browserUrl(candidate);
    if (source) {
      return source;
    }
  }

  if (!rawMetadata || typeof rawMetadata !== 'object') {
    return null;
  }
  const metadata = rawMetadata as Record<string, unknown>;
  for (const key of ['animation_url', 'animation', 'image', 'image_url']) {
    const source = browserUrl(typeof metadata[key] === 'string' ? metadata[key] : null);
    if (source) {
      return source;
    }
  }
  return null;
}

function browserUrl(uri: string | null | undefined): string | null {
  const value = uri?.trim();
  if (!value) {
    return null;
  }
  if (/^ipfs:\/\//i.test(value)) {
    const resource = value.replace(/^ipfs:\/\/(?:ipfs\/)?/i, '').replace(/^\/+/, '');
    return resource ? `https://ipfs.io/ipfs/${resource}` : null;
  }
  if (/^ar:\/\//i.test(value)) {
    const resource = value.replace(/^ar:\/\//i, '').replace(/^\/+/, '');
    return resource ? `https://arweave.net/${resource}` : null;
  }
  try {
    return new URL(value).protocol === 'https:' ? value : null;
  } catch {
    return null;
  }
}

function superRareUniversalTokenId(coords: TokenCoords): string {
  return `1-${coords.contract.toLowerCase()}-${coords.tokenId}`;
}

function coordsKey(coords: TokenCoords): string {
  return `${coords.chain}:${coords.contract.toLowerCase()}:${coords.tokenId}`;
}
