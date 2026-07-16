import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { resolveRasterArtworkSources } from '../src/sites/raster/pages/source';
import type { TokenCoords } from '../src/types';

const CONTRACT = '0xf5705202462f066ac55c293f5798ae027b2f27b5';

describe('Raster artwork source enrichment', () => {
  test('prefers original token content from the keyless detail endpoint', async () => {
    const coords = ethereumCoords('95');
    const requests: string[] = [];
    const fetchImpl = async (input: string | URL | Request): Promise<Response> => {
      requests.push(input.toString());
      return Response.json({
        metadata: {
          content_url: 'https://ipfs.verse.works/ipfs/original-video',
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
      },
    ]);
    assert.deepEqual(requests, [
      `https://kit.raster.art/token/ethereum/${CONTRACT}/95`,
    ]);
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

    assert.equal(
      findings[0]?.artworkSource,
      'https://ipfs.io/ipfs/bafy-original/artwork.html'
    );
  });

  test('reuses artwork HTML and batches animated, SVG, and image CDN sources', async () => {
    const coords = [ethereumCoords('95'), ethereumCoords('96'), ethereumCoords('97')];
    const requests: string[] = [];
    const fetchImpl = async (input: string | URL | Request): Promise<Response> => {
      const url = input.toString();
      requests.push(url);
      if (url.includes('/artwork/2886465/tokens?cursor=0')) {
        return Response.json({
          tokens: [
            rasterToken('95', 'be1857f37e4eb4a5', 'video/2'),
            rasterToken('not-requested', 'aaaaaaaaaaaaaaaa', 'image/2'),
          ],
          cursor: 2,
        });
      }
      if (url.includes('/artwork/2886465/tokens?cursor=2')) {
        return Response.json({
          tokens: [
            rasterToken('96', '0123456789abcdef', 'svg/1'),
            rasterToken('97', 'fedcba9876543210', 'image/2'),
          ],
          cursor: 4,
        });
      }
      return new Response(null, { status: 404 });
    };

    const findings = await resolveRasterArtworkSources(
      new URL('https://raster.art/artwork/split-logic-by-ricky-retouch'),
      coords,
      fetchImpl as typeof fetch,
      { html: '<script>{"artworkId":2886465}</script>' }
    );

    assert.deepEqual(findings, [
      {
        coords: coords[0],
        artworkSource:
          'https://bits.raster.art/be18/be1857f37e4eb4a5/1500-anim.avif',
      },
      {
        coords: coords[1],
        artworkSource: 'https://bits.raster.art/0123/0123456789abcdef/original',
      },
      {
        coords: coords[2],
        artworkSource: 'https://bits.raster.art/fedc/fedcba9876543210/7200.avif',
      },
    ]);
    assert.equal(requests.length, 2);
    assert.ok(requests.every((value) => value.startsWith('https://kit.raster.art/')));
  });

  test('fetches an artwork page only when reusable HTML was not provided', async () => {
    const coords = ethereumCoords('95');
    const pageUrl = 'https://raster.art/artwork/split-logic-by-ricky-retouch';
    const fetchImpl = rasterFetch({
      [pageUrl]: '<script>{"artworkId":2886465}</script>',
      'https://kit.raster.art/artwork/2886465/tokens?cursor=0&page_size=100&sort=listing&sort_direction=asc': {
        tokens: [rasterToken('95', 'abcdef1234567890', 'image/1')],
        cursor: 1,
      },
    });

    const findings = await resolveRasterArtworkSources(
      new URL(pageUrl),
      [coords],
      fetchImpl
    );

    assert.equal(
      findings[0]?.artworkSource,
      'https://bits.raster.art/abcd/abcdef1234567890/1500.avif'
    );
  });
});

function ethereumCoords(tokenId: string): TokenCoords {
  return { chain: 'ethereum', contract: CONTRACT, tokenId };
}

function rasterToken(tokenId: string, previewHash: string, previewType: string): object {
  return {
    chain_id: 'eip155:1',
    contract_address: CONTRACT,
    token_id: tokenId,
    metadata: { preview_hash: previewHash, preview_type: previewType },
  };
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
