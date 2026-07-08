import { sourceTokenResult } from '../../../helpers';
import type { ParsedFindInput, SingleTokenFindingsResult, TokenFindingsResult } from '../../../types';

const FXHASH_GRAPHQL_ENDPOINT = 'https://api.fxhash.xyz/graphql';

const ITERATION_QUERY = `
  query ResolveFxhashIteration($slug: String!) {
    objkt(slug: $slug) {
      name
      onChainId
      gentkContractAddress
    }
  }
`;

const PROJECT_COLLECTION_QUERY = `
  query ResolveFxhashProject($slug: String!) {
    generativeToken(slug: $slug) {
      name
      entireCollection {
        onChainId
        gentkContractAddress
      }
    }
  }
`;

interface FxhashIterationGraphqlResponse {
  data?: {
    objkt?: {
      name?: string | null;
      onChainId?: number | string | null;
      gentkContractAddress?: string | null;
    } | null;
  };
}

interface FxhashProjectGraphqlResponse {
  data?: {
    generativeToken?: {
      name?: string | null;
      entireCollection?: Array<{
        onChainId?: number | string | null;
        gentkContractAddress?: string | null;
      } | null> | null;
    } | null;
  };
}

/**
 * resolveFxhashFromApi maps current fxhash iteration slugs to FX1 Tezos
 * gentk coordinates using fxhash's public GraphQL API.
 */
export async function resolveFxhashFromApi(
  parsed: ParsedFindInput | null,
  fetchImpl: typeof fetch
): Promise<SingleTokenFindingsResult> {
  if (parsed?.kind !== 'fxhash-iteration') {
    return null;
  }

  const response = await fetchImpl(FXHASH_GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: ITERATION_QUERY,
      variables: { slug: parsed.slug },
    }),
  });
  if (!response.ok) {
    return null;
  }

  const body = (await response.json().catch(() => null)) as FxhashIterationGraphqlResponse | null;
  const objkt = body?.data?.objkt;
  const tokenId = String(objkt?.onChainId ?? '');
  const contract = objkt?.gentkContractAddress ?? '';
  if (!tokenId || !contract) {
    return null;
  }

  return {
    finding: sourceTokenResult('fxhash', 'tezos', contract, tokenId),
    ...(objkt?.name ? { title: objkt.name } : {}),
  };
}

/**
 * resolveFxhashProjectFromApi maps fxhash project slugs to every Tezos FX1
 * gentk in the public `entireCollection` payload.
 */
export async function resolveFxhashProjectFromApi(
  parsed: ParsedFindInput | null,
  fetchImpl: typeof fetch
): Promise<TokenFindingsResult> {
  if (parsed?.kind !== 'fxhash-project') {
    return { findings: [] };
  }

  const response = await fetchImpl(FXHASH_GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: PROJECT_COLLECTION_QUERY,
      variables: { slug: parsed.slug },
    }),
  });
  if (!response.ok) {
    return { findings: [] };
  }

  const body = (await response.json().catch(() => null)) as FxhashProjectGraphqlResponse | null;
  const token = body?.data?.generativeToken;
  const collection = token?.entireCollection ?? [];
  const results: ParsedFindInput[] = [];
  for (const objkt of collection) {
    const tokenId = String(objkt?.onChainId ?? '');
    const contract = objkt?.gentkContractAddress ?? '';
    if (!tokenId || !contract) {
      continue;
    }
    const result = sourceTokenResult('fxhash', 'tezos', contract, tokenId);
    if (result) {
      results.push(result);
    }
  }
  return { findings: results, ...(token?.name ? { title: token.name } : {}) };
}
