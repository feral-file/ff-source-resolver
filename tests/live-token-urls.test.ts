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
