import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { resolveFxhashArtworkSources } from '../src/sites/fxhash/pages/source';
import type { TokenCoords } from '../src/types';

const LEGACY_COORDS: TokenCoords = {
  chain: 'tezos',
  contract: 'KT1KEa8z6vWXDJrVqtMrAeDVzsvxat3kHaCE',
  tokenId: '146207',
};

describe('fxhash artwork source enrichment', () => {
  test('uses the live IPFS artifact instead of display or thumbnail media', async () => {
    const fetchImpl = graphqlFetch((request) => {
      assert.equal(request.variables.slug, 'garden-monoliths-215');
      return {
        data: {
          objkt: {
            onChainId: 146207,
            gentkContractAddress: LEGACY_COORDS.contract,
            metadata: {
              artifactUri: 'ipfs://QmLiveArtifact?fxhash=ooIterationHash',
              displayUri: 'ipfs://QmDisplayImage',
              thumbnailUri: 'ipfs://QmThumbnailImage',
            },
          },
        },
      };
    });

    const findings = await resolveFxhashArtworkSources(
      new URL('https://www.fxhash.xyz/iteration/garden-monoliths-215'),
      [LEGACY_COORDS],
      fetchImpl as typeof fetch
    );

    assert.deepEqual(findings, [
      {
        coords: LEGACY_COORDS,
        artworkSource:
          'https://ipfs.io/ipfs/QmLiveArtifact?fxhash=ooIterationHash',
      },
    ]);
  });

  test('maps project IPFS, ONCHFS, and direct HTTPS artifacts to their tokens', async () => {
    const coords: TokenCoords[] = [
      LEGACY_COORDS,
      { chain: 'tezos', contract: 'KT1Project', tokenId: '2' },
      { chain: 'tezos', contract: 'KT1Project', tokenId: '3' },
    ];
    const fetchImpl = graphqlFetch(() => ({
      data: {
        generativeToken: {
          entireCollection: [
            objkt(coords[0], 'ipfs://QmProjectArtifact'),
            objkt(coords[1], 'onchfs://abcdef/index.html?fxhash=ooHash'),
            objkt(coords[2], 'https://cdn.example/artwork/index.html'),
          ],
        },
      },
    }));

    const findings = await resolveFxhashArtworkSources(
      new URL('https://www.fxhash.xyz/project/garden-monoliths'),
      coords,
      fetchImpl as typeof fetch
    );

    assert.deepEqual(
      findings.map(({ artworkSource }) => artworkSource),
      [
        'https://ipfs.io/ipfs/QmProjectArtifact',
        'https://onchfs.fxhash2.xyz/abcdef/index.html?fxhash=ooHash',
        'https://cdn.example/artwork/index.html',
      ]
    );
  });

  test('queries both fxhash ObjktId versions for a direct gentk URL', async () => {
    const coords: TokenCoords = {
      chain: 'tezos',
      contract: 'KT1U6EHmNxJTkvaWJ4ThczG4FSDaHC21ssvi',
      tokenId: '1234',
    };
    const fetchImpl = graphqlFetch((request) => {
      assert.deepEqual(request.variables.ids, ['FX0-1234', 'FX1-1234']);
      assert.equal(request.variables.take, 2);
      return { data: { objkts: [objkt(coords, 'ipfs://QmDirectGentk')] } };
    });

    const findings = await resolveFxhashArtworkSources(
      new URL(
        'https://www.fxhash.xyz/gentk/FX1-KT1U6EHmNxJTkvaWJ4ThczG4FSDaHC21ssvi-1234'
      ),
      [coords],
      fetchImpl as typeof fetch
    );

    assert.equal(findings[0]?.artworkSource, 'https://ipfs.io/ipfs/QmDirectGentk');
  });
});

function objkt(coords: TokenCoords, artifactUri: string): Record<string, unknown> {
  return {
    onChainId: coords.tokenId,
    gentkContractAddress: coords.contract,
    metadata: { artifactUri },
  };
}

function graphqlFetch(
  responseBody: (request: {
    query: string;
    variables: Record<string, unknown>;
  }) => unknown
): (input: string | URL | Request, init?: RequestInit) => Promise<Response> {
  return async (input, init) => {
    assert.equal(input.toString(), 'https://api.fxhash.xyz/graphql');
    assert.equal(init?.method, 'POST');
    const request = JSON.parse(String(init?.body)) as {
      query: string;
      variables: Record<string, unknown>;
    };
    return Response.json(responseBody(request));
  };
}
