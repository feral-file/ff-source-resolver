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

  test('credits the project author on every iteration, avatar routed through the gateway', async () => {
    const fetchImpl = graphqlFetch(() => ({
      data: {
        objkt: {
          onChainId: 146207,
          gentkContractAddress: LEGACY_COORDS.contract,
          metadata: { artifactUri: 'ipfs://QmLiveArtifact' },
          issuer: {
            author: {
              id: 'tz1fepn7jZsCYBqCDhpM63hzh9g2Ytqk4Tpv',
              name: 'fxhash',
              type: 'REGULAR',
              description: 'The fxhash admin? account',
              avatarUri: 'ipfs://QmURUAU4YPa6Wwco3JSVrcN7WfCrFBZH7hY51BLrc87WjM',
              collaborators: null,
            },
          },
        },
      },
    }));

    const findings = await resolveFxhashArtworkSources(
      new URL('https://www.fxhash.xyz/iteration/garden-monoliths-215'),
      [LEGACY_COORDS],
      fetchImpl as typeof fetch
    );

    assert.deepEqual(findings[0]?.artists, [
      {
        name: 'fxhash',
        addresses: ['tz1fepn7jZsCYBqCDhpM63hzh9g2Ytqk4Tpv'],
        bio: 'The fxhash admin? account',
        avatar: 'https://ipfs.io/ipfs/QmURUAU4YPa6Wwco3JSVrcN7WfCrFBZH7hY51BLrc87WjM',
      },
    ]);
  });

  test('credits the collaborators, not the collab contract, on a project', async () => {
    // A collab contract is the author of record but not a person: its id is a
    // KT1 and its name a label. fxhash lists the people in `collaborators`.
    const coords: TokenCoords[] = [
      { chain: 'tezos', contract: 'KT1Project', tokenId: '2' },
      { chain: 'tezos', contract: 'KT1Project', tokenId: '3' },
    ];
    const fetchImpl = graphqlFetch(() => ({
      data: {
        generativeToken: {
          author: {
            id: 'KT1CollabContract',
            name: 'A & B',
            type: 'COLLAB_CONTRACT_V1',
            description: null,
            avatarUri: null,
            collaborators: [
              { id: 'tz1AAA', name: 'Artist A', description: 'Draws.', avatarUri: null },
              { id: 'tz1BBB', name: ' ', description: null, avatarUri: null },
              { id: 'tz1CCC', name: 'Artist C', description: null, avatarUri: 'https://cdn.example/c.png' },
            ],
          },
          entireCollection: [objkt(coords[0], 'ipfs://QmA'), objkt(coords[1], 'ipfs://QmB')],
        },
      },
    }));

    const findings = await resolveFxhashArtworkSources(
      new URL('https://www.fxhash.xyz/project/garden-monoliths'),
      coords,
      fetchImpl as typeof fetch
    );

    const artists = [
      { name: 'Artist A', addresses: ['tz1AAA'], bio: 'Draws.' },
      { name: 'Artist C', addresses: ['tz1CCC'], avatar: 'https://cdn.example/c.png' },
    ];
    assert.deepEqual(
      findings.map(({ artists: a }) => a),
      [artists, artists]
    );
  });

  test('credits the collab contract itself when it lists no collaborators', async () => {
    // Nothing better is on record: the label is the only name fxhash gives
    // and the KT1 the only address. The library passes both through; whether
    // a contract counts as a person is the caller's rule.
    const fetchImpl = graphqlFetch(() => ({
      data: {
        generativeToken: {
          author: {
            id: 'KT1CollabContract',
            name: 'A & B',
            type: 'COLLAB_CONTRACT_V1',
            description: null,
            avatarUri: null,
            collaborators: [],
          },
          entireCollection: [objkt(LEGACY_COORDS, 'ipfs://QmA')],
        },
      },
    }));
    const findings = await resolveFxhashArtworkSources(
      new URL('https://www.fxhash.xyz/project/garden-monoliths'),
      [LEGACY_COORDS],
      fetchImpl as typeof fetch
    );
    assert.deepEqual(findings[0]?.artists, [{ name: 'A & B', addresses: ['KT1CollabContract'] }]);
  });

  test('leaves artists absent when the response names no author', async () => {
    const fetchImpl = graphqlFetch(() => ({
      data: {
        generativeToken: {
          author: null,
          entireCollection: [objkt(LEGACY_COORDS, 'ipfs://QmA')],
        },
      },
    }));
    const findings = await resolveFxhashArtworkSources(
      new URL('https://www.fxhash.xyz/project/garden-monoliths'),
      [LEGACY_COORDS],
      fetchImpl as typeof fetch
    );
    assert.deepEqual(findings, [
      { coords: LEGACY_COORDS, artworkSource: 'https://ipfs.io/ipfs/QmA' },
    ]);
  });

  test('maps project IPFS, Arweave, ONCHFS, and direct HTTPS artifacts to their tokens', async () => {
    const coords: TokenCoords[] = [
      LEGACY_COORDS,
      { chain: 'tezos', contract: 'KT1Project', tokenId: '2' },
      { chain: 'tezos', contract: 'KT1Project', tokenId: '3' },
      { chain: 'tezos', contract: 'KT1Project', tokenId: '4' },
    ];
    const fetchImpl = graphqlFetch(() => ({
      data: {
        generativeToken: {
          entireCollection: [
            objkt(coords[0], 'ipfs://ipfs/QmProjectArtifact'),
            objkt(coords[1], 'ar://arweave-transaction/index.html'),
            objkt(coords[2], 'onchfs://abcdef/index.html?fxhash=ooHash'),
            objkt(coords[3], 'https://cdn.example/artwork/index.html'),
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
        'https://arweave.net/arweave-transaction/index.html',
        'https://onchfs.fxhash2.xyz/abcdef/index.html?fxhash=ooHash',
        'https://cdn.example/artwork/index.html',
      ]
    );
  });

  test('looks up a direct gentk by its contract and on-chain token id', async () => {
    const coords = LEGACY_COORDS;
    const fetchImpl = async (input: string | URL | Request): Promise<Response> => {
      assert.equal(
        input.toString(),
        `https://api.tzkt.io/v1/tokens?contract=${coords.contract}&tokenId=${coords.tokenId}&limit=1`
      );
      return Response.json([
        {
          tokenId: coords.tokenId,
          contract: { address: coords.contract },
          metadata: { artifactUri: 'ipfs://QmDirectGentk' },
        },
      ]);
    };

    const findings = await resolveFxhashArtworkSources(
      new URL(
        `https://www.fxhash.xyz/gentk/FX1-${coords.contract}-${coords.tokenId}`
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
