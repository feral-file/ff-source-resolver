/**
 * Playwright-backed live checks for resolver pages that may need rendering.
 *
 * These tests intentionally run outside the default unit suite. They exercise
 * the public HeadlessPageRenderer interface with a real browser so CI can
 * detect when a marketplace moves token links from static HTML to client-side
 * rendering, or back again.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { resolveTokenInfo, type HeadlessPageRenderer, type TokenCoords } from '../src';

const RUN_HEADLESS = process.env.RUN_HEADLESS_RESOLVER_TESTS === '1';

interface HeadlessFixture {
  name: string;
  url: string;
  expectedMethod: 'dom' | 'headless';
  expectedSource: string;
  expectedCoords: TokenCoords;
}

const HEADLESS_FIXTURES: HeadlessFixture[] = [
  {
    name: 'Art Blocks collection renders token links client-side',
    url: 'https://www.artblocks.io/collection/ringers-by-dmitri-cherniak',
    expectedMethod: 'headless',
    expectedSource: 'artblocks',
    expectedCoords: {
      chain: 'ethereum',
      contract: '0xa7d8d9ef8d8ce8992df33d8b8cf4aebabd5bd270',
      tokenId: '13000116',
    },
  },
  {
    name: 'OpenSea collection exposes embedded token JSON statically',
    url: 'https://opensea.io/collection/azuki',
    expectedMethod: 'dom',
    expectedSource: 'opensea',
    expectedCoords: {
      chain: 'ethereum',
      contract: '0xed5af388653567af2f388e6224dc7c4b3241c544',
      tokenId: '519',
    },
  },
  {
    name: 'SuperRare collection renders artwork links client-side',
    url: 'https://superrare.com/collection/0x3e930455dcbf4bc69de9926bdaf8ef782398786f',
    expectedMethod: 'headless',
    expectedSource: 'superrare',
    expectedCoords: {
      chain: 'ethereum',
      contract: '0x3e930455dcbf4bc69de9926bdaf8ef782398786f',
      tokenId: '7',
    },
  },
  {
    name: 'Verse series renders item links client-side',
    url: 'https://verse.works/series/quantizer-by-harm-van-den-dorpel',
    expectedMethod: 'headless',
    expectedSource: 'verse',
    expectedCoords: {
      chain: 'ethereum',
      contract: '0x23b72f7458a204446983f544d655df10f70533e9',
      tokenId: '216',
    },
  },
  {
    name: 'Raster artwork renders token links client-side',
    url: 'https://raster.art/artwork/split-logic-by-ricky-retouch',
    expectedMethod: 'headless',
    expectedSource: 'raster',
    expectedCoords: {
      chain: 'ethereum',
      contract: '0xf5705202462f066ac55c293f5798ae027b2f27b5',
      tokenId: '95',
    },
  },
];

describe('Playwright headless resolver fixtures', { skip: !RUN_HEADLESS }, () => {
  let browser: Browser;
  let renderer: HeadlessPageRenderer;

  before(async () => {
    browser = await chromium.launch({ headless: true });
    renderer = new PlaywrightRenderer(browser);
  });

  after(async () => {
    await browser?.close();
  });

  for (const fixture of HEADLESS_FIXTURES) {
    test(fixture.name, async () => {
      const staticResult = await resolveTokenInfo(fixture.url);
      const renderedResult = await resolveTokenInfo(fixture.url, { renderer });

      if (fixture.expectedMethod === 'headless') {
        assert.equal(staticResult.kind, 'not-found');
      }
      assert.equal(renderedResult.kind, 'token');
      if (renderedResult.kind !== 'token') {
        throw new Error('narrowing');
      }
      assert.equal(renderedResult.method, fixture.expectedMethod);
      assert.equal(renderedResult.source, fixture.expectedSource);
      assertTokenCoords(renderedResult.coords, fixture.expectedCoords);
    });
  }
});

class PlaywrightRenderer implements HeadlessPageRenderer {
  constructor(private readonly browser: Browser) {}

  /**
   * render loads a page in Chromium and returns the rendered DOM. The fixed
   * wait after DOM content handles SPA routes that populate token links after
   * hydration without forcing every site to reach network-idle.
   */
  async render(url: string): Promise<string | null> {
    const page = await this.browser.newPage({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    });
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(1500);
      return await page.content();
    } catch {
      return null;
    } finally {
      await page.close();
    }
  }
}

/**
 * assertTokenCoords compares the complete coordinates currently produced by
 * each browsed fixture. A token-id drift is a resolver signal, not a pass.
 */
function assertTokenCoords(actual: TokenCoords, expected: TokenCoords): void {
  assert.deepEqual(actual, expected);
}
