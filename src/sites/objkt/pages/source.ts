import { cleanFindingArtist } from '../../../helpers';
import type { ArtworkSourceFinding, FindingArtist, TokenCoords } from '../../../types';

const OBJKT_GRAPHQL_ENDPOINT = 'https://data.objkt.com/v3/graphql';
const OBJKT_SOURCE_BATCH_SIZE = 100;
const OBJKT_IPFS_GATEWAY = 'https://ipfs.io/ipfs/';
const OBJKT_ARWEAVE_GATEWAY = 'https://arweave.net/';
const ONCHFS_GATEWAY = 'https://onchfs.fxhash2.xyz/';

const TOKEN_ARTWORK_SOURCE_QUERY = `
  query ResolveObjktArtworkSources($where: token_bool_exp!, $limit: Int!) {
    token(where: $where, limit: $limit) {
      fa_contract
      token_id
      artifact_uri
      display_uri
      thumbnail_uri
      creators {
        creator_address
        holder {
          alias
          description
          logo
          website
          twitter
          instagram
          ethereum
        }
      }
    }
  }
`;

interface ObjktArtworkSourceResponse {
  data?: {
    token?: Array<ObjktArtworkSourceToken | null> | null;
  };
}

interface ObjktCreator {
  creator_address?: string | null;
  holder?: {
    alias?: string | null;
    description?: string | null;
    logo?: string | null;
    website?: string | null;
    twitter?: string | null;
    instagram?: string | null;
    ethereum?: string | null;
  } | null;
}

interface ObjktArtworkSourceToken {
  fa_contract?: string | null;
  token_id?: string | number | null;
  artifact_uri?: string | null;
  display_uri?: string | null;
  thumbnail_uri?: string | null;
  creators?: Array<ObjktCreator | null> | null;
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
        const artists = objktArtists(token?.creators);
        findings.push({
          coords: tokenCoords,
          artworkSource,
          ...(artists.length > 0 ? { artists } : {}),
        });
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
 * gateways used by its web client while preserving ordinary HTTP(S) URLs.
 */
function playableObjktUri(...candidates: Array<string | null | undefined>): string | null {
  for (const candidate of candidates) {
    const uri = candidate?.trim();
    if (!uri) {
      continue;
    }
    if (/^https?:/i.test(uri)) {
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
        return `${ONCHFS_GATEWAY}${path}`;
      }
    }
    if (/^ar:\/\//i.test(uri)) {
      const path = uri.replace(/^ar:\/\//i, '').replace(/^\/+/, '');
      if (path) {
        return `${OBJKT_ARWEAVE_GATEWAY}${path}`;
      }
    }
  }
  return null;
}

/**
 * objktArtists credits a token's on-chain creators, profiled from the
 * `holder` row Objkt keeps per address. The creator address is the Tezos
 * wallet that minted; a holder who linked an Ethereum wallet gets that one
 * too. Objkt stores `twitter` / `instagram` / `website` as full URLs when the
 * holder set them, so each becomes a typed link; `logo` is already an
 * https URL on Objkt's asset CDN. A creator with no alias is not credited —
 * DP-1 needs a name, and the address is still on the finding's provenance.
 */
function objktArtists(creators: ObjktArtworkSourceToken['creators']): FindingArtist[] {
  return (creators ?? []).flatMap((creator) => {
    const holder = creator?.holder;
    const cleaned = cleanFindingArtist({
      name: holder?.alias,
      addresses: [creator?.creator_address, holder?.ethereum],
      bio: holder?.description,
      avatar: holder?.logo,
      links: [
        { url: holder?.website, type: 'website' },
        { url: holder?.twitter, type: 'twitter' },
        { url: holder?.instagram, type: 'instagram' },
      ],
    });
    return cleaned ? [cleaned] : [];
  });
}

function coordsKey({ chain, contract, tokenId }: TokenCoords): string {
  return `${chain}:${contract}:${tokenId}`;
}
