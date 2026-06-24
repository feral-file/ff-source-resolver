import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { parseFindInput, resolveFindInput, resolveTokenInfo } from '../src';
import type { HeadlessPageRenderer } from '../src';

const ETH_CONTRACT = '0xababababab20053426ad1c782de9ea8444358070';
const TEZOS_CONTRACT = 'KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton';
const OPENSEA_COLLECTION_CONTRACT = '0xe293247b582759495d0320ee8a87f598cc052c5b';
const OPENSEA_STRAY_CONTRACT = '0x1111111111111111111111111111111111111111';

describe('parseFindInput', () => {
  test('raw ethereum coordinates parse to token coords', () => {
    const result = parseFindInput(`ethereum:${ETH_CONTRACT}:5001410`);
    assert.equal(result?.kind, 'token');
    if (result?.kind !== 'token') {
      throw new Error('narrowing');
    }
    assert.equal(result.source, 'raw');
    assert.deepEqual(result.coords, {
      chain: 'ethereum',
      contract: ETH_CONTRACT,
      tokenId: '5001410',
    });
  });

  test('Objkt token URL parses in the Objkt token page module', () => {
    const result = parseFindInput(`https://objkt.com/tokens/${TEZOS_CONTRACT}/9201`);
    assert.equal(result?.kind, 'token');
    if (result?.kind !== 'token') {
      throw new Error('narrowing');
    }
    assert.equal(result.source, 'objkt');
    assert.equal(result.coords.chain, 'tezos');
  });

  test('OpenSea collection URL preserves the CLI collection marker', () => {
    assert.deepEqual(parseFindInput('https://opensea.io/collection/azuki'), {
      kind: 'os-collection',
      slug: 'azuki',
    });
  });

  test('current Art Blocks token redirect URL parses to token coords', () => {
    const result = parseFindInput(
      'https://www.artblocks.io/token/1/0xa7d8d9ef8d8ce8992df33d8b8cf4aebabd5bd270/13000000'
    );
    assert.equal(result?.kind, 'token');
    if (result?.kind !== 'token') {
      throw new Error('narrowing');
    }
    assert.equal(result.source, 'artblocks');
    assert.equal(result.coords.tokenId, '13000000');
  });

  test('current fxhash token redirect URL parses to token coords', () => {
    const result = parseFindInput(
      'https://www.fxhash.xyz/iteration/id/FX1-KT1U6EHmNxJTkvaWJ4ThczG4FSDaHC21ssvi-1234'
    );
    assert.equal(result?.kind, 'token');
    if (result?.kind !== 'token') {
      throw new Error('narrowing');
    }
    assert.equal(result.source, 'fxhash');
    assert.equal(result.coords.contract, 'KT1U6EHmNxJTkvaWJ4ThczG4FSDaHC21ssvi');
  });
});

describe('resolveTokenInfo fallback order', () => {
  test('URL parse wins before static DOM or headless browser inspection', async () => {
    const fetchImpl = async (): Promise<Response> => {
      throw new Error('fetch should not run');
    };
    const renderer: HeadlessPageRenderer = {
      async render(): Promise<string> {
        throw new Error('renderer should not run');
      },
    };

    const result = await resolveTokenInfo(`https://superrare.com/artwork/eth/${ETH_CONTRACT}/1`, {
      fetch: fetchImpl as typeof fetch,
      renderer,
    });
    assert.equal(result.kind, 'token');
    if (result.kind !== 'token') {
      throw new Error('narrowing');
    }
    assert.equal(result.method, 'url');
    assert.equal(result.coords.tokenId, '1');
  });

  test('static DOM lookup runs after URL parsing when a page marker is not a token', async () => {
    const fetchImpl = async (): Promise<Response> =>
      new Response(`<a href="/items/ethereum/${ETH_CONTRACT}/139">Edition</a>`, {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      });

    const result = await resolveTokenInfo('https://verse.works/series/example-series', {
      fetch: fetchImpl as typeof fetch,
    });
    assert.equal(result.kind, 'token');
    if (result.kind !== 'token') {
      throw new Error('narrowing');
    }
    assert.equal(result.method, 'dom');
    assert.deepEqual(result.coords, {
      chain: 'ethereum',
      contract: ETH_CONTRACT,
      tokenId: '139',
    });
  });

  test('optional headless renderer runs after static DOM lookup misses', async () => {
    const fetchImpl = async (): Promise<Response> =>
      new Response('<html>client shell only</html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      });
    const renderer: HeadlessPageRenderer = {
      async render(): Promise<string> {
        return `<a href="/token/${ETH_CONTRACT}-5001410">Token</a>`;
      },
    };

    const result = await resolveTokenInfo('https://artblocks.io/collection/example', {
      fetch: fetchImpl as typeof fetch,
      renderer,
    });
    assert.equal(result.kind, 'token');
    if (result.kind !== 'token') {
      throw new Error('narrowing');
    }
    assert.equal(result.method, 'headless');
    assert.equal(result.coords.tokenId, '5001410');
  });

  test('resolveFindInput returns page-inspected token before the original series marker', async () => {
    const fetchImpl = async (): Promise<Response> =>
      new Response(`<a href="/items/ethereum/${ETH_CONTRACT}/42">Edition</a>`, {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      });
    const result = await resolveFindInput('https://verse.works/series/example-series', {
      fetch: fetchImpl as typeof fetch,
    });
    assert.equal(result?.kind, 'token');
    if (result?.kind !== 'token') {
      throw new Error('narrowing');
    }
    assert.equal(result.coords.tokenId, '42');
  });
});

describe('OpenSea DOM extraction', () => {
  test('selects dominant contract and lowest tokenId, ignoring unrelated payment-token JSON', async () => {
    const html =
      '<html><script>' +
      '{"symbol":"WETH","contractAddress":"0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"}' +
      openSeaItem('ethereum', OPENSEA_COLLECTION_CONTRACT, '97') +
      openSeaItem('ethereum', OPENSEA_COLLECTION_CONTRACT, '15') +
      openSeaItem('ethereum', OPENSEA_COLLECTION_CONTRACT, '40') +
      openSeaItem('ethereum', OPENSEA_STRAY_CONTRACT, '7') +
      '</script></html>';
    const result = await resolveTokenInfo('https://opensea.io/collection/a-eye-after-johannes-itten', {
      fetch: htmlFetch(html) as typeof fetch,
    });
    assert.equal(result.kind, 'token');
    if (result.kind !== 'token') {
      throw new Error('narrowing');
    }
    assert.equal(result.method, 'dom');
    assert.deepEqual(result.coords, {
      chain: 'ethereum',
      contract: OPENSEA_COLLECTION_CONTRACT,
      tokenId: '15',
    });
  });

  test('compares embedded OpenSea tokenIds as BigInt', async () => {
    const big = '106531167402379141148776360336529888293057364703212462867524098456103606550529';
    const html =
      openSeaItem('ethereum', OPENSEA_COLLECTION_CONTRACT, big) +
      openSeaItem('ethereum', OPENSEA_COLLECTION_CONTRACT, '9');
    const result = await resolveTokenInfo('https://opensea.io/collection/big-ids', {
      fetch: htmlFetch(html) as typeof fetch,
    });
    assert.equal(result.kind, 'token');
    if (result.kind !== 'token') {
      throw new Error('narrowing');
    }
    assert.equal(result.coords.tokenId, '9');
  });

  test('does not return non-Ethereum OpenSea collection candidates', async () => {
    const html =
      openSeaItem('matic', OPENSEA_STRAY_CONTRACT, '1') +
      openSeaItem('matic', OPENSEA_STRAY_CONTRACT, '2');
    const result = await resolveTokenInfo('https://opensea.io/collection/polygon-collection', {
      fetch: htmlFetch(html) as typeof fetch,
    });
    assert.equal(result.kind, 'not-found');
  });
});

/**
 * htmlFetch builds a deterministic HTML fetch mock for resolver tests.
 */
function htmlFetch(html: string): () => Promise<Response> {
  return async () =>
    new Response(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    });
}

/**
 * openSeaItem returns one embedded item in OpenSea's relay-style page JSON.
 */
function openSeaItem(chain: string, contract: string, tokenId: string): string {
  return (
    `{"id":"x","chain":{"identifier":"${chain}","__typename":"Chain","arch":"EVM",` +
    `"name":"Chain"},"contractAddress":"${contract}","tokenId":"${tokenId}","isFungible":false}`
  );
}
