import assert from 'node:assert/strict';
import test from 'node:test';
import type { TokenCoords } from '../src/types';
import { resolveObjktArtworkSources } from '../src/sites/objkt/pages/source';

const CONTRACT = 'KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton';

test('Objkt artwork source prefers artifact media and makes IPFS browser-loadable', async () => {
  const coords: TokenCoords = { chain: 'tezos', contract: CONTRACT, tokenId: '9201' };
  let requestBody: unknown;
  const fetchImpl = async (_input: string | URL | Request, init?: RequestInit) => {
    requestBody = JSON.parse(String(init?.body));
    return Response.json({
      data: {
        token: [
          {
            fa_contract: CONTRACT,
            token_id: '9201',
            artifact_uri: 'ipfs://QmArtifact/index.html?seed=1',
            display_uri: 'ipfs://QmDisplay',
            thumbnail_uri: 'ipfs://QmThumbnail',
          },
        ],
      },
    });
  };

  const result = await resolveObjktArtworkSources([coords], fetchImpl as typeof fetch);

  assert.deepEqual(result, [
    {
      coords,
      artworkSource: 'https://ipfs.io/ipfs/QmArtifact/index.html?seed=1',
    },
  ]);
  assert.deepEqual((requestBody as { variables: unknown }).variables, {
    where: {
      _or: [
        {
          fa_contract: { _eq: CONTRACT },
          token_id: { _eq: '9201' },
        },
      ],
    },
    limit: 1,
  });
});

test('Objkt artwork source falls back to display media and ignores other chains', async () => {
  const coords: TokenCoords = { chain: 'tezos', contract: CONTRACT, tokenId: '9201' };
  const requests: Array<string | URL | Request> = [];
  const fetchImpl = async (input: string | URL | Request) => {
    requests.push(input);
    return Response.json({
      data: {
        token: [
          {
            fa_contract: CONTRACT,
            token_id: 9201,
            artifact_uri: null,
            display_uri: 'https://assets.objkt.media/original-display.mp4',
            thumbnail_uri: 'https://assets.objkt.media/thumbnail.jpg',
          },
        ],
      },
    });
  };

  const result = await resolveObjktArtworkSources(
    [coords, { chain: 'ethereum', contract: '0x123', tokenId: '1' }],
    fetchImpl as typeof fetch
  );

  assert.equal(requests.length, 1);
  assert.deepEqual(result, [
    {
      coords,
      artworkSource: 'https://assets.objkt.media/original-display.mp4',
    },
  ]);
});

test('Objkt artwork source normalizes decentralized original URIs', async () => {
  const ipfsCoords: TokenCoords = { chain: 'tezos', contract: CONTRACT, tokenId: '9201' };
  const arweaveCoords: TokenCoords = { chain: 'tezos', contract: CONTRACT, tokenId: '9202' };
  const onchfsCoords: TokenCoords = { chain: 'tezos', contract: CONTRACT, tokenId: '9203' };
  const fetchImpl = async () =>
    Response.json({
      data: {
        token: [
          {
            fa_contract: CONTRACT,
            token_id: '9201',
            artifact_uri: 'ipfs://ipfs/QmArtifact/index.html',
          },
          {
            fa_contract: CONTRACT,
            token_id: '9202',
            artifact_uri: 'ar://transaction-id/artwork.html',
          },
          {
            fa_contract: CONTRACT,
            token_id: '9203',
            artifact_uri:
              'onchfs://ceedbf2b1923c1f7ca3695383c6dd5d3737382ba9202cff61c9ecf02ac133a6a/' +
              '?fxhash=oog38NNzFWkRj8cNph6AvWBGayg4acmTeNMTLeyQqCR1QpCx7WC',
          },
        ],
      },
    });

  const result = await resolveObjktArtworkSources(
    [ipfsCoords, arweaveCoords, onchfsCoords],
    fetchImpl as typeof fetch
  );

  assert.deepEqual(result, [
    {
      coords: ipfsCoords,
      artworkSource: 'https://ipfs.io/ipfs/QmArtifact/index.html',
    },
    {
      coords: arweaveCoords,
      artworkSource: 'https://arweave.net/transaction-id/artwork.html',
    },
    {
      coords: onchfsCoords,
      artworkSource:
        'https://onchfs.fxhash2.xyz/' +
        'ceedbf2b1923c1f7ca3695383c6dd5d3737382ba9202cff61c9ecf02ac133a6a/' +
        '?fxhash=oog38NNzFWkRj8cNph6AvWBGayg4acmTeNMTLeyQqCR1QpCx7WC',
    },
  ]);
});
