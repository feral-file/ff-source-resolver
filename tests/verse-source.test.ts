import assert from 'node:assert/strict';
import test from 'node:test';
import type { TokenCoords } from '../src/types';
import { resolveVerseArtworkSources } from '../src/sites/verse/pages/source';

const CONTRACT = '0x23b72f7458a204446983f544d655df10f70533e9';

test('Verse source reuses Apollo HTML and prefers a live iframe', async () => {
  const coords: TokenCoords = { chain: 'ethereum', contract: CONTRACT, tokenId: '139' };
  const html = verseApolloHtml([
    verseEdition('139', {
      __typename: 'IFrameAsset',
      iframeUrl: 'https://quantizer.example/token/139',
      baseUrl: 'https://quantizer.example/static/139',
      previewImageUrl: 'https://versecontent.com/image/{{SIZE}}/139.gif@{{FORMAT}}',
    }),
  ]);
  const fetchImpl = async () => {
    throw new Error('supplied HTML must avoid another request');
  };

  const result = await resolveVerseArtworkSources(
    new URL(`https://verse.works/items/ethereum/${CONTRACT}/139`),
    [coords],
    fetchImpl as typeof fetch,
    { html }
  );

  assert.deepEqual(result, [
    { coords, artworkSource: 'https://quantizer.example/token/139' },
  ]);
});

test('Verse direct source fetches one page and returns original video media', async () => {
  const coords: TokenCoords = { chain: 'ethereum', contract: CONTRACT, tokenId: '12' };
  const requestedUrl = `https://verse.works/items/ethereum/${CONTRACT}/12`;
  const requests: string[] = [];
  const fetchImpl = async (input: string | URL | Request) => {
    requests.push(String(input));
    return new Response(
      verseApolloHtml([
        verseEdition('12', {
          __typename: 'VideoAsset',
          baseUrl: 'https://versecontent.com/video/original.mp4',
          previewImageUrl: 'https://versecontent.com/image/preview.jpeg',
        }),
      ]),
      { status: 200 }
    );
  };

  const result = await resolveVerseArtworkSources(
    new URL(requestedUrl),
    [coords],
    fetchImpl as typeof fetch
  );

  assert.deepEqual(requests, [requestedUrl]);
  assert.deepEqual(result, [
    { coords, artworkSource: 'https://versecontent.com/video/original.mp4' },
  ]);
});

test('Verse series source resolves all requested asset variants in one GraphQL call', async () => {
  const coords: TokenCoords[] = [
    { chain: 'ethereum', contract: CONTRACT, tokenId: '1' },
    { chain: 'ethereum', contract: CONTRACT, tokenId: '2' },
  ];
  const requests: Array<{ url: string; body: unknown }> = [];
  const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(input), body: JSON.parse(String(init?.body)) });
    return Response.json({
      data: {
        collectionsPage: {
          nodes: [
            {
              artworks: [
                {
                  editions: [
                    verseEdition('1', {
                      __typename: 'ImageAsset',
                      baseUrl: 'https://versecontent.com/image/{{SIZE}}/one.png@{{FORMAT}}',
                    }),
                    verseEdition('2', {
                      __typename: 'SVGAsset',
                      baseUrl: 'ipfs://bafyArtwork/two.svg',
                      previewImageUrl: 'https://versecontent.com/image/two.jpeg',
                    }),
                  ],
                },
              ],
            },
          ],
        },
      },
    });
  };

  const result = await resolveVerseArtworkSources(
    new URL('https://verse.works/series/example-series'),
    coords,
    fetchImpl as typeof fetch,
    { html: '<html>series shell</html>' }
  );

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://verse.works/query');
  assert.deepEqual(
    (requests[0].body as { variables: unknown }).variables,
    { slug: 'example-series' }
  );
  assert.deepEqual(result, [
    { coords: coords[0], artworkSource: 'https://versecontent.com/image/source/one.png' },
    { coords: coords[1], artworkSource: 'https://ipfs.verse.works/ipfs/bafyArtwork/two.svg' },
  ]);
});

function verseApolloHtml(editions: object[]): string {
  const payload = { rehydrate: { query: { result: { editions } } } };
  const apolloObject = JSON.stringify(payload).replace('"query":{', '"query":{"data":undefined,');
  return (
    '<script>(window[Symbol.for("ApolloSSRDataTransport")] ??= []).push(' +
    apolloObject +
    ')</script>'
  );
}

function verseEdition(tokenId: string, staticAsset: object): object {
  return {
    __typename: 'Edition',
    tokenId,
    contractInfo: {
      chain: 'ETHEREUM',
      contractAddress: CONTRACT,
    },
    staticAsset,
  };
}
