import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { resolveFeralFileArtworkSources } from '../src/sites/feralfile/pages/source';
import type { TokenCoords } from '../src/types';

const ETH_COORDS: TokenCoords = {
  chain: 'ethereum',
  contract: '0xABCDEFabcdef1234567890ABCDEFabcdef123456',
  tokenId: '101',
};
const TEZOS_COORDS: TokenCoords = {
  chain: 'tezos',
  contract: 'KT19etLCjCCzTLFFAxsxLFsVYMRPetr2bTD5',
  tokenId: '22931',
};

describe('Feral File artwork source enrichment', () => {
  test('resolves a relative interactive preview without requesting its thumbnail', async () => {
    const requested: string[] = [];
    const fetchImpl = async (input: string | URL | Request): Promise<Response> => {
      const url = input.toString();
      requested.push(url);
      if (url === 'https://feralfile.com/api/artworks/artworkid?includeArtist=true') {
        return Response.json({
          result: {
            seriesID: 'series-id',
            index: 4,
            chain: 'ethereum',
            contractAddress: ETH_COORDS.contract.toLowerCase(),
            tokenID: 101,
            previewURI: 'previews/series-id/version/?edition_number=4',
            thumbnailURI: 'thumbnails/series-id/version/large.jpg',
          },
        });
      }
      return new Response(null, { status: 404 });
    };

    const findings = await resolveFeralFileArtworkSources(
      new URL('https://feralfile.com/exhibitions/artwork/artworkid'),
      [ETH_COORDS],
      fetchImpl as typeof fetch
    );

    assert.deepEqual(findings, [
      {
        coords: ETH_COORDS,
        artworkSource:
          'https://cdn.feralfileassets.com/previews/series-id/version/?edition_number=4',
      },
    ]);
    assert.deepEqual(requested, ['https://feralfile.com/api/artworks/artworkid?includeArtist=true']);
  });

  test('prefers an HLS stream and pairs only requested coordinates', async () => {
    const fetchImpl = feralFileFetch({
      'https://feralfile.com/api/series/video-series': {
        id: 'series-id',
        medium: 'video',
      },
      'https://feralfile.com/api/artworks?seriesID=series-id': [
        {
          chain: 'ethereum',
          contractAddress: ETH_COORDS.contract,
          tokenID: ETH_COORDS.tokenId,
          previewURI: 'previews/video/preview.mp4',
          previewDisplay: { HLS: 'https://stream.example/video/master.m3u8' },
        },
        {
          chain: 'ethereum',
          contractAddress: ETH_COORDS.contract,
          tokenID: 'not-requested',
          previewURI: 'previews/video/other.mp4',
        },
      ],
    });

    const findings = await resolveFeralFileArtworkSources(
      new URL('https://feralfile.com/exhibitions/series/video-series'),
      [ETH_COORDS],
      fetchImpl
    );

    assert.deepEqual(findings, [
      {
        coords: ETH_COORDS,
        artworkSource: 'https://stream.example/video/master.m3u8',
      },
    ]);
  });

  test('credits the series artist and collaborators from the embedded alumni account', async () => {
    const fetchImpl = feralFileFetch({
      'https://feralfile.com/api/series/collab-series': {
        id: 'series-id',
        medium: 'video',
        artist: {
          ID: '0x67e01477c7B463397313bB64a111D0baB40Ea3Da',
          alumniAccount: {
            alias: 'Jonas Lund',
            fullName: 'Jonas Lund',
            slug: 'jonas-lund-yw9',
            addresses: { ethereum: '0x67e01477c7B463397313bB64a111D0baB40Ea3Da', tezos: 'tz1JonasLund' },
            associatedAddresses: ['0x67e01477c7B463397313bB64a111D0baB40Ea3Da', '0xAssociated'],
            avatarURI: 'avatars/aDADzvsf/1638360786',
            avatarDisplay: 'https://imagedelivery.net/iCRs13uicXIPOWrnuHbaKA/f894b291/public',
            collaborationAlumniAccounts: [
              {
                // No alias: the full name stands in.
                alias: '',
                fullName: 'Collab Partner',
                slug: 'collab-partner',
                addresses: { ethereum: '0xPartner' },
                avatarDisplay: null,
              },
              null,
            ],
          },
        },
      },
      'https://feralfile.com/api/artworks?seriesID=series-id': [
        {
          seriesID: 'series-id',
          chain: 'ethereum',
          contractAddress: ETH_COORDS.contract,
          tokenID: ETH_COORDS.tokenId,
          previewURI: 'previews/video/preview.mp4',
        },
      ],
    });

    const findings = await resolveFeralFileArtworkSources(
      new URL('https://feralfile.com/exhibitions/series/collab-series'),
      [ETH_COORDS],
      fetchImpl
    );

    assert.deepEqual(findings[0]?.artists, [
      {
        name: 'Jonas Lund',
        addresses: ['0x67e01477c7B463397313bB64a111D0baB40Ea3Da', 'tz1JonasLund', '0xAssociated'],
        slug: 'jonas-lund-yw9',
        avatar: 'https://imagedelivery.net/iCRs13uicXIPOWrnuHbaKA/f894b291/public',
      },
      { name: 'Collab Partner', addresses: ['0xPartner'], slug: 'collab-partner' },
    ]);
  });

  test('credits a single artwork from the artist its own request embeds', async () => {
    // The artwork record carries no artist, but `?includeArtist=true` makes
    // the same request attach a partial series with the alumni account, so a
    // direct preview is credited with exactly one request.
    const requests: string[] = [];
    const fetchImpl = feralFileFetch({
      'https://feralfile.com/api/artworks/directartwork?includeArtist=true': {
        id: 'directartwork',
        seriesID: 'series-id',
        chain: 'ethereum',
        contractAddress: ETH_COORDS.contract,
        tokenID: ETH_COORDS.tokenId,
        previewURI: 'https://cdn.example/direct.mp4',
        series: {
          id: 'series-id',
          medium: 'video',
          artist: {
            alumniAccount: {
              alias: 'Jonas Lund',
              slug: 'jonas-lund-yw9',
              addresses: { ethereum: '0x67e01477c7B463397313bB64a111D0baB40Ea3Da' },
              avatarDisplay: 'https://imagedelivery.net/iCRs13uicXIPOWrnuHbaKA/f894b291/public',
            },
          },
        },
      },
    });
    const counting = (async (input: string | URL | Request, init?: RequestInit) => {
      requests.push(String(input));
      return fetchImpl(input, init);
    }) as typeof fetch;

    const findings = await resolveFeralFileArtworkSources(
      new URL('https://feralfile.com/exhibitions/artwork/directartwork'),
      [ETH_COORDS],
      counting
    );

    assert.deepEqual(requests, [
      'https://feralfile.com/api/artworks/directartwork?includeArtist=true',
    ]);
    assert.deepEqual(findings, [
      {
        coords: ETH_COORDS,
        artworkSource: 'https://cdn.example/direct.mp4',
        artists: [
          {
            name: 'Jonas Lund',
            addresses: ['0x67e01477c7B463397313bB64a111D0baB40Ea3Da'],
            slug: 'jonas-lund-yw9',
            avatar: 'https://imagedelivery.net/iCRs13uicXIPOWrnuHbaKA/f894b291/public',
          },
        ],
      },
    ]);
  });

  test('makes an unvaried Cloudflare image URL browser-loadable', async () => {
    const cloudflare =
      'https://imagedelivery.net/account/image-id';
    const fetchImpl = feralFileFetch({
      'https://feralfile.com/api/artworks/artworkid?includeArtist=true': {
        chain: 'ethereum',
        contractAddress: ETH_COORDS.contract,
        tokenID: ETH_COORDS.tokenId,
        metadata: { previewCloudFlareURL: cloudflare },
      },
    });

    const findings = await resolveFeralFileArtworkSources(
      new URL('https://feralfile.com/exhibitions/artwork/artworkid'),
      [ETH_COORDS],
      fetchImpl
    );

    assert.equal(findings[0]?.artworkSource, `${cloudflare}/public`);
  });

  test('uses a software series preview directory when an artwork has no direct preview', async () => {
    const fetchImpl = feralFileFetch({
      'https://feralfile.com/api/series/software-series': {
        id: 'series-id',
        medium: 'software',
        uniquePreviewPath: 'previews/series-id/version/_unique-previews',
      },
      'https://feralfile.com/api/artworks?seriesID=series-id': [
        {
          seriesID: 'series-id',
          index: 8,
          chain: 'ethereum',
          contractAddress: ETH_COORDS.contract,
          tokenID: ETH_COORDS.tokenId,
        },
      ],
    });

    const findings = await resolveFeralFileArtworkSources(
      new URL('https://feralfile.com/exhibitions/series/software-series'),
      [ETH_COORDS],
      fetchImpl
    );

    assert.equal(
      findings[0]?.artworkSource,
      'https://cdn.feralfileassets.com/previews/series-id/version/_unique-previews/8/'
    );
  });

  test('does not pair differently cased Tezos contracts', async () => {
    const fetchImpl = feralFileFetch({
      'https://feralfile.com/api/series/tezos-series': {
        id: 'tezos-series',
        medium: 'software',
      },
      'https://feralfile.com/api/artworks?seriesID=tezos-series': [
        {
          chain: 'tezos',
          contractAddress: TEZOS_COORDS.contract.toLowerCase(),
          tokenID: TEZOS_COORDS.tokenId,
          previewURI: 'previews/wrong-token/index.html',
        },
      ],
    });

    const findings = await resolveFeralFileArtworkSources(
      new URL('https://feralfile.com/exhibitions/series/tezos-series'),
      [TEZOS_COORDS],
      fetchImpl
    );

    assert.deepEqual(findings, []);
  });
});

function feralFileFetch(
  responses: Record<string, unknown>
): typeof fetch {
  return (async (input: string | URL | Request): Promise<Response> => {
    const result = responses[input.toString()];
    return result === undefined
      ? new Response(null, { status: 404 })
      : Response.json({ result });
  }) as typeof fetch;
}
