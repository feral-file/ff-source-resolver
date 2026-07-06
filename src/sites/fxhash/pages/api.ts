import { sourceTokenResult } from '../../../helpers';
import type { ParsedFindInput } from '../../../types';

const FXHASH_GRAPHQL_ENDPOINT = 'https://api.fxhash.xyz/graphql';

const ITERATION_QUERY = `
  query ResolveFxhashIteration($slug: String!) {
    objkt(slug: $slug) {
      onChainId
      gentkContractAddress
    }
  }
`;

const PROJECT_COLLECTION_QUERY = `
  query ResolveFxhashProject($slug: String!) {
    generativeToken(slug: $slug) {
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
      onChainId?: number | string | null;
      gentkContractAddress?: string | null;
    } | null;
  };
}

interface FxhashProjectGraphqlResponse {
  data?: {
    generativeToken?: {
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
): Promise<ParsedFindInput | null> {
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

  return sourceTokenResult('fxhash', 'tezos', contract, tokenId);
}

/**
 * resolveFxhashProjectFromApi maps fxhash project slugs to every Tezos FX1
 * gentk in the public `entireCollection` payload.
 */
export async function resolveFxhashProjectFromApi(
  parsed: ParsedFindInput | null,
  fetchImpl: typeof fetch
): Promise<ParsedFindInput[]> {
  if (parsed?.kind !== 'fxhash-project') {
    return [];
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
    return [];
  }

  const body = (await response.json().catch(() => null)) as FxhashProjectGraphqlResponse | null;
  const collection = body?.data?.generativeToken?.entireCollection ?? [];
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
  return results;
}
