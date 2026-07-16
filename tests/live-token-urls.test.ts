/**
 * Live URL fixture checks for marketplace URL drift.
 *
 * These fixtures were gathered by browsing the supported sites in the in-app
 * browser. The test intentionally validates resolver behavior without calling
 * credentialed marketplace APIs, so it can run nightly in GitHub Actions.
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { parseFindInput, resolveTokenInfo, resolveTokenInfos } from '../src';
import type { ParsedFindInput, TokenCoords } from '../src';

const RUN_LIVE = process.env.RUN_LIVE_RESOLVER_TESTS === '1';

interface LiveSiteUrlFixture {
  source: string;
  page: string;
  url: string;
  requestedUrl?: string;
  acceptedFinalUrls?: string[];
  expected: ExpectedParsedInput;
  expectedArtworkSource?: RegExp;
  browserNote: string;
}

interface LiveCollectionResolutionFixture {
  source: string;
  page: string;
  url: string;
  expectedMethod?: 'dom' | 'api';
  expectedSource: string;
  minTokenCount: number;
  titleIncludes?: string;
  expectedContract?: string;
  expectedChain?: TokenCoords['chain'];
  expectedToken?: TokenCoords;
  browserNote: string;
}

type ExpectedParsedInput =
  | { kind: 'token'; source: string; coords: TokenCoords }
  | { kind: 'unsupported'; reasonIncludes?: string }
  | { kind: 'objkt-collection'; slug: string }
  | { kind: 'objkt-alias'; alias: string; tokenId: string }
  | { kind: 'ab-collection'; slug: string }
  | { kind: 'os-collection'; slug: string }
  | { kind: 'fxhash-iteration'; slug: string }
  | { kind: 'fxhash-project'; slug: string }
  | { kind: 'neort-art'; id: string }
  | { kind: 'verse-series'; slug: string }
  | { kind: 'raster-artwork'; slug: string }
  | { kind: 'ff-url'; urlKind: string; identifier: string };

const LIVE_SITE_URL_FIXTURES: LiveSiteUrlFixture[] = [
  {
    source: 'objkt',
    page: 'token',
    url: 'https://objkt.com/tokens/KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton/9201',
    acceptedFinalUrls: ['https://objkt.com/tokens/hicetnunc/9201'],
    expected: {
      kind: 'token',
      source: 'objkt',
      coords: {
        chain: 'tezos',
        contract: 'KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton',
        tokenId: '9201',
      },
    },
    expectedArtworkSource: /^https:\/\/ipfs\.io\/ipfs\//,
    browserNote: 'Browser title: Behind Asteroids.',
  },
  {
    source: 'objkt',
    page: 'alias-token',
    url: 'https://objkt.com/tokens/hicetnunc/111068',
    expected: { kind: 'objkt-alias', alias: 'hicetnunc', tokenId: '111068' },
    browserNote: 'Browser title: CSRSNT-XAAI-15-of-32.png.',
  },
  {
    source: 'objkt',
    page: 'legacy-asset',
    url: 'https://objkt.com/asset/KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton/9201',
    acceptedFinalUrls: [
      'https://objkt.com/tokens/KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton/9201',
      'https://objkt.com/tokens/hicetnunc/9201',
    ],
    expected: {
      kind: 'token',
      source: 'objkt',
      coords: {
        chain: 'tezos',
        contract: 'KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton',
        tokenId: '9201',
      },
    },
    browserNote: 'Browser title: Behind Asteroids.',
  },
  {
    source: 'objkt',
    page: 'collection',
    url: 'https://objkt.com/collections/KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton',
    acceptedFinalUrls: ['https://objkt.com/collections/hicetnunc'],
    expected: { kind: 'objkt-collection', slug: 'KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton' },
    browserNote: 'Browser title: hic et nunc.',
  },
  {
    source: 'opensea',
    page: 'item',
    url: 'https://opensea.io/item/ethereum/0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d/1',
    expected: {
      kind: 'token',
      source: 'opensea',
      coords: {
        chain: 'ethereum',
        contract: '0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d',
        tokenId: '1',
      },
    },
    expectedArtworkSource: /^https:\/\//,
    browserNote: 'Browser title: #1 - Bored Ape Yacht Club | OpenSea.',
  },
  {
    source: 'opensea',
    page: 'asset',
    url: 'https://opensea.io/item/ethereum/0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d/1',
    requestedUrl: 'https://opensea.io/assets/ethereum/0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d/1',
    expected: {
      kind: 'token',
      source: 'opensea',
      coords: {
        chain: 'ethereum',
        contract: '0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d',
        tokenId: '1',
      },
    },
    browserNote: 'Browser title: #1 - Bored Ape Yacht Club | OpenSea.',
  },
  {
    source: 'opensea',
    page: 'collection',
    url: 'https://opensea.io/collection/azuki',
    expected: { kind: 'os-collection', slug: 'azuki' },
    browserNote: 'Browser title: Azuki collection.',
  },
  {
    source: 'artblocks',
    page: 'current-token',
    url: 'https://www.artblocks.io/token/1/0xa7d8d9ef8d8ce8992df33d8b8cf4aebabd5bd270/13000000',
    expected: {
      kind: 'token',
      source: 'artblocks',
      coords: {
        chain: 'ethereum',
        contract: '0xa7d8d9ef8d8ce8992df33d8b8cf4aebabd5bd270',
        tokenId: '13000000',
      },
    },
    expectedArtworkSource:
      /^https:\/\/generator\.artblocks\.io\/1\/0xa7d8d9ef8d8ce8992df33d8b8cf4aebabd5bd270\/13000000$/,
    browserNote: 'Browser title: Ringers #0 by Dmitri Cherniak | Art Blocks.',
  },
  {
    source: 'artblocks',
    page: 'legacy-token',
    url: 'https://www.artblocks.io/token/1/0xa7d8d9ef8d8ce8992df33d8b8cf4aebabd5bd270/13000000',
    requestedUrl: 'https://www.artblocks.io/token/0xa7d8d9ef8d8ce8992df33d8b8cf4aebabd5bd270-13000000',
    expected: {
      kind: 'token',
      source: 'artblocks',
      coords: {
        chain: 'ethereum',
        contract: '0xa7d8d9ef8d8ce8992df33d8b8cf4aebabd5bd270',
        tokenId: '13000000',
      },
    },
    browserNote: 'Browser title: Ringers #0 by Dmitri Cherniak | Art Blocks.',
  },
  {
    source: 'artblocks',
    page: 'collection',
    url: 'https://www.artblocks.io/collection/ringers-by-dmitri-cherniak',
    expected: { kind: 'ab-collection', slug: 'ringers-by-dmitri-cherniak' },
    browserNote: 'Browser title: Ringers by Dmitri Cherniak | Art Blocks.',
  },
  {
    source: 'fxhash',
    page: 'gentk',
    url: 'https://www.fxhash.xyz/iteration/id/FX1-KT1U6EHmNxJTkvaWJ4ThczG4FSDaHC21ssvi-1234',
    requestedUrl: 'https://www.fxhash.xyz/gentk/FX1-KT1U6EHmNxJTkvaWJ4ThczG4FSDaHC21ssvi-1234',
    acceptedFinalUrls: [
      'https://www.fxhash.xyz/gentk/FX1-KT1U6EHmNxJTkvaWJ4ThczG4FSDaHC21ssvi-1234',
      'https://www.fxhash.xyz/iteration/id/FX1-KT1U6EHmNxJTkvaWJ4ThczG4FSDaHC21ssvi-1234',
    ],
    expected: {
      kind: 'token',
      source: 'fxhash',
      coords: {
        chain: 'tezos',
        contract: 'KT1U6EHmNxJTkvaWJ4ThczG4FSDaHC21ssvi',
        tokenId: '1234',
      },
    },
    browserNote: 'Browser title: The home of digital art | fxhash.',
  },
  {
    source: 'fxhash',
    page: 'iteration-slug',
    url: 'https://www.fxhash.xyz/iteration/garden-monoliths-215',
    expected: { kind: 'fxhash-iteration', slug: 'garden-monoliths-215' },
    expectedArtworkSource: /^https:\/\/ipfs\.io\/ipfs\//,
    browserNote: 'Browser title: Garden, Monoliths #215 by zancan | fxhash.',
  },
  {
    source: 'fxhash',
    page: 'generative',
    url: 'https://www.fxhash.xyz/project/id/garden-monoliths',
    requestedUrl: 'https://www.fxhash.xyz/generative/garden-monoliths',
    expected: { kind: 'fxhash-project', slug: 'garden-monoliths' },
    browserNote: 'Browser title: The home of digital art | fxhash.',
  },
  {
    source: 'fxhash',
    page: 'project',
    url: 'https://www.fxhash.xyz/project/garden-monoliths',
    expected: { kind: 'fxhash-project', slug: 'garden-monoliths' },
    browserNote: 'Browser title: Garden, Monoliths by zancan | fxhash.',
  },
  {
    source: 'superrare',
    page: 'artwork',
    url: 'https://superrare.com/artwork/eth/0x3e930455dcbf4bc69de9926bdaf8ef782398786f/1',
    expected: {
      kind: 'token',
      source: 'superrare',
      coords: {
        chain: 'ethereum',
        contract: '0x3e930455dcbf4bc69de9926bdaf8ef782398786f',
        tokenId: '1',
      },
    },
    expectedArtworkSource: /^https:\/\//,
    browserNote: 'Browser title: Disassociative.',
  },
  {
    source: 'superrare',
    page: 'collection',
    url: 'https://superrare.com/collection/0x3e930455dcbf4bc69de9926bdaf8ef782398786f',
    expected: { kind: 'unsupported', reasonIncludes: '/collection/' },
    browserNote: 'Browser title: SuperRare.',
  },
  {
    source: 'neort',
    page: 'art',
    url: 'https://neort.io/art/ce3lvgkn70rlpj69ccc0',
    acceptedFinalUrls: ['https://neort.io/en/art/ce3lvgkn70rlpj69ccc0'],
    expected: { kind: 'neort-art', id: 'ce3lvgkn70rlpj69ccc0' },
    browserNote: 'Browser title: Multiple Dimension.',
  },
  {
    source: 'neort',
    page: 'localized-art',
    url: 'https://neort.io/en/art/ce3lvgkn70rlpj69ccc0',
    expected: { kind: 'neort-art', id: 'ce3lvgkn70rlpj69ccc0' },
    browserNote: 'Browser title: Multiple Dimension.',
  },
  {
    source: 'verse',
    page: 'item',
    url: 'https://verse.works/items/ethereum/0x23b72f7458a204446983f544d655df10f70533e9/139',
    expected: {
      kind: 'token',
      source: 'verse',
      coords: {
        chain: 'ethereum',
        contract: '0x23b72f7458a204446983f544d655df10f70533e9',
        tokenId: '139',
      },
    },
    expectedArtworkSource: /^https:\/\//,
    browserNote: 'Browser title: Quantizer 139 by Harm van den Dorpel | Verse.',
  },
  {
    source: 'verse',
    page: 'series',
    url: 'https://verse.works/series/quantizer-by-harm-van-den-dorpel',
    expected: { kind: 'verse-series', slug: 'quantizer-by-harm-van-den-dorpel' },
    browserNote: 'Browser title: Quantizer by Harm van den Dorpel | Verse.',
  },
  {
    source: 'raster',
    page: 'artwork',
    url: 'https://raster.art/artwork/split-logic-by-ricky-retouch',
    acceptedFinalUrls: ['https://www.raster.art/artwork/split-logic-by-ricky-retouch'],
    expected: { kind: 'raster-artwork', slug: 'split-logic-by-ricky-retouch' },
    browserNote: 'Browser title: Split Logic by Ricky Retouch | Raster.',
  },
  {
    source: 'raster',
    page: 'token',
    url: 'https://www.raster.art/token/ethereum/0xf5705202462f066ac55c293f5798ae027b2f27b5/95',
    expected: {
      kind: 'token',
      source: 'raster',
      coords: {
        chain: 'ethereum',
        contract: '0xf5705202462f066ac55c293f5798ae027b2f27b5',
        tokenId: '95',
      },
    },
    expectedArtworkSource: /^https:\/\//,
    browserNote: 'Browser title: Raster token page.',
  },
  {
    source: 'feralfile',
    page: 'artwork',
    url: 'https://feralfile.com/exhibitions/artwork/f0240e04d64717e319584957f6a83954b029254ad1260b6320472ea8c0c5b1cf',
    expected: {
      kind: 'ff-url',
      urlKind: 'artwork',
      identifier: 'f0240e04d64717e319584957f6a83954b029254ad1260b6320472ea8c0c5b1cf',
    },
    expectedArtworkSource: /^https:\/\//,
    browserNote: 'Browser title: Feral File | Exhibitions.',
  },
  {
    source: 'feralfile',
    page: 'show',
    url: 'https://feralfile.com/exhibitions/shows/ex-nihilo-a3c',
    expected: { kind: 'ff-url', urlKind: 'show', identifier: 'ex-nihilo-a3c' },
    browserNote: 'Browser title: Experience the Ex Nihilo art exhibition on Feral File.',
  },
];

const LIVE_COLLECTION_RESOLUTION_FIXTURES: LiveCollectionResolutionFixture[] = [
  {
    source: 'objkt',
    page: 'collection',
    url: 'https://objkt.com/collections/objkt-paint-98',
    expectedMethod: 'api',
    expectedSource: 'objkt',
    minTokenCount: 900,
    titleIncludes: 'objkt Paint 98',
    expectedChain: 'tezos',
    expectedContract: 'KT1X5W2akGCxvykmHoqoQzJfEgg1RGNGBCDd',
    expectedToken: {
      chain: 'tezos',
      contract: 'KT1X5W2akGCxvykmHoqoQzJfEgg1RGNGBCDd',
      tokenId: '1',
    },
    browserNote: 'Browser URL: https://objkt.com/collections/objkt-paint-98.',
  },
  {
    source: 'opensea',
    page: 'collection',
    url: 'https://opensea.io/collection/npc-on-chain',
    expectedMethod: 'dom',
    expectedSource: 'opensea',
    minTokenCount: 1,
    titleIncludes: 'Non Playable Character',
    expectedChain: 'ethereum',
    expectedContract: '0xa2a6063b910fc7a7a286196f6c9b62b2797fa0ae',
    browserNote: 'Browser title: Non Playable Character collection.',
  },
  {
    source: 'artblocks',
    page: 'collection',
    url: 'https://www.artblocks.io/collection/ringers-by-dmitri-cherniak',
    expectedMethod: 'api',
    expectedSource: 'artblocks',
    minTokenCount: 1000,
    titleIncludes: 'Ringers',
    expectedChain: 'ethereum',
    expectedContract: '0xa7d8d9ef8d8ce8992df33d8b8cf4aebabd5bd270',
    expectedToken: {
      chain: 'ethereum',
      contract: '0xa7d8d9ef8d8ce8992df33d8b8cf4aebabd5bd270',
      tokenId: '13000000',
    },
    browserNote: 'Browser title: Ringers by Dmitri Cherniak | Art Blocks.',
  },
  {
    source: 'fxhash',
    page: 'project',
    url: 'https://www.fxhash.xyz/project/garden-monoliths',
    expectedMethod: 'api',
    expectedSource: 'fxhash',
    minTokenCount: 250,
    titleIncludes: 'Garden, Monoliths',
    expectedChain: 'tezos',
    expectedContract: 'KT1KEa8z6vWXDJrVqtMrAeDVzsvxat3kHaCE',
    expectedToken: {
      chain: 'tezos',
      contract: 'KT1KEa8z6vWXDJrVqtMrAeDVzsvxat3kHaCE',
      tokenId: '145971',
    },
    browserNote: 'Browser title: Garden, Monoliths by zancan | fxhash.',
  },
  {
    source: 'superrare',
    page: 'chain-prefixed-collection',
    url: 'https://superrare.com/collection/1-0xf0827d0a4fcb325aaecd8269333198a21b385d85',
    expectedMethod: 'api',
    expectedSource: 'superrare',
    minTokenCount: 10,
    titleIncludes: 'Through Tubes',
    expectedChain: 'ethereum',
    expectedContract: '0xf0827d0a4fcb325aaecd8269333198a21b385d85',
    expectedToken: {
      chain: 'ethereum',
      contract: '0xf0827d0a4fcb325aaecd8269333198a21b385d85',
      tokenId: '15',
    },
    browserNote: 'Browser title: SuperRare.',
  },
  {
    source: 'verse',
    page: 'series',
    url: 'https://verse.works/series/quantizer-by-harm-van-den-dorpel',
    expectedMethod: 'api',
    expectedSource: 'verse',
    minTokenCount: 250,
    titleIncludes: 'Quantizer',
    expectedChain: 'ethereum',
    expectedContract: '0x23b72f7458a204446983f544d655df10f70533e9',
    expectedToken: {
      chain: 'ethereum',
      contract: '0x23b72f7458a204446983f544d655df10f70533e9',
      tokenId: '167',
    },
    browserNote: 'Browser title: Quantizer by Harm van den Dorpel | Verse.',
  },
  {
    source: 'raster',
    page: 'artwork',
    url: 'https://raster.art/artwork/split-logic-by-ricky-retouch',
    expectedMethod: 'api',
    expectedSource: 'raster',
    minTokenCount: 20,
    titleIncludes: 'Split Logic',
    expectedChain: 'ethereum',
    expectedContract: '0xf5705202462f066ac55c293f5798ae027b2f27b5',
    expectedToken: {
      chain: 'ethereum',
      contract: '0xf5705202462f066ac55c293f5798ae027b2f27b5',
      tokenId: '95',
    },
    browserNote: 'Browser title: Split Logic by Ricky Retouch | Raster.',
  },
  {
    source: 'feralfile',
    page: 'show',
    url: 'https://feralfile.com/exhibitions/shows/ex-nihilo-a3c',
    expectedMethod: 'api',
    expectedSource: 'feralfile',
    minTokenCount: 5,
    titleIncludes: 'Ex Nihilo',
    expectedChain: 'ethereum',
    expectedContract: '0x32c07ade321b90813220f5064842b1f34a59f322',
    browserNote: 'Browser title: Feral File | Exhibitions.',
  },
];

describe('live token URL fixtures', { skip: !RUN_LIVE }, () => {
  for (const fixture of LIVE_SITE_URL_FIXTURES) {
    test(`${fixture.source} ${fixture.page}: browsed URL remains reachable`, async () => {
      const response = await fetchTokenPage(fixture.requestedUrl ?? fixture.url);
      assert.notEqual(response.status, 404, fixture.browserNote);
      assert.ok(response.status < 500, `${fixture.source} returned ${response.status}`);
      assert.ok(
        acceptedFinalUrls(fixture).includes(normalizeUrl(response.url)),
        `${fixture.source} resolved to unexpected URL ${response.url}`
      );
    });

    test(`${fixture.source} ${fixture.page}: parseFindInput matches browsed URL shape`, () => {
      const result = parseFindInput(fixture.url);
      assertParsedInput(result, fixture.expected, fixture.browserNote);
    });

    test(`${fixture.source} ${fixture.page}: resolveTokenInfo preserves URL parser precedence`, async () => {
      if (fixture.expected.kind !== 'token') {
        return;
      }
      const result = await resolveTokenInfo(fixture.url, {
        fetch: async () => {
          throw new Error('URL parser should resolve before fetch runs.');
        },
      });
      assert.equal(result.kind, 'token', fixture.browserNote);
      if (result.kind !== 'token') {
        throw new Error('narrowing');
      }
      assert.equal(result.method, 'url');
      assert.deepEqual(result.coords, fixture.expected.coords);
    });

    if (fixture.expectedArtworkSource) {
      test(`${fixture.source} ${fixture.page}: opt-in artwork source remains playable`, async () => {
        const result = await resolveTokenInfos(fixture.url, { includeArtworkSource: true });
        assert.equal(result.kind, 'tokens', fixture.browserNote);
        if (result.kind !== 'tokens') {
          throw new Error('narrowing');
        }
        assert.ok(result.artworkSources?.length, `${fixture.source} returned no artwork source`);
        for (const finding of result.artworkSources ?? []) {
          assert.match(finding.artworkSource, fixture.expectedArtworkSource!);
        }
      });
    }
  }
});

describe('live collection resolution fixtures', { skip: !RUN_LIVE }, () => {
  for (const fixture of LIVE_COLLECTION_RESOLUTION_FIXTURES) {
    test(`${fixture.source} ${fixture.page}: resolveTokenInfos returns real collection tokens`, async () => {
      const result = await resolveTokenInfos(fixture.url);

      assert.equal(result.kind, 'tokens', fixture.browserNote);
      if (result.kind !== 'tokens') {
        throw new Error('narrowing');
      }
      assert.equal(result.source, fixture.expectedSource);
      if (fixture.expectedMethod) {
        assert.equal(result.method, fixture.expectedMethod);
      }
      assert.ok(
        result.coords.length >= fixture.minTokenCount,
        `${fixture.source} returned only ${result.coords.length} tokens`
      );
      if (fixture.titleIncludes) {
        assert.ok(result.title?.includes(fixture.titleIncludes), `Unexpected title: ${result.title}`);
      }
      if (fixture.expectedChain) {
        assert.ok(
          result.coords.some((coords) => coords.chain === fixture.expectedChain),
          `${fixture.source} returned no ${fixture.expectedChain} tokens`
        );
      }
      if (fixture.expectedContract) {
        assert.ok(
          result.coords.some((coords) => coords.contract === fixture.expectedContract),
          `${fixture.source} returned no token for ${fixture.expectedContract}`
        );
      }
      if (fixture.expectedToken) {
        const expectedToken = fixture.expectedToken;
        assert.ok(
          result.coords.some((coords) => tokenCoordsEqual(coords, expectedToken)),
          `${fixture.source} did not include expected token ${formatTokenCoords(expectedToken)}`
        );
      }
    });
  }
});

/**
 * fetchTokenPage requests a marketplace token page with browser-like headers.
 * The live suite is allowed to observe anti-bot 403s, but redirects and 404s
 * still expose useful URL-drift regressions for the resolver fixtures.
 */
async function fetchTokenPage(url: string): Promise<Response> {
  return fetch(url, {
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    },
    redirect: 'follow',
  });
}

/**
 * normalizeUrl compares only the canonical page identity. Search parameters and
 * hashes commonly carry analytics state and should not fail URL drift checks.
 */
function normalizeUrl(value: string): string {
  const url = new URL(value);
  const pathname = url.pathname.endsWith('/') && url.pathname !== '/' ? url.pathname.slice(0, -1) : url.pathname;
  return `${url.origin}${pathname}`;
}

/**
 * acceptedFinalUrls returns the URL identities allowed by a live fixture.
 * Some marketplaces use client-side routing to move legacy URLs, so HTTP fetch
 * can stop at a still-valid legacy route while the browser shows a new route.
 */
function acceptedFinalUrls(fixture: LiveSiteUrlFixture): string[] {
  const urls = new Set([fixture.url, fixture.requestedUrl ?? fixture.url, ...(fixture.acceptedFinalUrls ?? [])]);
  return [...urls].map(normalizeUrl);
}

/**
 * assertParsedInput compares only the stable parser contract for live fixtures.
 */
function assertParsedInput(
  actual: ParsedFindInput | null,
  expected: ExpectedParsedInput,
  message: string
): void {
  assert.equal(actual?.kind, expected.kind, message);
  if (!actual) {
    throw new Error('narrowing');
  }
  switch (expected.kind) {
    case 'token':
      assert.equal(actual.kind, 'token');
      if (actual.kind === 'token') {
        assert.equal(actual.source, expected.source);
        assert.deepEqual(actual.coords, expected.coords);
      }
      return;
    case 'unsupported':
      assert.equal(actual.kind, 'unsupported');
      if (actual.kind === 'unsupported' && expected.reasonIncludes) {
        assert.ok(actual.reason.includes(expected.reasonIncludes));
      }
      return;
    case 'ff-url':
      assert.equal(actual.kind, 'ff-url');
      if (actual.kind === 'ff-url') {
        assert.equal(actual.urlKind, expected.urlKind);
        assert.equal(actual.identifier, expected.identifier);
      }
      return;
    default:
      assert.deepEqual(actual, expected);
  }
}

function tokenCoordsEqual(left: TokenCoords, right: TokenCoords): boolean {
  return left.chain === right.chain && left.contract === right.contract && left.tokenId === right.tokenId;
}

function formatTokenCoords(coords: TokenCoords): string {
  return `${coords.chain}:${coords.contract}:${coords.tokenId}`;
}
