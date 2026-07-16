import type { ArtworkSourceFinding, TokenCoords } from '../../../types';
import { parseFxhashIteration } from './iteration';
import { parseFxhashProject } from './project';

const FXHASH_GRAPHQL_ENDPOINT = 'https://api.fxhash.xyz/graphql';
// fxhash metadata is canonical, while a public gateway makes its IPFS URI
// directly browser-loadable. This is also the fallback exposed by fxhash's
// own IPFS utilities.
const PUBLIC_IPFS_GATEWAY = 'https://ipfs.io/ipfs/';
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

const TOKEN_ARTWORK_SOURCES_QUERY = `
  query ResolveFxhashTokenArtworkSources($ids: [ObjktId!], $take: Int!) {
    objkts(filters: { id_in: $ids }, take: $take) {
      onChainId
      gentkContractAddress
      metadata
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
    objkts?: Array<FxhashObjktArtworkSource | null> | null;
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

  const request = artworkSourceRequest(url, coords);
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
  url: URL,
  coords: readonly TokenCoords[]
): { query: string; variables: Record<string, unknown> } {
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

  // Direct FX1 gentk URLs carry on-chain ids, while the GraphQL ObjktId
  // scalar also includes a legacy FX0/FX1 database-version prefix. Query both
  // and use the returned contract to disambiguate the matching token.
  const ids = coords.flatMap(({ tokenId }) => [`FX0-${tokenId}`, `FX1-${tokenId}`]);
  return {
    query: TOKEN_ARTWORK_SOURCES_QUERY,
    variables: { ids, take: ids.length },
  };
}

function responseObjkts(
  response: FxhashArtworkSourceResponse | null
): readonly (FxhashObjktArtworkSource | null)[] {
  const data = response?.data;
  if (data?.objkt) {
    return [data.objkt];
  }
  return data?.generativeToken?.entireCollection ?? data?.objkts ?? [];
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
  if (artifactUri.startsWith('ipfs://')) {
    const resource = artifactUri.slice('ipfs://'.length);
    return resource ? `${PUBLIC_IPFS_GATEWAY}${resource}` : null;
  }
  if (artifactUri.startsWith('onchfs://')) {
    const resource = artifactUri.slice('onchfs://'.length);
    return resource ? `${FXHASH_ONCHFS_GATEWAY}${resource}` : null;
  }
  try {
    const url = new URL(artifactUri);
    return url.protocol === 'https:' ? artifactUri : null;
  } catch {
    return null;
  }
}
