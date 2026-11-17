import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { dp1ItemsToArtworkSourceFindings, resolveFeralFileDp1Data } from '../src/sites/feralfile/dp1';
import type { TokenCoords } from '../src/types';

const ETH_COORDS: TokenCoords = {
  chain: 'ethereum',
  contract: '0xabcdefabcdef1234567890abcdef1234567890ab',
  tokenId: '101',
};
const TEZOS_COORDS: TokenCoords = {
  chain: 'tezos',
  contract: 'KT19etLCjCCzTLFFAxsxLFsVYMRPetr2bTD5',
  tokenId: '22931',
};

const ARTWORK_PAGE_HTML =
  '<html><head>' +
  '<link rel="alternate" type="application/json" href="https://feralfile.com/artworks/artworkid/playlist.json" title="DP-1 playlist">' +
  '</head><body></body></html>';

const SERIES_PAGE_HTML =
  '<html><head>' +
  '<link rel="alternate" type="application/json" href="https://feralfile.com/series/video-series/playlist.json" title="DP-1 playlist">' +
  '</head><body></body></html>';

const EXHIBITION_PAGE_HTML =
  '<html><head>' +
  '<link rel="alternate" type="application/json" href="https://feralfile.com/exhibitions/ex-nihilo-a3c/playlist.json" title="DP-1 playlist">' +
  '<link rel="alternate" type="application/json" href="https://feralfile.com/exhibitions/ex-nihilo-a3c/channel.json" title="DP-1 channel">' +
  '</head><body></body></html>';

describe('Feral File DP-1 document resolution', () => {
  test('reads a single artwork from the page\'s declared DP-1 playlist', async () => {
    const requested: string[] = [];
    const fetchImpl = trackingFetch(requested, {
      'https://feralfile.com/artworks/artworkid': ARTWORK_PAGE_HTML,
      'https://feralfile.com/artworks/artworkid/playlist.json': JSON.stringify({
        title: 'Artwork Title',
        items: [
          {
            source: 'https://cdn.artworks.feralfile.io/previews/one.mp4',
            provenance: {
              contract: {
                chain: 'evm',
                address: ETH_COORDS.contract,
                tokenId: ETH_COORDS.tokenId,
                standard: 'erc721',
                uri: 'https://metadata.example/token.json',
              },
            },
          },
        ],
      }),
    });

    const data = await resolveFeralFileDp1Data(
      new URL('https://feralfile.com/artworks/artworkid'),
      fetchImpl,
      null
    );

    assert.equal(data.title, 'Artwork Title');
    assert.equal(data.items.length, 1);
    assert.deepEqual(requested, [
      'https://feralfile.com/artworks/artworkid',
      'https://feralfile.com/artworks/artworkid/playlist.json',
    ]);

    const findings = dp1ItemsToArtworkSourceFindings(data.items, [ETH_COORDS]);
    assert.deepEqual(findings, [
      {
        coords: ETH_COORDS,
        artworkSource: 'https://cdn.artworks.feralfile.io/previews/one.mp4',
        metadataUri: 'https://metadata.example/token.json',
        standard: 'erc721',
      },
    ]);
  });

  test('reuses already-fetched page HTML instead of requesting the page twice', async () => {
    const requested: string[] = [];
    const fetchImpl = trackingFetch(requested, {
      'https://feralfile.com/series/video-series/playlist.json': JSON.stringify({
        title: 'Video Series',
        items: [],
      }),
    });

    await resolveFeralFileDp1Data(
      new URL('https://feralfile.com/series/video-series'),
      fetchImpl,
      SERIES_PAGE_HTML
    );

    assert.deepEqual(requested, ['https://feralfile.com/series/video-series/playlist.json']);
  });

  test('credits the artist from the item\'s inline manifest', async () => {
    const fetchImpl = trackingFetch([], {
      'https://feralfile.com/series/video-series/playlist.json': JSON.stringify({
        title: 'Video Series',
        items: [
          {
            source: 'https://stream.example/video/master.m3u8',
            provenance: {
              contract: { chain: 'evm', address: ETH_COORDS.contract, tokenId: ETH_COORDS.tokenId },
            },
            inlineManifest: {
              metadata: {
                artists: [
                  {
                    name: 'Jonas Lund',
                    addresses: ['0x67e01477c7B463397313bB64a111D0baB40Ea3Da', 'tz1JonasLund'],
                    avatar: { uri: 'https://imagedelivery.net/iCRs13uicXIPOWrnuHbaKA/f894b291/public' },
                    biographies: [{ text: 'Artist bio.' }],
                  },
                ],
              },
            },
          },
        ],
      }),
    });

    const data = await resolveFeralFileDp1Data(
      new URL('https://feralfile.com/series/video-series'),
      fetchImpl,
      SERIES_PAGE_HTML
    );
    const findings = dp1ItemsToArtworkSourceFindings(data.items, [ETH_COORDS]);

    assert.deepEqual(findings[0]?.artists, [
      {
        name: 'Jonas Lund',
        addresses: ['0x67e01477c7B463397313bB64a111D0baB40Ea3Da', 'tz1JonasLund'],
        avatar: 'https://imagedelivery.net/iCRs13uicXIPOWrnuHbaKA/f894b291/public',
        bio: 'Artist bio.',
      },
    ]);
  });

  test('resolves an exhibition through its channel document, bundling every series playlist', async () => {
    const fetchImpl = trackingFetch([], {
      'https://feralfile.com/exhibitions/ex-nihilo-a3c/channel.json': JSON.stringify({
        title: 'Ex Nihilo',
        playlists: [
          'https://feralfile.com/series/series-a/playlist.json',
          'https://feralfile.com/series/series-b/playlist.json',
        ],
      }),
      'https://feralfile.com/series/series-a/playlist.json': JSON.stringify({
        items: [
          {
            source: 'https://cdn.example/a.mp4',
            provenance: { contract: { chain: 'evm', address: ETH_COORDS.contract, tokenId: '1' } },
          },
        ],
      }),
      'https://feralfile.com/series/series-b/playlist.json': JSON.stringify({
        items: [
          {
            source: 'https://cdn.example/b.mp4',
            provenance: { contract: { chain: 'tezos', address: TEZOS_COORDS.contract, tokenId: '2' } },
          },
        ],
      }),
    });

    const data = await resolveFeralFileDp1Data(
      new URL('https://feralfile.com/exhibitions/ex-nihilo-a3c'),
      fetchImpl,
      EXHIBITION_PAGE_HTML
    );

    assert.equal(data.title, 'Ex Nihilo');
    assert.equal(data.items.length, 2);
  });

  test('omits an item on a chain this package does not support, such as bitmark', async () => {
    const fetchImpl = trackingFetch([], {
      'https://feralfile.com/series/video-series/playlist.json': JSON.stringify({
        items: [
          {
            source: 'https://cdn.example/legacy.mp4',
            provenance: { contract: { chain: 'bitmark', tokenId: 'legacy-id' } },
          },
          {
            source: 'https://cdn.example/current.mp4',
            provenance: { contract: { chain: 'evm', address: ETH_COORDS.contract, tokenId: ETH_COORDS.tokenId } },
          },
        ],
      }),
    });

    const data = await resolveFeralFileDp1Data(
      new URL('https://feralfile.com/series/video-series'),
      fetchImpl,
      SERIES_PAGE_HTML
    );
    const findings = dp1ItemsToArtworkSourceFindings(data.items, [ETH_COORDS]);

    assert.deepEqual(findings, [
      { coords: ETH_COORDS, artworkSource: 'https://cdn.example/current.mp4' },
    ]);
  });

  test('does not pair differently cased Tezos contracts', async () => {
    const fetchImpl = trackingFetch([], {
      'https://feralfile.com/series/video-series/playlist.json': JSON.stringify({
        items: [
          {
            source: 'https://cdn.example/wrong.mp4',
            provenance: {
              contract: { chain: 'tezos', address: TEZOS_COORDS.contract.toLowerCase(), tokenId: TEZOS_COORDS.tokenId },
            },
          },
        ],
      }),
    });

    const data = await resolveFeralFileDp1Data(
      new URL('https://feralfile.com/series/video-series'),
      fetchImpl,
      SERIES_PAGE_HTML
    );
    const findings = dp1ItemsToArtworkSourceFindings(data.items, [TEZOS_COORDS]);

    assert.deepEqual(findings, []);
  });

  test('returns no items when the page declares no DP-1 document', async () => {
    const fetchImpl = trackingFetch([], {});

    const data = await resolveFeralFileDp1Data(
      new URL('https://feralfile.com/some/other/page'),
      fetchImpl,
      '<html><head></head><body>no DP-1 links here</body></html>'
    );

    assert.deepEqual(data, { items: [] });
  });

  test('ignores a link-shaped string embedded in a script and still finds the real link', async () => {
    const requested: string[] = [];
    const planted =
      '<script>var noise = \'<link rel="alternate" title="DP-1 playlist" href="https://evil.example/playlist.json">\';</script>' +
      '<!-- <link rel="alternate" title="DP-1 playlist" href="https://evil.example/comment.json"> -->';
    const html =
      `<html><head>${planted}` +
      '<link rel="alternate" type="application/json" href="https://feralfile.com/series/video-series/playlist.json" title="DP-1 playlist">' +
      '</head><body></body></html>';
    const fetchImpl = trackingFetch(requested, {
      'https://feralfile.com/series/video-series/playlist.json': JSON.stringify({ items: [] }),
    });

    await resolveFeralFileDp1Data(new URL('https://feralfile.com/series/video-series'), fetchImpl, html);

    assert.deepEqual(requested, ['https://feralfile.com/series/video-series/playlist.json']);
  });

  test('refuses to fetch a declared DP-1 document whose href resolves off feralfile.com', async () => {
    const requested: string[] = [];
    const html =
      '<html><head>' +
      '<link rel="alternate" type="application/json" href="https://evil.example/playlist.json" title="DP-1 playlist">' +
      '</head><body></body></html>';
    const fetchImpl = trackingFetch(requested, {});

    const data = await resolveFeralFileDp1Data(
      new URL('https://feralfile.com/series/video-series'),
      fetchImpl,
      html
    );

    assert.deepEqual(data, { items: [] });
    assert.deepEqual(requested, []);
  });

  test('skips a channel-listed series playlist whose URL resolves off feralfile.com', async () => {
    const requested: string[] = [];
    const fetchImpl = trackingFetch(requested, {
      'https://feralfile.com/exhibitions/ex-nihilo-a3c/channel.json': JSON.stringify({
        title: 'Ex Nihilo',
        playlists: [
          'https://evil.example/series-a/playlist.json',
          'https://feralfile.com/series/series-b/playlist.json',
        ],
      }),
      'https://feralfile.com/series/series-b/playlist.json': JSON.stringify({
        items: [
          {
            source: 'https://cdn.example/b.mp4',
            provenance: { contract: { chain: 'tezos', address: TEZOS_COORDS.contract, tokenId: '2' } },
          },
        ],
      }),
    });

    const data = await resolveFeralFileDp1Data(
      new URL('https://feralfile.com/exhibitions/ex-nihilo-a3c'),
      fetchImpl,
      EXHIBITION_PAGE_HTML
    );

    assert.equal(data.items.length, 1);
    assert.ok(!requested.includes('https://evil.example/series-a/playlist.json'));
  });
});

/**
 * trackingFetch builds a deterministic fetch mock over a URL -> body map,
 * recording every request URL it was asked to resolve.
 */
function trackingFetch(requested: string[], responses: Record<string, string>): typeof fetch {
  return (async (input: string | URL | Request): Promise<Response> => {
    const url = input.toString();
    requested.push(url);
    const body = responses[url];
    if (body === undefined) {
      return new Response(null, { status: 404 });
    }
    const contentType = body.trimStart().startsWith('<') ? 'text/html' : 'application/json';
    return new Response(body, { status: 200, headers: { 'Content-Type': contentType } });
  }) as typeof fetch;
}
