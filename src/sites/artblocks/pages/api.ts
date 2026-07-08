import { sourceTokenResult } from '../../../helpers';
import { limitTokenFindings, tokenLimitTarget } from '../../../limits';
import type { ParsedFindInput, ResolveTokensFromApiContext, TokenFindingsResult } from '../../../types';

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
      invocation
      project_name
      project {
        name
        artist_name
      }
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
  invocation?: string | number | null;
  project_name?: string | null;
  project?: {
    name?: string | null;
    artist_name?: string | null;
  } | null;
}

/**
 * resolveArtBlocksCollectionFromApi maps an Art Blocks collection page to the
 * complete token set exposed by the public Art Blocks GraphQL endpoint.
 */
export async function resolveArtBlocksCollectionFromApi(
  url: URL,
  parsed: ParsedFindInput | null,
  fetchImpl: typeof fetch,
  context?: ResolveTokensFromApiContext
): Promise<TokenFindingsResult> {
  if (parsed?.kind !== 'ab-collection') {
    return { findings: [] };
  }

  const html = context?.html ?? (await fetchArtBlocksCollectionPageHtml(url, fetchImpl));
  if (!html) {
    return { findings: [] };
  }
  const projectId = extractArtBlocksProjectId(html);
  if (!projectId) {
    return { findings: [] };
  }

  const results: ParsedFindInput[] = [];
  let firstApiToken: ArtBlocksApiToken | null = null;
  let hasMore = false;
  let offset = 0;
  const targetCount = tokenLimitTarget(context?.limit);
  for (let pageNumber = 0; pageNumber < ART_BLOCKS_API_MAX_PAGES; pageNumber += 1) {
    const pageLimit =
      targetCount == null
        ? ART_BLOCKS_API_PAGE_SIZE
        : Math.min(ART_BLOCKS_API_PAGE_SIZE, Math.max(1, targetCount - results.length));
    const tokens = await fetchArtBlocksProjectTokensPage(fetchImpl, projectId, offset, pageLimit);
    if (tokens.length === 0) {
      break;
    }
    for (const token of tokens) {
      firstApiToken ??= token;
      const result = artBlocksApiToken(token);
      if (result) {
        results.push(result);
        if (targetCount != null && results.length >= targetCount) {
          hasMore = true;
          break;
        }
      }
    }
    if (hasMore || tokens.length < pageLimit) {
      break;
    }
    offset += tokens.length;
  }
  const title = artBlocksTitle(firstApiToken, results.length);
  return {
    findings: limitTokenFindings(results, context?.limit),
    ...(title ? { title } : {}),
    ...(hasMore ? { hasMore } : {}),
  };
}

async function fetchArtBlocksCollectionPageHtml(
  url: URL,
  fetchImpl: typeof fetch
): Promise<string | null> {
  const page = await fetchImpl(url.toString(), { headers: ART_BLOCKS_PAGE_HEADERS });
  if (!page.ok) {
    return null;
  }
  return page.text();
}

async function fetchArtBlocksProjectTokensPage(
  fetchImpl: typeof fetch,
  projectId: string,
  offset: number,
  limit: number
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
        limit,
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

function artBlocksTitle(token: ArtBlocksApiToken | null, resultCount: number): string | undefined {
  const projectName = token?.project?.name ?? token?.project_name ?? null;
  const artistName = token?.project?.artist_name ?? null;
  if (!projectName) {
    return undefined;
  }
  if (resultCount === 1 && token?.invocation != null) {
    return artistName
      ? `${projectName} #${token.invocation} by ${artistName}`
      : `${projectName} #${token.invocation}`;
  }
  return artistName ? `${projectName} by ${artistName}` : projectName;
}
