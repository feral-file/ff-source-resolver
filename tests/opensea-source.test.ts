import assert from 'node:assert/strict';
import test from 'node:test';
import type { TokenCoords } from '../src/types';
import { resolveOpenSeaArtworkSources } from '../src/sites/opensea/pages/source';

const CONTRACT = '0xa7d8d9ef8d8ce8992df33d8b8cf4aebabd5bd270';
const COORDS: TokenCoords = { chain: 'ethereum', contract: CONTRACT, tokenId: '163000100' };

test('OpenSea source reuses HTML and prefers original animation for the requested token', async () => {
  const html = openSeaUrqlHtml([
    openSeaItem('0x1111111111111111111111111111111111111111', '1', {
      originalImageUrl: 'https://raw2.seadn.io/unrelated.png',
    }),
    openSeaItem(CONTRACT.toUpperCase(), COORDS.tokenId, {
      originalAnimationUrl: 'https://generator.example/artwork.html',
      animationUrl: 'https://i2c.seadn.io/processed.mp4',
      originalImageUrl: 'https://raw2.seadn.io/original.png',
      imageUrl: 'https://i2c.seadn.io/thumbnail.png',
    }),
  ]);
  const fetchImpl = async () => {
    throw new Error('supplied HTML must avoid another page request');
  };

  const result = await resolveOpenSeaArtworkSources(
    new URL(`https://opensea.io/item/ethereum/${CONTRACT}/${COORDS.tokenId}`),
    [COORDS],
    fetchImpl as typeof fetch,
    { html }
  );

  assert.deepEqual(result, [
    { coords: COORDS, artworkSource: 'https://generator.example/artwork.html' },
  ]);
});

test('OpenSea source fetches a direct page once and falls back to original image', async () => {
  const requestedUrl = `https://opensea.io/item/ethereum/${CONTRACT}/${COORDS.tokenId}`;
  const requests: string[] = [];
  const fetchImpl = async (input: string | URL | Request) => {
    requests.push(String(input));
    return new Response(
      openSeaUrqlHtml([
        openSeaItem(CONTRACT, COORDS.tokenId, {
          originalImageUrl: 'ipfs://QmOriginalArtwork/image.png',
          imageUrl: 'https://i2c.seadn.io/thumbnail.png',
        }),
      ]),
      { status: 200 }
    );
  };

  const result = await resolveOpenSeaArtworkSources(
    new URL(requestedUrl),
    [COORDS],
    fetchImpl as typeof fetch
  );

  assert.deepEqual(requests, [requestedUrl]);
  assert.deepEqual(result, [
    {
      coords: COORDS,
      artworkSource: 'https://ipfs.io/ipfs/QmOriginalArtwork/image.png',
    },
  ]);
});

function openSeaUrqlHtml(items: object[]): string {
  const payload = { rehydrate: { query: { data: { collectionItems: { items } } } } };
  return `<script>(window[Symbol.for("urql_transport")] ??= []).push(${JSON.stringify(payload)})</script>`;
}

function openSeaItem(
  contractAddress: string,
  tokenId: string,
  media: {
    originalAnimationUrl?: string;
    animationUrl?: string;
    originalImageUrl?: string;
    imageUrl?: string;
  }
): object {
  return {
    chain: { identifier: 'ethereum' },
    contractAddress,
    tokenId,
    isFungible: false,
    ...media,
  };
}
