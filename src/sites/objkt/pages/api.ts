import { sourceTokenResult } from '../../../helpers';
import type { ParsedFindInput, TokenFindingsResult } from '../../../types';

const OBJKT_GRAPHQL_ENDPOINT = 'https://data.objkt.com/v3/graphql';
const OBJKT_API_PAGE_SIZE = 500;
const OBJKT_API_MAX_PAGES = 1000;

const COLLECTION_QUERY = `
  query ResolveObjktCollection($identifier: String!) {
    fa(
      where: {
        _or: [
          { path: { _eq: $identifier } }
          { contract: { _eq: $identifier } }
          { collection_id: { _eq: $identifier } }
        ]
      }
      limit: 1
    ) {
      contract
      path
      collection_id
      name
    }
  }
`;

const COLLECTION_TOKENS_QUERY = `
  query ResolveObjktCollectionTokens($contract: String!, $limit: Int!, $lastPk: bigint!) {
    token(
      where: { fa_contract: { _eq: $contract }, pk: { _gt: $lastPk } }
      order_by: { pk: asc }
      limit: $limit
    ) {
      pk
      fa_contract
      token_id
    }
  }
`;

interface ObjktCollectionResponse {
  data?: {
    fa?: Array<ObjktCollection | null> | null;
  };
}

interface ObjktTokensResponse {
  data?: {
    token?: Array<ObjktApiToken | null> | null;
  };
}

interface ObjktCollection {
  contract?: string | null;
  path?: string | null;
  collection_id?: string | null;
  name?: string | null;
}

interface ObjktApiToken {
  pk?: number | string | null;
  fa_contract?: string | null;
  token_id?: string | number | null;
}

/**
 * resolveObjktCollectionFromApi maps an Objkt collection slug, collection id,
 * or KT1 contract page to every indexed token exposed by the public Objkt
 * GraphQL API. The API caps responses at 500 rows, so token rows are paginated
 * by primary key as recommended by Objkt's public API documentation.
 */
export async function resolveObjktCollectionFromApi(
  parsed: ParsedFindInput | null,
  fetchImpl: typeof fetch
): Promise<TokenFindingsResult> {
  if (parsed?.kind !== 'objkt-collection') {
    return { findings: [] };
  }

  const collection = await fetchObjktCollection(fetchImpl, parsed.slug);
  const contract = collection?.contract;
  if (!contract) {
    return { findings: [] };
  }

  const results: ParsedFindInput[] = [];
  let lastPk = 0;
  for (let pageNumber = 0; pageNumber < OBJKT_API_MAX_PAGES; pageNumber += 1) {
    const tokens = await fetchObjktCollectionTokensPage(fetchImpl, contract, lastPk);
    if (tokens.length === 0) {
      break;
    }

    for (const token of tokens) {
      const result = objktApiToken(token);
      if (result) {
        results.push(result);
      }
    }

    const nextPk = maxTokenPk(tokens);
    if (nextPk <= lastPk || tokens.length < OBJKT_API_PAGE_SIZE) {
      break;
    }
    lastPk = nextPk;
  }

  return { findings: results, ...(collection.name ? { title: collection.name } : {}) };
}

async function fetchObjktCollection(
  fetchImpl: typeof fetch,
  identifier: string
): Promise<ObjktCollection | null> {
  const body = await fetchObjktGraphql<ObjktCollectionResponse>(fetchImpl, COLLECTION_QUERY, {
    identifier,
  });
  return body?.data?.fa?.[0] ?? null;
}

async function fetchObjktCollectionTokensPage(
  fetchImpl: typeof fetch,
  contract: string,
  lastPk: number
): Promise<Array<ObjktApiToken | null>> {
  const body = await fetchObjktGraphql<ObjktTokensResponse>(fetchImpl, COLLECTION_TOKENS_QUERY, {
    contract,
    limit: OBJKT_API_PAGE_SIZE,
    lastPk,
  });
  return body?.data?.token ?? [];
}

async function fetchObjktGraphql<T>(
  fetchImpl: typeof fetch,
  query: string,
  variables: Record<string, string | number>
): Promise<T | null> {
  const response = await fetchImpl(OBJKT_GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) {
    return null;
  }
  return (await response.json().catch(() => null)) as T | null;
}

function objktApiToken(token: ObjktApiToken | null): ParsedFindInput | null {
  const contract = token?.fa_contract ?? '';
  const tokenId = token?.token_id == null ? '' : String(token.token_id);
  return contract && tokenId ? sourceTokenResult('objkt', 'tezos', contract, tokenId) : null;
}

function maxTokenPk(tokens: Array<ObjktApiToken | null>): number {
  return tokens.reduce((max, token) => {
    const pk = Number(token?.pk);
    return Number.isFinite(pk) && pk > max ? pk : max;
  }, 0);
}
