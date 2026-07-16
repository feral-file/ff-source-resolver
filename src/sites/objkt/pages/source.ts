import type { ArtworkSourceFinding, TokenCoords } from '../../../types';

const OBJKT_GRAPHQL_ENDPOINT = 'https://data.objkt.com/v3/graphql';
const OBJKT_SOURCE_BATCH_SIZE = 100;
const OBJKT_IPFS_GATEWAY = 'https://ipfs.io/ipfs/';
const OBJKT_ASSET_CDN = 'https://assets.objkt.media/file/assets-003/';

const TOKEN_ARTWORK_SOURCE_QUERY = `
  query ResolveObjktArtworkSources($where: token_bool_exp!, $limit: Int!) {
    token(where: $where, limit: $limit) {
      fa_contract
      token_id
      artifact_uri
      display_uri
      thumbnail_uri
    }
  }
`;

interface ObjktArtworkSourceResponse {
  data?: {
    token?: Array<ObjktArtworkSourceToken | null> | null;
  };
}

interface ObjktArtworkSourceToken {
  fa_contract?: string | null;
  token_id?: string | number | null;
  artifact_uri?: string | null;
  display_uri?: string | null;
  thumbnail_uri?: string | null;
}

/**
 * resolveObjktArtworkSources resolves original token media through Objkt's
 * keyless public GraphQL API. Requests are batched to keep collection queries
 * bounded; the original artifact is preferred over display and thumbnail
 * derivatives.
 */
export async function resolveObjktArtworkSources(
  coords: readonly TokenCoords[],
  fetchImpl: typeof fetch
): Promise<ArtworkSourceFinding[]> {
  const tezosCoords = coords.filter(({ chain }) => chain === 'tezos');
  const findings: ArtworkSourceFinding[] = [];

  for (let offset = 0; offset < tezosCoords.length; offset += OBJKT_SOURCE_BATCH_SIZE) {
    const batch = tezosCoords.slice(offset, offset + OBJKT_SOURCE_BATCH_SIZE);
    const tokens = await fetchObjktArtworkSourceBatch(batch, fetchImpl);
    const coordsByKey = new Map(batch.map((tokenCoords) => [coordsKey(tokenCoords), tokenCoords]));

    for (const token of tokens) {
      const contract = token?.fa_contract ?? '';
      const tokenId = token?.token_id == null ? '' : String(token.token_id);
      const tokenCoords = coordsByKey.get(coordsKey({ chain: 'tezos', contract, tokenId }));
      const artworkSource = playableObjktUri(
        token?.artifact_uri,
        token?.display_uri,
        token?.thumbnail_uri
      );
      if (tokenCoords && artworkSource) {
        findings.push({ coords: tokenCoords, artworkSource });
      }
    }
  }

  return findings;
}

async function fetchObjktArtworkSourceBatch(
  coords: readonly TokenCoords[],
  fetchImpl: typeof fetch
): Promise<Array<ObjktArtworkSourceToken | null>> {
  if (coords.length === 0) {
    return [];
  }

  const response = await fetchImpl(OBJKT_GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: TOKEN_ARTWORK_SOURCE_QUERY,
      variables: {
        where: {
          _or: coords.map(({ contract, tokenId }) => ({
            fa_contract: { _eq: contract },
            token_id: { _eq: tokenId },
          })),
        },
        limit: coords.length,
      },
    }),
  });
  if (!response.ok) {
    return [];
  }

  const body = (await response.json().catch(() => null)) as ObjktArtworkSourceResponse | null;
  return body?.data?.token ?? [];
}

/**
 * playableObjktUri converts Objkt's storage schemes to the browser-loadable
 * gateways used by its web client while preserving ordinary web and data URLs.
 */
function playableObjktUri(...candidates: Array<string | null | undefined>): string | null {
  for (const candidate of candidates) {
    const uri = candidate?.trim();
    if (!uri) {
      continue;
    }
    if (/^(?:https?:|data:)/i.test(uri)) {
      return uri;
    }
    if (/^ipfs:\/\//i.test(uri)) {
      const path = uri.replace(/^ipfs:\/\/(?:ipfs\/)?/i, '').replace(/^\/+/, '');
      if (path) {
        return `${OBJKT_IPFS_GATEWAY}${path}`;
      }
    }
    if (/^onchfs:\/\//i.test(uri)) {
      const path = uri.replace(/^onchfs:\/\//i, '').replace(/^\/+/, '');
      if (path) {
        return `${OBJKT_ASSET_CDN}${path}`;
      }
    }
  }
  return null;
}

function coordsKey({ chain, contract, tokenId }: TokenCoords): string {
  return `${chain}:${contract}:${tokenId}`;
}
