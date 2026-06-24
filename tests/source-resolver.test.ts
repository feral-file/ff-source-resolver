import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { parseFindInput, resolveFindInput, resolveTokenInfo } from '../src';
import type { HeadlessPageRenderer } from '../src';

const ETH_CONTRACT = '0xababababab20053426ad1c782de9ea8444358070';
const TEZOS_CONTRACT = 'KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton';
const OPENSEA_COLLECTION_CONTRACT = '0xe293247b582759495d0320ee8a87f598cc052c5b';
const OPENSEA_STRAY_CONTRACT = '0x1111111111111111111111111111111111111111';

describe('parseFindInput', () => {
  test('Ethereum wallet address parses to address kind', () => {
    const result = parseFindInput('0xf3860788d1597cecf938424baabe976fac87dc26');
    assert.equal(result?.kind, 'address');
    if (result?.kind !== 'address') {
      throw new Error('narrowing');
    }
    assert.equal(result.chain, 'ethereum');
    assert.equal(result.address, '0xf3860788d1597cecf938424baabe976fac87dc26');
  });

  test('Tezos tz1 address parses to address kind', () => {
    const result = parseFindInput('tz1fQTvvcCy5PTt8HcUSQTu64dH9mJjjDudi');
    assert.equal(result?.kind, 'address');
    if (result?.kind !== 'address') {
      throw new Error('narrowing');
    }
    assert.equal(result.chain, 'tezos');
  });

  test('raw ethereum coordinates parse to token coords', () => {
    const result = parseFindInput(`ethereum:${ETH_CONTRACT}:5001410`);
    assert.equal(result?.kind, 'token');
    if (result?.kind !== 'token') {
      throw new Error('narrowing');
    }
    assert.equal(result.source, 'raw');
    assert.equal(result.coords.chain, 'ethereum');
    assert.equal(result.coords.contract, ETH_CONTRACT);
    assert.equal(result.coords.tokenId, '5001410');
  });

  test('raw tezos coordinates parse to token coords', () => {
    const result = parseFindInput(`tezos:${TEZOS_CONTRACT}:9201`);
    assert.equal(result?.kind, 'token');
    if (result?.kind !== 'token') {
      throw new Error('narrowing');
    }
    assert.equal(result.source, 'raw');
    assert.equal(result.coords.chain, 'tezos');
    assert.equal(result.coords.contract, TEZOS_CONTRACT);
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

  test('Objkt token URL with alias parses to objkt-alias marker', () => {
    const result = parseFindInput('https://objkt.com/tokens/hicetnunc/111068');
    assert.equal(result?.kind, 'objkt-alias');
    if (result?.kind !== 'objkt-alias') {
      throw new Error('narrowing');
    }
    assert.equal(result.alias, 'hicetnunc');
    assert.equal(result.tokenId, '111068');
  });

  test('Objkt legacy asset URL parses to token coords', () => {
    const result = parseFindInput(`https://objkt.com/asset/${TEZOS_CONTRACT}/9201`);
    assert.equal(result?.kind, 'token');
  });

  test('Objkt collection URL remains unsupported', () => {
    const result = parseFindInput('https://objkt.com/collections/KT1Whatever');
    assert.equal(result?.kind, 'unsupported');
  });

  test('OpenSea collection URL preserves the CLI collection marker', () => {
    assert.deepEqual(parseFindInput('https://opensea.io/collection/azuki'), {
      kind: 'os-collection',
      slug: 'azuki',
    });
  });

  test('Art Blocks legacy token URL parses to token coords', () => {
    const result = parseFindInput(`https://www.artblocks.io/token/${ETH_CONTRACT}-5001410`);
    assert.equal(result?.kind, 'token');
    if (result?.kind !== 'token') {
      throw new Error('narrowing');
    }
    assert.equal(result.source, 'artblocks');
    assert.equal(result.coords.chain, 'ethereum');
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

  test('Art Blocks marketplace token URL parses to token coords', () => {
    const result = parseFindInput(
      'https://www.artblocks.io/marketplace/collections/0xa7d8d9ef8d8ce8992df33d8b8cf4aebabd5bd270/tokens/78000123'
    );
    assert.equal(result?.kind, 'token');
  });

  test('Art Blocks collection slug parses to ab-collection marker', () => {
    const result = parseFindInput('https://www.artblocks.io/collection/ringers-by-dmitri-cherniak');
    assert.equal(result?.kind, 'ab-collection');
    if (result?.kind !== 'ab-collection') {
      throw new Error('narrowing');
    }
    assert.equal(result.slug, 'ringers-by-dmitri-cherniak');
  });

  test('Art Blocks legacy project URL returns unsupported with project hint', () => {
    const result = parseFindInput('https://www.artblocks.io/projects/13');
    assert.equal(result?.kind, 'unsupported');
    if (result?.kind !== 'unsupported') {
      throw new Error('narrowing');
    }
    assert.ok(result.reason.includes('/projects/'));
  });

  test('fxhash FX1 gentk URL parses to token coords', () => {
    const result = parseFindInput(
      'https://www.fxhash.xyz/gentk/FX1-KT1U6EHmNxJTkvaWJ4ThczG4FSDaHC21ssvi-1234'
    );
    assert.equal(result?.kind, 'token');
    if (result?.kind !== 'token') {
      throw new Error('narrowing');
    }
    assert.equal(result.source, 'fxhash');
    assert.equal(result.coords.chain, 'tezos');
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

  test('fxhash iteration slug parses to fxhash-iteration marker', () => {
    const result = parseFindInput('https://www.fxhash.xyz/iteration/garden-monoliths-215');
    assert.equal(result?.kind, 'fxhash-iteration');
    if (result?.kind !== 'fxhash-iteration') {
      throw new Error('narrowing');
    }
    assert.equal(result.slug, 'garden-monoliths-215');
  });

  test('fxhash bare iteration URL remains unsupported', () => {
    const result = parseFindInput('https://www.fxhash.xyz/iteration/');
    assert.equal(result?.kind, 'unsupported');
  });

  test('fxhash FX2 gentk remains unsupported', () => {
    const result = parseFindInput('https://www.fxhash.xyz/gentk/FX2-0xabc-12');
    assert.equal(result?.kind, 'unsupported');
  });

  test('fxhash legacy numeric gentk remains unsupported', () => {
    const result = parseFindInput('https://www.fxhash.xyz/gentk/12345');
    assert.equal(result?.kind, 'unsupported');
  });

  test('fxhash generative slug parses to fxhash-project marker', () => {
    const result = parseFindInput('https://www.fxhash.xyz/generative/garden-monoliths');
    assert.equal(result?.kind, 'fxhash-project');
    if (result?.kind !== 'fxhash-project') {
      throw new Error('narrowing');
    }
    assert.equal(result.slug, 'garden-monoliths');
  });

  test('fxhash project slug parses to fxhash-project marker', () => {
    const result = parseFindInput('https://www.fxhash.xyz/project/garden-monoliths');
    assert.equal(result?.kind, 'fxhash-project');
    if (result?.kind !== 'fxhash-project') {
      throw new Error('narrowing');
    }
    assert.equal(result.slug, 'garden-monoliths');
  });

  test('OpenSea Ethereum token URL parses to token coords', () => {
    const result = parseFindInput(
      'https://opensea.io/assets/ethereum/0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d/1'
    );
    assert.equal(result?.kind, 'token');
    if (result?.kind !== 'token') {
      throw new Error('narrowing');
    }
    assert.equal(result.source, 'opensea');
  });

  test('OpenSea unsupported chain returns unsupported with chain hint', () => {
    const result = parseFindInput(
      'https://opensea.io/assets/matic/0xabc1230000000000000000000000000000000000/1'
    );
    assert.equal(result?.kind, 'unsupported');
    if (result?.kind !== 'unsupported') {
      throw new Error('narrowing');
    }
    assert.ok(result.reason.includes('matic'));
  });

  test('SuperRare artwork URL parses to token coords', () => {
    const result = parseFindInput(
      'https://superrare.com/artwork/eth/0x3e930455dcBf4bC69DE9926bDAF8ef782398786f/1'
    );
    assert.equal(result?.kind, 'token');
    if (result?.kind !== 'token') {
      throw new Error('narrowing');
    }
    assert.equal(result.source, 'superrare');
    assert.equal(result.coords.chain, 'ethereum');
    assert.equal(result.coords.contract, '0x3e930455dcbf4bc69de9926bdaf8ef782398786f');
    assert.equal(result.coords.tokenId, '1');
  });

  test('SuperRare artist slug URL remains unsupported with artwork hint', () => {
    const result = parseFindInput('https://superrare.com/louisdazy/disassociative-1');
    assert.equal(result?.kind, 'unsupported');
    if (result?.kind !== 'unsupported') {
      throw new Error('narrowing');
    }
    assert.ok(result.reason.includes('/artwork/eth/'));
  });

  test('SuperRare collection URL remains unsupported with specific message', () => {
    const result = parseFindInput(
      'https://superrare.com/collection/0x3e930455dcBf4bC69DE9926bDAF8ef782398786f'
    );
    assert.equal(result?.kind, 'unsupported');
    if (result?.kind !== 'unsupported') {
      throw new Error('narrowing');
    }
    assert.ok(result.reason.includes('/collection/'));
    assert.ok(result.reason.includes('/artwork/eth/'));
  });

  test('Neort art URL parses to neort-art marker', () => {
    const result = parseFindInput('https://neort.io/art/ce3lvgkn70rlpj69ccc0');
    assert.equal(result?.kind, 'neort-art');
    if (result?.kind !== 'neort-art') {
      throw new Error('narrowing');
    }
    assert.equal(result.id, 'ce3lvgkn70rlpj69ccc0');
  });

  test('Neort art URL with query params parses to neort-art marker', () => {
    const result = parseFindInput('https://neort.io/art/ce3lvgkn70rlpj69ccc0?index=-1&origin=');
    assert.equal(result?.kind, 'neort-art');
    if (result?.kind !== 'neort-art') {
      throw new Error('narrowing');
    }
    assert.equal(result.id, 'ce3lvgkn70rlpj69ccc0');
  });

  test('Neort root URL remains unsupported with art hint', () => {
    const result = parseFindInput('https://neort.io/');
    assert.equal(result?.kind, 'unsupported');
    if (result?.kind !== 'unsupported') {
      throw new Error('narrowing');
    }
    assert.ok(result.reason.includes('/art/'));
  });

  test('Verse item URL parses to token coords', () => {
    const result = parseFindInput(
      'https://verse.works/items/ethereum/0x23b72f7458a204446983f544d655df10f70533e9/139'
    );
    assert.equal(result?.kind, 'token');
    if (result?.kind !== 'token') {
      throw new Error('narrowing');
    }
    assert.equal(result.source, 'verse');
    assert.equal(result.coords.chain, 'ethereum');
    assert.equal(result.coords.contract, '0x23b72f7458a204446983f544d655df10f70533e9');
    assert.equal(result.coords.tokenId, '139');
  });

  test('Verse series URL parses to verse-series marker', () => {
    const result = parseFindInput('https://verse.works/series/quantizer-by-harm-van-den-dorpel');
    assert.equal(result?.kind, 'verse-series');
    if (result?.kind !== 'verse-series') {
      throw new Error('narrowing');
    }
    assert.equal(result.slug, 'quantizer-by-harm-van-den-dorpel');
  });

  test('Verse unsupported item chain returns unsupported with chain hint', () => {
    const result = parseFindInput('https://verse.works/items/base/0xabc/1');
    assert.equal(result?.kind, 'unsupported');
    if (result?.kind !== 'unsupported') {
      throw new Error('narrowing');
    }
    assert.ok(result.reason.includes('base'));
  });

  test('Raster artwork URL parses to raster-artwork marker', () => {
    const result = parseFindInput('https://raster.art/artwork/split-logic-by-ricky-retouch');
    assert.equal(result?.kind, 'raster-artwork');
    if (result?.kind !== 'raster-artwork') {
      throw new Error('narrowing');
    }
    assert.equal(result.slug, 'split-logic-by-ricky-retouch');
  });

  test('Raster artwork URL with query params parses to raster-artwork marker', () => {
    const result = parseFindInput('https://raster.art/artwork/split-logic-by-ricky-retouch/?ref=x');
    assert.equal(result?.kind, 'raster-artwork');
    if (result?.kind !== 'raster-artwork') {
      throw new Error('narrowing');
    }
    assert.equal(result.slug, 'split-logic-by-ricky-retouch');
  });

  test('Raster non-artwork URL remains unsupported with artwork hint', () => {
    const result = parseFindInput('https://raster.art/explore');
    assert.equal(result?.kind, 'unsupported');
    if (result?.kind !== 'unsupported') {
      throw new Error('narrowing');
    }
    assert.ok(result.reason.includes('/artwork/'));
  });

  test('Feral File artwork URL parses to ff-url marker', () => {
    const result = parseFindInput('https://feralfile.com/exhibitions/artwork/12345');
    assert.equal(result?.kind, 'ff-url');
    if (result?.kind !== 'ff-url') {
      throw new Error('narrowing');
    }
    assert.equal(result.urlKind, 'artwork');
    assert.equal(result.identifier, '12345');
  });

  test('Feral File swapped artwork URL parses to ff-url marker', () => {
    const result = parseFindInput(
      'https://feralfile.com/exhibitions/artwork/f0240e04d64717e319584957f6a83954b029254ad1260b6320472ea8c0c5b1cf'
    );
    assert.equal(result?.kind, 'ff-url');
    if (result?.kind !== 'ff-url') {
      throw new Error('narrowing');
    }
    assert.equal(result.urlKind, 'artwork');
    assert.equal(
      result.identifier,
      'f0240e04d64717e319584957f6a83954b029254ad1260b6320472ea8c0c5b1cf'
    );
  });

  test('Feral File series URL parses to ff-url marker', () => {
    const result = parseFindInput('https://feralfile.com/exhibitions/series/some-slug');
    assert.equal(result?.kind, 'ff-url');
    if (result?.kind !== 'ff-url') {
      throw new Error('narrowing');
    }
    assert.equal(result.urlKind, 'series');
  });

  test('Feral File show URL parses to ff-url marker', () => {
    const result = parseFindInput('https://feralfile.com/exhibitions/shows/some-slug');
    assert.equal(result?.kind, 'ff-url');
    if (result?.kind !== 'ff-url') {
      throw new Error('narrowing');
    }
    assert.equal(result.urlKind, 'show');
  });

  test('empty input returns null', () => {
    assert.equal(parseFindInput(''), null);
  });

  test('non-URL junk returns null', () => {
    assert.equal(parseFindInput('hello world'), null);
  });

  test('URL from an unrecognized host returns null', () => {
    assert.equal(parseFindInput('https://example.com/foo'), null);
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
