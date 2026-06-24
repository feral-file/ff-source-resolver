/**
 * Live URL fixture checks for marketplace URL drift.
 *
 * These fixtures were gathered by browsing the supported sites in the in-app
 * browser. The test intentionally validates resolver behavior without calling
 * credentialed marketplace APIs, so it can run nightly in GitHub Actions.
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { parseFindInput, resolveTokenInfo } from '../src';
import type { TokenCoords } from '../src';

const RUN_LIVE = process.env.RUN_LIVE_RESOLVER_TESTS === '1';

interface TokenUrlFixture {
  source: string;
  url: string;
  requestedUrl?: string;
  acceptedFinalUrls?: string[];
  expected: TokenCoords;
  browserNote: string;
}

const TOKEN_URL_FIXTURES: TokenUrlFixture[] = [
  {
    source: 'objkt',
    url: 'https://objkt.com/tokens/KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton/9201',
    expected: {
      chain: 'tezos',
      contract: 'KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton',
      tokenId: '9201',
    },
    browserNote: 'Browser title: objkt.com.',
  },
  {
    source: 'opensea',
    url: 'https://opensea.io/item/ethereum/0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d/1',
    requestedUrl: 'https://opensea.io/assets/ethereum/0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d/1',
    expected: {
      chain: 'ethereum',
      contract: '0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d',
      tokenId: '1',
    },
    browserNote: 'Browser title: #1 - Bored Ape Yacht Club | OpenSea.',
  },
  {
    source: 'verse',
    url: 'https://verse.works/items/ethereum/0x23b72f7458a204446983f544d655df10f70533e9/139',
    expected: {
      chain: 'ethereum',
      contract: '0x23b72f7458a204446983f544d655df10f70533e9',
      tokenId: '139',
    },
    browserNote: 'Browser title: Quantizer 139 by Harm van den Dorpel | Verse.',
  },
  {
    source: 'superrare',
    url: 'https://superrare.com/artwork/eth/0x3e930455dcBf4bC69DE9926bDAF8ef782398786f/1',
    expected: {
      chain: 'ethereum',
      contract: '0x3e930455dcbf4bc69de9926bdaf8ef782398786f',
      tokenId: '1',
    },
    browserNote: 'Browser title: Disassociative.',
  },
  {
    source: 'artblocks',
    url: 'https://www.artblocks.io/token/1/0xa7d8d9ef8d8ce8992df33d8b8cf4aebabd5bd270/13000000',
    requestedUrl: 'https://www.artblocks.io/token/0xa7d8d9ef8d8ce8992df33d8b8cf4aebabd5bd270-13000000',
    expected: {
      chain: 'ethereum',
      contract: '0xa7d8d9ef8d8ce8992df33d8b8cf4aebabd5bd270',
      tokenId: '13000000',
    },
    browserNote: 'Browser title: Ringers #0 by Dmitri Cherniak | Art Blocks.',
  },
  {
    source: 'fxhash',
    url: 'https://www.fxhash.xyz/iteration/id/FX1-KT1U6EHmNxJTkvaWJ4ThczG4FSDaHC21ssvi-1234',
    requestedUrl: 'https://www.fxhash.xyz/gentk/FX1-KT1U6EHmNxJTkvaWJ4ThczG4FSDaHC21ssvi-1234',
    acceptedFinalUrls: [
      'https://www.fxhash.xyz/gentk/FX1-KT1U6EHmNxJTkvaWJ4ThczG4FSDaHC21ssvi-1234',
      'https://www.fxhash.xyz/iteration/id/FX1-KT1U6EHmNxJTkvaWJ4ThczG4FSDaHC21ssvi-1234',
    ],
    expected: {
      chain: 'tezos',
      contract: 'KT1U6EHmNxJTkvaWJ4ThczG4FSDaHC21ssvi',
      tokenId: '1234',
    },
    browserNote: 'Browser title: The home of digital art | fxhash.',
  },
];

describe('live token URL fixtures', { skip: !RUN_LIVE }, () => {
  for (const fixture of TOKEN_URL_FIXTURES) {
    test(`${fixture.source}: browsed URL remains reachable`, async () => {
      const response = await fetchTokenPage(fixture.requestedUrl ?? fixture.url);
      assert.notEqual(response.status, 404, fixture.browserNote);
      assert.ok(response.status < 500, `${fixture.source} returned ${response.status}`);
      assert.ok(
        acceptedFinalUrls(fixture).includes(normalizeUrl(response.url)),
        `${fixture.source} resolved to unexpected URL ${response.url}`
      );
    });

    test(`${fixture.source}: parseFindInput extracts token coordinates`, () => {
      const result = parseFindInput(fixture.url);
      assert.equal(result?.kind, 'token', fixture.browserNote);
      if (result?.kind !== 'token') {
        throw new Error('narrowing');
      }
      assert.equal(result.source, fixture.source);
      assert.deepEqual(result.coords, fixture.expected);
    });

    test(`${fixture.source}: resolveTokenInfo resolves via URL parser`, async () => {
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
      assert.deepEqual(result.coords, fixture.expected);
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
function acceptedFinalUrls(fixture: TokenUrlFixture): string[] {
  return (fixture.acceptedFinalUrls ?? [fixture.url]).map(normalizeUrl);
}
