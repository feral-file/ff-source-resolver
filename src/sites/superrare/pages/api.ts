import { sourceTokenResult } from '../../../helpers';
import type { ParsedFindInput } from '../../../types';
import { parseSuperRareCollectionContract } from './collection';

const SUPER_RARE_GRAPHQL_ENDPOINT = 'https://api.superrare.com/graphql';
const SUPER_RARE_API_PAGE_SIZE = 100;
const SUPER_RARE_API_MAX_PAGES = 100;

const COLLECTION_TOKENS_QUERY = `
  query ResolveSuperRareCollectionTokens(
    $filter: NftFilterInput!
    $nftPagination: NftPaginationInput
  ) {
    getNfts(filter: $filter, nftPagination: $nftPagination) {
      nfts {
        chainId
        contractAddress
        tokenId
      }
      pagination {
        hasNextPage
      }
    }
  }
`;

interface SuperRareNftPage {
  data?: {
    getNfts?: {
      nfts?: Array<SuperRareApiNft | null> | null;
      pagination?: {
        hasNextPage?: boolean | null;
      } | null;
    } | null;
  };
}

interface SuperRareApiNft {
  chainId?: string | number | null;
  contractAddress?: string | null;
  tokenId?: string | number | null;
}

/**
 * resolveSuperRareCollectionFromApi maps supported `/collection/{contract}` and
 * `/collection/1-{contract}` pages to every Ethereum NFT exposed by
 * SuperRare's public keyless GraphQL `getNfts` endpoint. SuperRare does not
 * expose a slug in this URL shape; the contract address is the stable
 * collection identifier available to callers.
 */
export async function resolveSuperRareCollectionFromApi(
  url: URL,
  fetchImpl: typeof fetch
): Promise<ParsedFindInput[]> {
  const contract = parseSuperRareCollectionContract(url);
  if (!contract) {
    return [];
  }

  const results: ParsedFindInput[] = [];
  for (let pageNumber = 0; pageNumber < SUPER_RARE_API_MAX_PAGES; pageNumber += 1) {
    const nfts = await fetchSuperRareCollectionTokensPage(
      fetchImpl,
      contract,
      pageNumber * SUPER_RARE_API_PAGE_SIZE
    );
    for (const token of nfts.tokens) {
      const result = superRareApiToken(token);
      if (result) {
        results.push(result);
      }
    }
    if (!nfts.hasNextPage || nfts.tokens.length === 0) {
      break;
    }
  }
  return results;
}

async function fetchSuperRareCollectionTokensPage(
  fetchImpl: typeof fetch,
  contract: string,
  skip: number
): Promise<{ tokens: Array<SuperRareApiNft | null>; hasNextPage: boolean }> {
  const response = await fetchImpl(SUPER_RARE_GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: COLLECTION_TOKENS_QUERY,
      variables: {
        filter: { contractAddress: { equals: contract } },
        nftPagination: {
          take: SUPER_RARE_API_PAGE_SIZE,
          skip,
          sortBy: 'createdAt',
          order: 'asc',
        },
      },
    }),
  });
  if (!response.ok) {
    return { tokens: [], hasNextPage: false };
  }

  const body = (await response.json().catch(() => null)) as SuperRareNftPage | null;
  const page = body?.data?.getNfts;
  return {
    tokens: page?.nfts ?? [],
    hasNextPage: page?.pagination?.hasNextPage === true,
  };
}

function superRareApiToken(token: SuperRareApiNft | null): ParsedFindInput | null {
  if (String(token?.chainId ?? '') !== '1') {
    return null;
  }
  const contract = token?.contractAddress ?? '';
  const tokenId = token?.tokenId == null ? '' : String(token.tokenId);
  return contract && tokenId ? sourceTokenResult('superrare', 'ethereum', contract, tokenId) : null;
}
