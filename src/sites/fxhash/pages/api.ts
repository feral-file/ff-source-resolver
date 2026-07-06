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

interface FxhashIterationGraphqlResponse {
  data?: {
    objkt?: {
      onChainId?: number | string | null;
      gentkContractAddress?: string | null;
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
