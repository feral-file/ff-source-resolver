import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { resolveSuperRareArtworkSources } from '../src/sites/superrare/pages/source';
import type { TokenCoords } from '../src/types';

const CONTRACT = '0x3e930455dcbf4bc69de9926bdaf8ef782398786f';

describe('SuperRare artwork source enrichment', () => {
  test('reuses matching page state and prefers original video over its image', async () => {
    const coords = token('1');
    const html = embeddedNftHtml(coords, {
      html: null,
      video: { uri: 'https://storage.googleapis.com/original-artwork.mp4' },
      image: { uri: 'https://superrare-artworks.imgix.net/thumbnail.gif' },
    });
    let fetchCalls = 0;

    const findings = await resolveSuperRareArtworkSources(
      new URL(`https://superrare.com/artwork/eth/${CONTRACT}/1`),
      [coords],
      async () => {
        fetchCalls += 1;
        throw new Error('page state should avoid an API request');
      },
      { html }
    );

    assert.equal(fetchCalls, 0);
    assert.deepEqual(findings, [
      {
        coords,
        artworkSource: 'https://storage.googleapis.com/original-artwork.mp4',
      },
    ]);
  });

  test('anchors embedded media to exact coordinates and prefers interactive HTML', async () => {
    const expected = token('2');
    const unrelated = token('99');
    const html = [
      embeddedNftHtml(unrelated, {
        video: { uri: 'https://cdn.example/unrelated.mp4' },
      }),
      embeddedNftHtml(expected, {
        html: { uri: 'ipfs://QmInteractive/index.html' },
        video: { uri: 'https://cdn.example/fallback.mp4' },
      }),
    ].join('');

    const findings = await resolveSuperRareArtworkSources(
      new URL(`https://superrare.com/collection/${CONTRACT}`),
      [expected],
      async () => {
        throw new Error('matching page state should avoid an API request');
      },
      { html }
    );

    assert.equal(findings[0]?.artworkSource, 'https://ipfs.io/ipfs/QmInteractive/index.html');
  });

  test('does not borrow original media from a following embedded NFT', async () => {
    const expected = token('2');
    const unrelated = token('99');
    const html = [
      embeddedNftPayload(expected, { mediaDetails: {} }),
      embeddedNftHtml(unrelated, {
        video: { uri: 'https://cdn.example/unrelated.mp4' },
      }),
    ].join('');
    let apiCalls = 0;
    const fetchImpl = async (): Promise<Response> => {
      apiCalls += 1;
      return Response.json({
        data: {
          getNfts: {
            nfts: [
              apiNft(expected, {
                mediaDetails: {
                  original: { image: { uri: 'https://cdn.example/expected.png' } },
                },
              }),
            ],
          },
        },
      });
    };

    const findings = await resolveSuperRareArtworkSources(
      new URL(`https://superrare.com/collection/${CONTRACT}`),
      [expected],
      fetchImpl as typeof fetch,
      { html }
    );

    assert.equal(apiCalls, 1);
    assert.deepEqual(findings, [
      { coords: expected, artworkSource: 'https://cdn.example/expected.png' },
    ]);
  });

  test('does not scan into the next NFT when embedded metadata is absent', async () => {
    const expected = token('2');
    const unrelated = token('99');
    const html = [
      embeddedNftRecord({ universalTokenId: `1-${expected.contract}-${expected.tokenId}` }),
      embeddedNftHtml(unrelated, {
        video: { uri: 'https://cdn.example/unrelated.mp4' },
      }),
    ].join('');
    let apiCalls = 0;
    const fetchImpl = async (): Promise<Response> => {
      apiCalls += 1;
      return Response.json({ data: { getNfts: { nfts: [] } } });
    };

    const findings = await resolveSuperRareArtworkSources(
      new URL(`https://superrare.com/collection/${CONTRACT}`),
      [expected],
      fetchImpl as typeof fetch,
      { html }
    );

    assert.equal(apiCalls, 1);
    assert.deepEqual(findings, []);
  });

  test('normalizes a prefixed IPFS original from the exact embedded NFT', async () => {
    const coords = token('3');
    const html = embeddedNftHtml(coords, {
      html: { uri: 'ipfs://ipfs/QmInteractive/index.html' },
    });

    const findings = await resolveSuperRareArtworkSources(
      new URL(`https://superrare.com/artwork/eth/${CONTRACT}/3`),
      [coords],
      async () => {
        throw new Error('embedded media should avoid an API request');
      },
      { html }
    );

    assert.equal(findings[0]?.artworkSource, 'https://ipfs.io/ipfs/QmInteractive/index.html');
  });

  test('batches unresolved tokens and falls back to canonical raw animation media', async () => {
    const first = token('1');
    const second = token('2');
    const requests: Array<Record<string, unknown>> = [];
    const fetchImpl = async (_input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const body = JSON.parse(String(init?.body)) as {
        query: string;
        variables: Record<string, unknown>;
      };
      requests.push(body.variables);
      return Response.json({
        data: {
          getNfts: {
            nfts: [
              apiNft(second, {
                mediaDetails: { original: null },
                rawMetadata: { animation_url: 'ar://animation-transaction' },
              }),
              apiNft(first, {
                mediaDetails: {
                  original: {
                    image: { uri: 'https://storage.googleapis.com/original-image.png' },
                  },
                },
              }),
            ],
          },
        },
      });
    };

    const findings = await resolveSuperRareArtworkSources(
      new URL(`https://superrare.com/collection/${CONTRACT}`),
      [first, second],
      fetchImpl as typeof fetch
    );

    assert.equal(requests.length, 1);
    assert.deepEqual(
      (requests[0].filter as { universalTokenId: { in: string[] } }).universalTokenId.in,
      [`1-${CONTRACT}-1`, `1-${CONTRACT}-2`]
    );
    assert.equal(
      (requests[0].nftPagination as { take: number }).take,
      2
    );
    assert.deepEqual(
      findings.map(({ artworkSource }) => artworkSource),
      [
        'https://storage.googleapis.com/original-image.png',
        'https://arweave.net/animation-transaction',
      ]
    );
  });

  test('caps GraphQL source batches at 100 tokens', async () => {
    const coords = Array.from({ length: 101 }, (_, index) => token(String(index + 1)));
    const batchSizes: number[] = [];
    const fetchImpl = async (_input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const body = JSON.parse(String(init?.body)) as {
        variables: { nftPagination: { take: number } };
      };
      batchSizes.push(body.variables.nftPagination.take);
      return Response.json({ data: { getNfts: { nfts: [] } } });
    };

    const findings = await resolveSuperRareArtworkSources(
      new URL(`https://superrare.com/collection/${CONTRACT}`),
      coords,
      fetchImpl as typeof fetch
    );

    assert.deepEqual(batchSizes, [100, 1]);
    assert.deepEqual(findings, []);
  });
});

function token(tokenId: string): TokenCoords {
  return { chain: 'ethereum', contract: CONTRACT, tokenId };
}

function embeddedNftHtml(coords: TokenCoords, original: unknown): string {
  return embeddedNftPayload(coords, { mediaDetails: { original } });
}

function embeddedNftPayload(coords: TokenCoords, metadata: unknown): string {
  return embeddedNftRecord({
    universalTokenId: `1-${coords.contract}-${coords.tokenId}`,
    metadata,
  });
}

function embeddedNftRecord(record: Record<string, unknown>): string {
  const payload = JSON.stringify(record);
  return `<script>self.__next_f.push([1,"${payload.replace(/"/g, '\\"')}"])</script>`;
}

function apiNft(coords: TokenCoords, metadata: unknown): Record<string, unknown> {
  return {
    chainId: '1',
    contractAddress: coords.contract,
    tokenId: coords.tokenId,
    metadata,
  };
}
