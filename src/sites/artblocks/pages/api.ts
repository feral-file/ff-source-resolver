import { sourceTokenResult } from '../../../helpers';
import type { ParsedFindInput } from '../../../types';

const ART_BLOCKS_GRAPHQL_ENDPOINT = 'https://data.artblocks.io/v1/graphql';
const ART_BLOCKS_API_PAGE_SIZE = 1000;
const ART_BLOCKS_API_MAX_PAGES = 100;
const ART_BLOCKS_PAGE_HEADERS = {
  Accept: 'text/html,application/xhtml+xml',
  'Accept-Language': 'en-US,en;q=0.9',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
} as const;

const PROJECT_TOKENS_QUERY = `
  query ResolveArtBlocksProjectTokens(
    $limit: Int
    $offset: Int
    $where: tokens_metadata_bool_exp
    $orderBy: [tokens_metadata_order_by!]
  ) {
    filter_tokens_metadata_by_features(
      args: { path: "$" }
      where: $where
      limit: $limit
      offset: $offset
      order_by: $orderBy
    ) {
      chain_id
      token_id
      contract_address
    }
  }
`;

interface ArtBlocksProjectTokensResponse {
  data?: {
    filter_tokens_metadata_by_features?: Array<ArtBlocksApiToken | null> | null;
  };
}

interface ArtBlocksApiToken {
  chain_id?: number | null;
  token_id?: string | number | null;
  contract_address?: string | null;
}

/**
 * resolveArtBlocksCollectionFromApi maps an Art Blocks collection page to the
 * complete token set exposed by the public Art Blocks GraphQL endpoint.
 */
export async function resolveArtBlocksCollectionFromApi(
  url: URL,
  parsed: ParsedFindInput | null,
  fetchImpl: typeof fetch
): Promise<ParsedFindInput[]> {
  if (parsed?.kind !== 'ab-collection') {
    return [];
  }

  const page = await fetchImpl(url.toString(), { headers: ART_BLOCKS_PAGE_HEADERS });
  if (!page.ok) {
    return [];
  }
  const projectId = extractArtBlocksProjectId(await page.text());
  if (!projectId) {
    return [];
  }

  const results: ParsedFindInput[] = [];
  for (let pageNumber = 0; pageNumber < ART_BLOCKS_API_MAX_PAGES; pageNumber += 1) {
    const tokens = await fetchArtBlocksProjectTokensPage(fetchImpl, projectId, pageNumber * ART_BLOCKS_API_PAGE_SIZE);
    if (tokens.length === 0) {
      break;
    }
    for (const token of tokens) {
      const result = artBlocksApiToken(token);
      if (result) {
        results.push(result);
      }
    }
    if (tokens.length < ART_BLOCKS_API_PAGE_SIZE) {
      break;
    }
  }
  return results;
}

async function fetchArtBlocksProjectTokensPage(
  fetchImpl: typeof fetch,
  projectId: string,
  offset: number
): Promise<Array<ArtBlocksApiToken | null>> {
  const response = await fetchImpl(ART_BLOCKS_GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: PROJECT_TOKENS_QUERY,
      variables: {
        limit: ART_BLOCKS_API_PAGE_SIZE,
        offset,
        where: { project_id: { _eq: projectId }, chain_id: { _eq: 1 } },
        orderBy: [{ invocation: 'asc' }],
      },
    }),
  });
  if (!response.ok) {
    return [];
  }

  const body = (await response.json().catch(() => null)) as ArtBlocksProjectTokensResponse | null;
  return body?.data?.filter_tokens_metadata_by_features ?? [];
}

function extractArtBlocksProjectId(html: string): string | null {
  return /\\?"project_id\\?"\s*:\s*\\?"(0x[a-fA-F0-9]{40}-\d+)\\?"/.exec(html)?.[1] ?? null;
}

function artBlocksApiToken(token: ArtBlocksApiToken | null): ParsedFindInput | null {
  if (token?.chain_id !== 1) {
    return null;
  }
  const contract = token.contract_address ?? '';
  const tokenId = token.token_id == null ? '' : String(token.token_id);
  return contract && tokenId ? sourceTokenResult('artblocks', 'ethereum', contract, tokenId) : null;
}
