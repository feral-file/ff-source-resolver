import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { resolveRasterArtworkSources } from '../src/sites/raster/pages/source';
import type { TokenCoords } from '../src/types';

const CONTRACT = '0xf5705202462f066ac55c293f5798ae027b2f27b5';
const TEZOS_CONTRACT = 'KT19etLCjCCzTLFFAxsxLFsVYMRPetr2bTD5';
const GRAPHQL_URL = 'https://api.raster.art/graphql';
const ARTWORK_URL = 'https://raster.art/artwork/split-logic-by-ricky-retouch';

describe('Raster token URL source enrichment', () => {
  test('prefers original token content from the keyless detail endpoint', async () => {
    const coords = ethereumCoords('95');
    const requests: string[] = [];
    const fetchImpl = async (input: string | URL | Request): Promise<Response> => {
      requests.push(input.toString());
      return Response.json({
        title: 'Split Logic #95',
        description: 'A study in halves.',
        metadata: {
          content_url: 'https://ipfs.verse.works/ipfs/original-video',
          metadata_source_url: 'https://kit.raster.art/meta/95.json',
          media_hash: 'be1857f37e4eb4a5',
          media_type: 'video/2',
        },
      });
    };

    const findings = await resolveRasterArtworkSources(
      new URL(`https://www.raster.art/token/ethereum/${CONTRACT}/95`),
      [coords],
      fetchImpl as typeof fetch
    );

    assert.deepEqual(findings, [
      {
        coords,
        artworkSource: 'https://ipfs.verse.works/ipfs/original-video',
        title: 'Split Logic #95',
        description: 'A study in halves.',
        thumbnail: 'https://bits.raster.art/be18/be1857f37e4eb4a5/700.avif',
        metadataUri: 'https://kit.raster.art/meta/95.json',
      },
    ]);
    assert.deepEqual(requests, [`https://kit.raster.art/token/ethereum/${CONTRACT}/95`]);
  });

  test('converts an original IPFS URI to a browser-loadable gateway URL', async () => {
    const coords = ethereumCoords('95');
    const fetchImpl = rasterFetch({
      [`https://kit.raster.art/token/ethereum/${CONTRACT}/95`]: {
        metadata: { content_url: 'ipfs://ipfs/bafy-original/artwork.html' },
      },
    });

    const findings = await resolveRasterArtworkSources(
      new URL(`https://raster.art/token/ethereum/${CONTRACT}/95`),
      [coords],
      fetchImpl
    );

    assert.equal(findings[0]?.artworkSource, 'https://ipfs.io/ipfs/bafy-original/artwork.html');
  });

  test('never mixes hashes and types from different Raster media pairs', async () => {
    const coords = ethereumCoords('95');
    const fetchImpl = rasterFetch({
      [`https://kit.raster.art/token/ethereum/${CONTRACT}/95`]: {
        metadata: {
          media_hash: 'aaaaaaaaaaaaaaaa',
          preview_type: 'video/2',
        },
      },
    });

    const findings = await resolveRasterArtworkSources(
      new URL(`https://raster.art/token/ethereum/${CONTRACT}/95`),
      [coords],
      fetchImpl
    );

    assert.deepEqual(findings, []);
  });

  test('uses a complete preview pair when the media pair is incomplete', async () => {
    const coords = ethereumCoords('95');
    const fetchImpl = rasterFetch({
      [`https://kit.raster.art/token/ethereum/${CONTRACT}/95`]: {
        metadata: {
          media_hash: 'aaaaaaaaaaaaaaaa',
          preview_hash: 'bbbbbbbbbbbbbbbb',
          preview_type: 'image/2',
        },
      },
    });

    const findings = await resolveRasterArtworkSources(
      new URL(`https://raster.art/token/ethereum/${CONTRACT}/95`),
      [coords],
      fetchImpl
    );

    assert.equal(
      findings[0]?.artworkSource,
      'https://bits.raster.art/bbbb/bbbbbbbbbbbbbbbb/700.avif'
    );
  });
});

describe('Raster artwork source enrichment (GraphQL first)', () => {
  test('serves findings from one GraphQL enumeration without touching raster.art', async () => {
    const coords = [ethereumCoords('95'), ethereumCoords('96')];
    const requests: string[] = [];
    const fetchImpl = graphqlAwareFetch(requests, {
      graphql: graphqlArtwork({
        tokens: [
          graphqlToken('95', {
            name: 'Split Logic #95',
            contentUrl: 'ar://original-95',
            previewHash: 'be1857f37e4eb4a5',
            previewType: 'video/2',
          }),
          graphqlToken('96', {
            contentUrl: 'https://example.com/original-96.svg',
            previewHash: '0123456789abcdef',
            previewType: 'svg/1',
          }),
        ],
      }),
    });

    const findings = await resolveRasterArtworkSources(
      new URL(ARTWORK_URL),
      coords,
      fetchImpl
    );

    assert.deepEqual(findings, [
      {
        coords: coords[0],
        artworkSource: 'https://arweave.net/original-95',
        title: 'Split Logic #95',
        description: 'A study in halves.',
        artists: [{ name: 'Ricky Retouch' }],
        creditLine: 'Raster Editions',
        thumbnail: 'https://bits.raster.art/be18/be1857f37e4eb4a5/700.avif',
        standard: 'erc721',
      },
      {
        coords: coords[1],
        artworkSource: 'https://example.com/original-96.svg',
        // No per-token name, so the edition is titled the way Raster titles it.
        title: 'Split Logic #1',
        description: 'A study in halves.',
        artists: [{ name: 'Ricky Retouch' }],
        creditLine: 'Raster Editions',
        thumbnail: 'https://bits.raster.art/0123/0123456789abcdef/original',
        standard: 'erc721',
      },
    ]);
    assert.ok(requests.every((value) => !value.startsWith('https://raster.art/')));
    assert.deepEqual(requests, [GRAPHQL_URL]);
  });

  test('prefers the CDN preview over a kit detail lookup when contentUrl is empty', async () => {
    const coords = [ethereumCoords('95'), ethereumCoords('96')];
    const requests: string[] = [];
    const fetchImpl = graphqlAwareFetch(requests, {
      graphql: graphqlArtwork({
        tokens: [
          graphqlToken('95', { contentUrl: 'https://example.com/original-95.svg' }),
          graphqlToken('96', {
            contentUrl: '',
            previewHash: 'fedcba9876543210',
            previewType: 'image/2',
          }),
        ],
      }),
    });

    const findings = await resolveRasterArtworkSources(new URL(ARTWORK_URL), coords, fetchImpl);

    assert.equal(findings.length, 2);
    assert.equal(findings[0]?.artworkSource, 'https://example.com/original-95.svg');
    assert.equal(
      findings[1]?.artworkSource,
      'https://bits.raster.art/fedc/fedcba9876543210/700.avif'
    );
    // The whole point: a usable preview means no per-token request at all.
    assert.deepEqual(
      requests.filter((value) => value.includes('/token/')),
      []
    );
  });

  test('falls back to a kit detail only when neither contentUrl nor preview is usable', async () => {
    // An unmapped handler key has no rendition this package can name, so the
    // detail lookup earns its request there and nowhere else.
    const coords = [ethereumCoords('96')];
    const requests: string[] = [];
    const fetchImpl = graphqlAwareFetch(requests, {
      graphql: graphqlArtwork({
        tokens: [
          graphqlToken('96', {
            contentUrl: '',
            previewHash: '0123456789abcdef',
            previewType: 'hologram/9',
          }),
        ],
      }),
      rest: {
        [`https://kit.raster.art/token/eip155%3A1/${CONTRACT}/96`]: {
          title: 'Split Logic #96',
          description: 'Token-level story.',
          metadata: {
            content_url: 'https://generator.example/96',
            metadata_source_url: 'https://api.example/token/96',
          },
        },
      },
    });

    const findings = await resolveRasterArtworkSources(new URL(ARTWORK_URL), coords, fetchImpl);

    assert.equal(findings[0]?.artworkSource, 'https://generator.example/96');
    assert.equal(findings[0]?.title, 'Split Logic #96');
    assert.equal(findings[0]?.metadataUri, 'https://api.example/token/96');
    assert.deepEqual(
      requests.filter((value) => value.includes('/token/')),
      [`https://kit.raster.art/token/eip155%3A1/${CONTRACT}/96`]
    );
  });

  test('names a nameless edition by its mint index, and never overrides a real name', async () => {
    const coords = [ethereumCoords('95'), ethereumCoords('96'), ethereumCoords('97')];
    const fetchImpl = graphqlAwareFetch([], {
      graphql: graphqlArtwork({
        tokens: [
          graphqlToken('95', { name: 'A Real Name', contentUrl: 'https://example.com/a' }),
          graphqlToken('96', { name: '', contentUrl: 'https://example.com/b' }),
          graphqlToken('97', { name: '', contentUrl: 'https://example.com/c' }),
        ],
      }),
    });

    const findings = await resolveRasterArtworkSources(new URL(ARTWORK_URL), coords, fetchImpl);

    assert.equal(findings[0]?.title, 'A Real Name');
    assert.equal(findings[1]?.title, 'Split Logic #1');
    assert.equal(findings[2]?.title, 'Split Logic #2');
  });

  test('reuses an enrichmentContext enumeration instead of querying again', async () => {
    const coords = [ethereumCoords('95')];
    const requests: string[] = [];
    const fetchImpl = graphqlAwareFetch(requests, {});

    const findings = await resolveRasterArtworkSources(
      new URL(ARTWORK_URL),
      coords,
      fetchImpl,
      {
        enrichmentContext: {
          artwork: {
            id: '2886465',
            title: 'Split Logic',
            artists: [{ name: 'Ricky Retouch' }],
            tokens: [
              {
                chainId: 'eip155:1',
                contractAddress: CONTRACT,
                tokenId: '95',
                tokenStandard: 'ERC721',
                name: null,
                contentUrl: 'https://example.com/original-95.svg',
                previewHash: null,
                previewType: null,
              },
            ],
            hasMore: false,
          },
        },
      }
    );

    assert.equal(findings[0]?.artworkSource, 'https://example.com/original-95.svg');
    assert.deepEqual(requests, []);
  });

  test('treats an empty GraphQL name as absent and takes the kit detail title', async () => {
    // Raster reports an Art Blocks token's GraphQL name as "" while the kit
    // detail carries the real one; `??` would keep the empty string.
    const coords = [ethereumCoords('95')];
    const requests: string[] = [];
    const fetchImpl = graphqlAwareFetch(requests, {
      graphql: graphqlArtwork({
        tokens: [graphqlToken('95', { name: '', contentUrl: '' })],
      }),
      rest: {
        [`https://kit.raster.art/token/eip155%3A1/${CONTRACT}/95`]: {
          title: 'Saturazione #95',
          description: '',
          metadata: { content_url: 'https://generator.example/95' },
        },
      },
    });

    const findings = await resolveRasterArtworkSources(
      new URL(ARTWORK_URL),
      coords,
      fetchImpl
    );

    assert.equal(findings[0]?.title, 'Saturazione #95');
    // An empty detail description must not shadow the artwork-level one.
    assert.equal(findings[0]?.description, 'A study in halves.');
  });

  test('falls back to preview when a needed kit detail is unavailable', async () => {
    const coords = [ethereumCoords('96')];
    const requests: string[] = [];
    const fetchImpl = graphqlAwareFetch(requests, {
      graphql: graphqlArtwork({
        tokens: [
          graphqlToken('96', {
            contentUrl: null,
            previewHash: 'fedcba9876543210',
            previewType: 'image/2',
          }),
        ],
      }),
    });

    const findings = await resolveRasterArtworkSources(
      new URL(ARTWORK_URL),
      coords,
      fetchImpl
    );

    assert.equal(
      findings[0]?.artworkSource,
      'https://bits.raster.art/fedc/fedcba9876543210/700.avif'
    );
  });

  test('batches kit detail lookups 50 at a time', async () => {
    const count = 120;
    const coords = Array.from({ length: count }, (_, index) => ethereumCoords(String(index)));
    let inFlight = 0;
    let maxInFlight = 0;
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = input.toString();
      if (url === GRAPHQL_URL) {
        return Response.json(
          graphqlArtwork({
            tokens: coords.map(({ tokenId }) => graphqlToken(tokenId, { contentUrl: '' })),
          })
        );
      }
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight -= 1;
      void init;
      return Response.json({
        metadata: { content_url: `https://generator.example/${url.split('/').pop()}` },
      });
    }) as typeof fetch;

    const findings = await resolveRasterArtworkSources(
      new URL(ARTWORK_URL),
      coords,
      fetchImpl
    );

    assert.equal(findings.length, count);
    assert.ok(maxInFlight <= 50, `max in-flight was ${maxInFlight}`);
  });

  test('falls back to the kit listing with detail lookups when GraphQL is down', async () => {
    const coords = [ethereumCoords('95')];
    const requests: string[] = [];
    const fetchImpl = (async (input: string | URL | Request): Promise<Response> => {
      const url = input.toString();
      requests.push(url);
      if (url === GRAPHQL_URL) {
        return new Response(null, { status: 503 });
      }
      if (url.includes('/artwork/2886465/tokens')) {
        return Response.json({
          tokens: [
            {
              chain_id: 'eip155:1',
              contract_address: CONTRACT,
              token_id: '95',
              name: 'Split Logic #95',
              metadata: { preview_hash: 'be1857f37e4eb4a5', preview_type: 'video/2' },
            },
          ],
          cursor: 1,
        });
      }
      if (url.includes(`/token/eip155%3A1/${CONTRACT}/95`)) {
        return Response.json({
          metadata: { content_url: 'https://generator.example/95' },
        });
      }
      return new Response(null, { status: 404 });
    }) as typeof fetch;

    const findings = await resolveRasterArtworkSources(
      new URL(ARTWORK_URL),
      coords,
      fetchImpl,
      { html: '<script>{"artworkId":2886465}</script>' }
    );

    assert.equal(findings[0]?.artworkSource, 'https://generator.example/95');
    assert.equal(findings[0]?.title, 'Split Logic #95');
    assert.ok(requests.every((value) => !value.startsWith('https://raster.art/')));
  });

  test('does not pair differently cased Tezos contracts', async () => {
    const coords: TokenCoords = {
      chain: 'tezos',
      contract: TEZOS_CONTRACT,
      tokenId: '22931',
    };
    const requests: string[] = [];
    const fetchImpl = graphqlAwareFetch(requests, {
      graphql: graphqlArtwork({
        tokens: [
          {
            chainId: 'tezos:NetXdQprcVkpaWU',
            contractAddress: TEZOS_CONTRACT.toLowerCase(),
            tokenId: coords.tokenId,
            tokenStandard: 'FA2',
            name: null,
            media: {
              contentUrl: 'https://example.com/tezos-original',
              previewHash: 'bbbbbbbbbbbbbbbb',
              previewType: 'image/2',
            },
          },
        ],
      }),
    });

    const findings = await resolveRasterArtworkSources(new URL(ARTWORK_URL), [coords], fetchImpl);

    assert.deepEqual(findings, []);
  });
});

function ethereumCoords(tokenId: string): TokenCoords {
  return { chain: 'ethereum', contract: CONTRACT, tokenId };
}

interface GraphqlTokenNode {
  chainId: string;
  contractAddress: string;
  tokenId: string;
  tokenStandard: string | null;
  name: string | null;
  media: {
    contentUrl: string | null;
    previewHash: string | null;
    previewType: string | null;
  };
}

function graphqlToken(
  tokenId: string,
  overrides: Partial<{
    name: string | null;
    contentUrl: string | null;
    previewHash: string | null;
    previewType: string | null;
  }> = {}
): GraphqlTokenNode {
  return {
    chainId: 'eip155:1',
    contractAddress: CONTRACT,
    tokenId,
    tokenStandard: 'ERC721',
    name: overrides.name ?? null,
    media: {
      contentUrl: overrides.contentUrl ?? null,
      previewHash: overrides.previewHash ?? null,
      previewType: overrides.previewType ?? null,
    },
  };
}

function graphqlArtwork(overrides: { tokens: object[] }): object {
  return {
    data: {
      artworkBySlug: {
        id: 2886465,
        title: 'Split Logic',
        description: 'A study in halves.',
        artists: [{ name: 'Ricky Retouch' }],
        platform: { name: 'Raster Editions' },
        tokens: {
          totalCount: overrides.tokens.length,
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: overrides.tokens,
        },
      },
    },
  };
}

function graphqlAwareFetch(
  requests: string[],
  responses: { graphql?: object; rest?: Record<string, unknown> }
): typeof fetch {
  return (async (input: string | URL | Request): Promise<Response> => {
    const url = input.toString();
    requests.push(url);
    if (url === GRAPHQL_URL) {
      return responses.graphql ? Response.json(responses.graphql) : new Response(null, { status: 503 });
    }
    const value = responses.rest?.[url];
    if (value === undefined) {
      return new Response(null, { status: 404 });
    }
    return Response.json(value);
  }) as typeof fetch;
}

function rasterFetch(responses: Record<string, unknown>): typeof fetch {
  return (async (input: string | URL | Request): Promise<Response> => {
    const value = responses[input.toString()];
    if (value === undefined) {
      return new Response(null, { status: 404 });
    }
    return typeof value === 'string'
      ? new Response(value, { headers: { 'Content-Type': 'text/html' } })
      : Response.json(value);
  }) as typeof fetch;
}
