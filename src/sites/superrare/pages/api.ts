import { sourceTokenResult } from '../../../helpers';
import { limitTokenFindings, tokenLimitTarget } from '../../../limits';
import type { ParsedFindInput, ResolveTokensFromApiContext, TokenFindingsResult } from '../../../types';
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
  fetchImpl: typeof fetch,
  context?: ResolveTokensFromApiContext
): Promise<TokenFindingsResult> {
  const contract = parseSuperRareCollectionContract(url);
  if (!contract) {
    return { findings: [] };
  }

  const results: ParsedFindInput[] = [];
  let hasMore = false;
  let skip = 0;
  const targetCount = tokenLimitTarget(context?.limit);
  for (let pageNumber = 0; pageNumber < SUPER_RARE_API_MAX_PAGES; pageNumber += 1) {
    const pageLimit =
      targetCount == null
        ? SUPER_RARE_API_PAGE_SIZE
        : Math.min(SUPER_RARE_API_PAGE_SIZE, Math.max(1, targetCount - results.length));
    const nfts = await fetchSuperRareCollectionTokensPage(
      fetchImpl,
      contract,
      skip,
      pageLimit
    );
    for (const token of nfts.tokens) {
      const result = superRareApiToken(token);
      if (result) {
        results.push(result);
        if (targetCount != null && results.length >= targetCount) {
          hasMore = true;
          break;
        }
      }
    }
    if (hasMore || !nfts.hasNextPage || nfts.tokens.length === 0) {
      break;
    }
    skip += nfts.tokens.length;
  }
  return {
    findings: limitTokenFindings(results, context?.limit),
    ...(hasMore ? { hasMore } : {}),
  };
}

async function fetchSuperRareCollectionTokensPage(
  fetchImpl: typeof fetch,
  contract: string,
  skip: number,
  limit: number
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
          take: limit,
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
