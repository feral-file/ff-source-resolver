import type { ArtworkSourceFinding, TokenCoords } from '../../../types';
import { parseFxhashIteration } from './iteration';
import { parseFxhashProject } from './project';
import { parseFxhashGentk } from './gentk';

const FXHASH_GRAPHQL_ENDPOINT = 'https://api.fxhash.xyz/graphql';
const TZKT_API_ORIGIN = 'https://api.tzkt.io';
// fxhash metadata is canonical, while a public gateway makes its IPFS URI
// directly browser-loadable. This is also the fallback exposed by fxhash's
// own IPFS utilities.
const PUBLIC_IPFS_GATEWAY = 'https://ipfs.io/ipfs/';
const PUBLIC_ARWEAVE_GATEWAY = 'https://arweave.net/';
const FXHASH_ONCHFS_GATEWAY = 'https://onchfs.fxhash2.xyz/';

const ITERATION_ARTWORK_SOURCE_QUERY = `
  query ResolveFxhashIterationArtworkSource($slug: String!) {
    objkt(slug: $slug) {
      onChainId
      gentkContractAddress
      metadata
    }
  }
`;

const PROJECT_ARTWORK_SOURCES_QUERY = `
  query ResolveFxhashProjectArtworkSources($slug: String!) {
    generativeToken(slug: $slug) {
      entireCollection {
        onChainId
        gentkContractAddress
        metadata
      }
    }
  }
`;

interface FxhashObjktArtworkSource {
  onChainId?: number | string | null;
  gentkContractAddress?: string | null;
  metadata?: unknown;
}

interface FxhashArtworkSourceResponse {
  data?: {
    objkt?: FxhashObjktArtworkSource | null;
    generativeToken?: {
      entireCollection?: Array<FxhashObjktArtworkSource | null> | null;
    } | null;
  };
}

/**
 * resolveFxhashArtworkSources returns live artifact URLs from fxhash's public
 * GraphQL metadata. Preview-only `displayUri` and `thumbnailUri` fields are
 * deliberately ignored.
 */
export async function resolveFxhashArtworkSources(
  url: URL,
  coords: readonly TokenCoords[],
  fetchImpl: typeof fetch
): Promise<readonly ArtworkSourceFinding[]> {
  if (coords.length === 0) {
    return [];
  }

  const parsedToken = parseFxhashGentk(url);
  if (parsedToken?.kind === 'token') {
    const requested = coords.find((value) => coordsKey(value) === coordsKey(parsedToken.coords));
    return requested ? resolveFxhashTokenArtworkSource(requested, fetchImpl) : [];
  }

  const request = artworkSourceRequest(url);
  if (!request) {
    return [];
  }
  const response = await fetchImpl(FXHASH_GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    return [];
  }

  const body = (await response.json().catch(() => null)) as FxhashArtworkSourceResponse | null;
  return findingsFromObjkts(responseObjkts(body), coords);
}

function artworkSourceRequest(
  url: URL
): { query: string; variables: Record<string, unknown> } | null {
  const iteration = parseFxhashIteration(url);
  if (iteration?.kind === 'fxhash-iteration') {
    return {
      query: ITERATION_ARTWORK_SOURCE_QUERY,
      variables: { slug: iteration.slug },
    };
  }

  const project = parseFxhashProject(url);
  if (project?.kind === 'fxhash-project') {
    return {
      query: PROJECT_ARTWORK_SOURCES_QUERY,
      variables: { slug: project.slug },
    };
  }

  return null;
}

/**
 * resolveFxhashTokenArtworkSource reads canonical FA2 token metadata from the
 * keyless TzKT indexer. fxhash's GraphQL ObjktId is an internal id and cannot
 * be derived from the on-chain token id carried by direct FX1 URLs.
 */
async function resolveFxhashTokenArtworkSource(
  coords: TokenCoords,
  fetchImpl: typeof fetch
): Promise<readonly ArtworkSourceFinding[]> {
  const endpoint = new URL('/v1/tokens', TZKT_API_ORIGIN);
  endpoint.searchParams.set('contract', coords.contract);
  endpoint.searchParams.set('tokenId', coords.tokenId);
  endpoint.searchParams.set('limit', '1');
  const response = await fetchImpl(endpoint, { headers: { Accept: 'application/json' } });
  if (!response.ok) {
    return [];
  }
  const tokens = (await response.json().catch(() => null)) as
    | Array<{
        tokenId?: string | number | null;
        contract?: { address?: string | null } | null;
        metadata?: unknown;
      }>
    | null;
  const token = tokens?.[0];
  const matches =
    token &&
    token.contract?.address === coords.contract &&
    String(token.tokenId ?? '') === coords.tokenId;
  const artifactUri = matches ? metadataArtifactUri(token.metadata) : null;
  const artworkSource = artifactUri ? browserUrlForArtifact(artifactUri) : null;
  return artworkSource ? [{ coords, artworkSource }] : [];
}

function responseObjkts(
  response: FxhashArtworkSourceResponse | null
): readonly (FxhashObjktArtworkSource | null)[] {
  const data = response?.data;
  if (data?.objkt) {
    return [data.objkt];
  }
  return data?.generativeToken?.entireCollection ?? [];
}

function findingsFromObjkts(
  objkts: readonly (FxhashObjktArtworkSource | null)[],
  expectedCoords: readonly TokenCoords[]
): readonly ArtworkSourceFinding[] {
  const expected = new Map(expectedCoords.map((coords) => [coordsKey(coords), coords]));
  const findings: ArtworkSourceFinding[] = [];

  for (const objkt of objkts) {
    const contract = objkt?.gentkContractAddress ?? '';
    const tokenId = String(objkt?.onChainId ?? '');
    const coords = expected.get(coordsKey({ chain: 'tezos', contract, tokenId }));
    const artifactUri = metadataArtifactUri(objkt?.metadata);
    const artworkSource = artifactUri ? browserUrlForArtifact(artifactUri) : null;
    if (coords && artworkSource) {
      findings.push({ coords, artworkSource });
    }
  }

  return findings;
}

function coordsKey(coords: TokenCoords): string {
  return `${coords.chain}:${coords.contract}:${coords.tokenId}`;
}

function metadataArtifactUri(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }
  const artifactUri = (metadata as { artifactUri?: unknown }).artifactUri;
  return typeof artifactUri === 'string' && artifactUri.trim() ? artifactUri.trim() : null;
}

/**
 * browserUrlForArtifact converts fxhash's decentralized storage identifiers
 * into browser-loadable URLs without changing the artifact path or query.
 */
function browserUrlForArtifact(artifactUri: string): string | null {
  if (/^ipfs:\/\//i.test(artifactUri)) {
    const resource = artifactUri
      .replace(/^ipfs:\/\/(?:ipfs\/)?/i, '')
      .replace(/^\/+/, '');
    return resource ? `${PUBLIC_IPFS_GATEWAY}${resource}` : null;
  }
  if (/^ar:\/\//i.test(artifactUri)) {
    const resource = artifactUri.replace(/^ar:\/\//i, '').replace(/^\/+/, '');
    return resource ? `${PUBLIC_ARWEAVE_GATEWAY}${resource}` : null;
  }
  if (/^onchfs:\/\//i.test(artifactUri)) {
    const resource = artifactUri.replace(/^onchfs:\/\//i, '').replace(/^\/+/, '');
    return resource ? `${FXHASH_ONCHFS_GATEWAY}${resource}` : null;
  }
  try {
    const url = new URL(artifactUri);
    return url.protocol === 'https:' ? artifactUri : null;
  } catch {
    return null;
  }
}
