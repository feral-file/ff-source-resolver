import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  isValidChain,
  isValidContractAddress,
  isValidTokenCoords,
  isValidTokenId,
  isValidWalletAddress,
  normalizeContractAddress,
  normalizeTokenCoords,
  parseFindInput,
  resolveFindInput,
  resolveTokenInfo,
  resolveTokenInfos,
} from '../src';
import type { HeadlessPageRenderer } from '../src';

const ETH_CONTRACT = '0xababababab20053426ad1c782de9ea8444358070';
const TEZOS_CONTRACT = 'KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton';
const INVALID_TEZOS_CONTRACT = 'KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxto1';
const OPENSEA_COLLECTION_CONTRACT = '0xe293247b582759495d0320ee8a87f598cc052c5b';
const OPENSEA_STRAY_CONTRACT = '0x1111111111111111111111111111111111111111';
const UINT256_MAX = '115792089237316195423570985008687907853269984665640564039457584007913129639935';

describe('validation utilities', () => {
  test('validates supported chains', () => {
    assert.equal(isValidChain('ethereum'), true);
    assert.equal(isValidChain('tezos'), true);
    assert.equal(isValidChain('polygon'), false);
  });

  test('validates Ethereum contracts with EIP-55 checksum casing', () => {
    const validChecksummed = [
      '0x52908400098527886E0F7030069857D2E4169EE7',
      '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed',
      '0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359',
      '0xdbF03B407c01E7cD3CBea99509d93f8DDDC8C6FB',
      '0xD1220A0cf47c7B9Be7A2E6BA89F429762e7b9aDb',
    ];
    for (const address of validChecksummed) {
      assert.equal(isValidContractAddress('ethereum', address), true, address);
    }
    assert.equal(
      isValidContractAddress('ethereum', '0x5AAeb6053F3E94C9b9A09f33669435E7Ef1BeAed'),
      false
    );
    assert.equal(isValidContractAddress('ethereum', ETH_CONTRACT), true);
  });

  test('validates wallet addresses for raw address lookup', () => {
    assert.equal(isValidWalletAddress('ethereum', '0xf3860788d1597cecf938424baabe976fac87dc26'), true);
    assert.equal(isValidWalletAddress('tezos', 'tz1fQTvvcCy5PTt8HcUSQTu64dH9mJjjDudi'), true);
    assert.equal(isValidWalletAddress('tezos', TEZOS_CONTRACT), false);
  });

  test('validates Tezos KT1 contracts with Base58Check checksum', () => {
    assert.equal(isValidContractAddress('tezos', TEZOS_CONTRACT), true);
    assert.equal(isValidContractAddress('tezos', INVALID_TEZOS_CONTRACT), false);
    assert.equal(isValidContractAddress('tezos', 'tz1fQTvvcCy5PTt8HcUSQTu64dH9mJjjDudi'), false);
  });

  test('validates token ids by chain', () => {
    assert.equal(isValidTokenId('ethereum', UINT256_MAX), true);
    assert.equal(isValidTokenId('ethereum', (BigInt(UINT256_MAX) + 1n).toString()), false);
    assert.equal(isValidTokenId('tezos', (BigInt(UINT256_MAX) + 1n).toString()), true);
    assert.equal(isValidTokenId('tezos', '-1'), false);
  });

  test('validates full token coordinate tuples', () => {
    assert.equal(
      isValidTokenCoords({ chain: 'tezos', contract: TEZOS_CONTRACT, tokenId: '9201' }),
      true
    );
    assert.equal(
      isValidTokenCoords({ chain: 'tezos', contract: INVALID_TEZOS_CONTRACT, tokenId: '9201' }),
      false
    );
  });

  test('normalizes validated contract addresses and token coordinates', () => {
    assert.equal(
      normalizeContractAddress('ethereum', '0x5AEDA56215b167893e80B4fE645BA6d5Bab767DE'),
      '0x5aeda56215b167893e80b4fe645ba6d5bab767de'
    );
    assert.equal(normalizeContractAddress('tezos', TEZOS_CONTRACT), TEZOS_CONTRACT);
    assert.deepEqual(
      normalizeTokenCoords({
        chain: 'ethereum',
        contract: '0x5AEDA56215b167893e80B4fE645BA6d5Bab767DE',
        tokenId: '0001',
      }),
      {
        chain: 'ethereum',
        contract: '0x5aeda56215b167893e80b4fe645ba6d5bab767de',
        tokenId: '0001',
      }
    );
    assert.equal(normalizeContractAddress('tezos', INVALID_TEZOS_CONTRACT), null);
  });
});

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

  test('raw coordinates reject invalid contracts and token ids', () => {
    assert.equal(parseFindInput(`tezos:${INVALID_TEZOS_CONTRACT}:9201`), null);
    assert.equal(parseFindInput(`ethereum:${ETH_CONTRACT}:${BigInt(UINT256_MAX) + 1n}`), null);
  });

  test('raw address lookup rejects invalid Tezos checksums', () => {
    assert.equal(parseFindInput('tz1fQTvvcCy5PTt8HcUSQTu64dH9mJjjDud1'), null);
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

  test('Objkt collection URL parses to collection marker', () => {
    const result = parseFindInput('https://objkt.com/collections/KT1Whatever');
    assert.equal(result?.kind, 'objkt-collection');
  });

  test('Objkt token URL with invalid KT1 checksum remains unsupported', () => {
    const result = parseFindInput(`https://objkt.com/tokens/${INVALID_TEZOS_CONTRACT}/9201`);
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

  test('fxhash dotted iteration slug parses to fxhash-iteration marker', () => {
    const result = parseFindInput('https://www.fxhash.xyz/iteration/monogrid-1.1-ce-255');
    assert.equal(result?.kind, 'fxhash-iteration');
    if (result?.kind !== 'fxhash-iteration') {
      throw new Error('narrowing');
    }
    assert.equal(result.slug, 'monogrid-1.1-ce-255');
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

  test('fxhash browser-final project id URL parses to fxhash-project marker', () => {
    const result = parseFindInput('https://www.fxhash.xyz/project/id/garden-monoliths');
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

  test('Ethereum token URL with invalid mixed-case checksum remains unsupported', () => {
    const result = parseFindInput(
      'https://superrare.com/artwork/eth/0x5AAeb6053F3E94C9b9A09f33669435E7Ef1BeAed/1'
    );
    assert.equal(result?.kind, 'unsupported');
  });

  test('SuperRare artwork URL parses to token coords', () => {
    const result = parseFindInput(
      'https://superrare.com/artwork/eth/0x3e930455dcbf4bc69de9926bdaf8ef782398786f/1'
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
      'https://superrare.com/collection/0x3e930455dcbf4bc69de9926bdaf8ef782398786f'
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

  test('Neort browser-final localized art URL parses to neort-art marker', () => {
    const result = parseFindInput('https://neort.io/en/art/ce3lvgkn70rlpj69ccc0');
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

  test('Raster token URL parses to token coords', () => {
    const result = parseFindInput(
      'https://www.raster.art/token/ethereum/0xf5705202462f066ac55c293f5798ae027b2f27b5/95'
    );
    assert.equal(result?.kind, 'token');
    if (result?.kind !== 'token') {
      throw new Error('narrowing');
    }
    assert.equal(result.source, 'raster');
    assert.equal(result.coords.chain, 'ethereum');
    assert.equal(result.coords.contract, '0xf5705202462f066ac55c293f5798ae027b2f27b5');
    assert.equal(result.coords.tokenId, '95');
  });

  test('Raster token URL with malformed Ethereum contract remains unsupported', () => {
    const result = parseFindInput('https://raster.art/token/ethereum/not-a-contract/95');
    assert.equal(result?.kind, 'unsupported');
  });

  test('Raster token URL with malformed Tezos contract remains unsupported', () => {
    const result = parseFindInput('https://raster.art/token/tezos/not-a-contract/95');
    assert.equal(result?.kind, 'unsupported');
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
      new Response(verseItemCard(ETH_CONTRACT, '139'), {
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
        return artBlocksCard(`/token/${ETH_CONTRACT}-5001410`);
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

  test('public API lookup runs after static DOM and headless miss', async () => {
    let rendered = false;
    const fetchImpl = async (input: string | URL | Request): Promise<Response> => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === 'https://api.fxhash.xyz/graphql') {
        return Response.json({
          data: {
            objkt: {
              onChainId: 824876,
              gentkContractAddress: 'KT1U6EHmNxJTkvaWJ4ThczG4FSDaHC21ssvi',
            },
          },
        });
      }
      return new Response('<html>client shell only</html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      });
    };
    const renderer: HeadlessPageRenderer = {
      async render(): Promise<string> {
        rendered = true;
        return '<html><body>No narrow fxhash token evidence</body></html>';
      },
    };

    const result = await resolveTokenInfo('https://www.fxhash.xyz/iteration/monogrid-1.1-ce-255', {
      fetch: fetchImpl as typeof fetch,
      renderer,
    });

    assert.equal(rendered, true);
    assert.equal(result.kind, 'token');
    if (result.kind !== 'token') {
      throw new Error('narrowing');
    }
    assert.equal(result.method, 'api');
    assert.deepEqual(result.coords, {
      chain: 'tezos',
      contract: 'KT1U6EHmNxJTkvaWJ4ThczG4FSDaHC21ssvi',
      tokenId: '824876',
    });
  });

  test('resolveFindInput returns page-inspected token before the original series marker', async () => {
    const fetchImpl = async (): Promise<Response> =>
      new Response(verseItemCard(ETH_CONTRACT, '42'), {
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

describe('resolveTokenInfos collection support', () => {
  test('token URL resolves to a one-item token array', async () => {
    const result = await resolveTokenInfos(`ethereum:${ETH_CONTRACT}:5001410`);
    assert.equal(result.kind, 'tokens');
    if (result.kind !== 'tokens') {
      throw new Error('narrowing');
    }
    assert.equal(result.method, 'url');
    assert.equal(result.title, 'Ethereum 0xabab...8070 #5001410');
    assert.deepEqual(result.coords, [{ chain: 'ethereum', contract: ETH_CONTRACT, tokenId: '5001410' }]);
  });

  test('Objkt collection extracts rendered alias token links using the collection KT1', async () => {
    const html = [
      '<a href="https://tzkt.io/KT1X5W2akGCxvykmHoqoQzJfEgg1RGNGBCDd">Contract</a>',
      '<a href="/tokens/objkt-paint-98/914">Token</a>',
      '<a href="/tokens/objkt-paint-98/913?auction=e:1">Token</a>',
      '<a href="/tokens/objkt-paint-98/914">Duplicate</a>',
    ].join('');
    const result = await resolveTokenInfos('https://objkt.com/collections/objkt-paint-98', {
      fetch: htmlFetch('<html>client shell only</html>') as typeof fetch,
      renderer: { async render(): Promise<string> { return html; } },
    });

    assert.equal(result.kind, 'tokens');
    if (result.kind !== 'tokens') {
      throw new Error('narrowing');
    }
    assert.equal(result.method, 'headless');
    assert.deepEqual(result.coords, [
      { chain: 'tezos', contract: 'KT1X5W2akGCxvykmHoqoQzJfEgg1RGNGBCDd', tokenId: '914' },
      { chain: 'tezos', contract: 'KT1X5W2akGCxvykmHoqoQzJfEgg1RGNGBCDd', tokenId: '913' },
    ]);
  });

  test('Objkt collection resolves all tokens through the public GraphQL API', async () => {
    const requests: Array<{ url: string; body: unknown }> = [];
    const result = await resolveTokenInfos('https://objkt.com/collections/objkt-paint-98', {
      fetch: objktCollectionApiFetch(requests) as typeof fetch,
    });

    assert.equal(result.kind, 'tokens');
    if (result.kind !== 'tokens') {
      throw new Error('narrowing');
    }
    assert.equal(result.method, 'api');
    assert.equal(result.title, 'Objkt Paint 98');
    assert.deepEqual(result.coords, [
      { chain: 'tezos', contract: 'KT1X5W2akGCxvykmHoqoQzJfEgg1RGNGBCDd', tokenId: '914' },
      { chain: 'tezos', contract: 'KT1X5W2akGCxvykmHoqoQzJfEgg1RGNGBCDd', tokenId: '913' },
    ]);
    assert.equal(requests.length, 3);
    assert.equal(requests[1].url, 'https://data.objkt.com/v3/graphql');
  });

  test('Objkt collection contract URL resolves through the public GraphQL API', async () => {
    const requests: Array<{ url: string; body: unknown }> = [];
    const result = await resolveTokenInfos(
      'https://objkt.com/collections/KT1X5W2akGCxvykmHoqoQzJfEgg1RGNGBCDd',
      { fetch: objktCollectionApiFetch(requests) as typeof fetch }
    );

    assert.equal(result.kind, 'tokens');
    if (result.kind !== 'tokens') {
      throw new Error('narrowing');
    }
    assert.equal(result.method, 'api');
    assert.deepEqual(result.coords, [
      { chain: 'tezos', contract: 'KT1X5W2akGCxvykmHoqoQzJfEgg1RGNGBCDd', tokenId: '914' },
      { chain: 'tezos', contract: 'KT1X5W2akGCxvykmHoqoQzJfEgg1RGNGBCDd', tokenId: '913' },
    ]);
    assert.match(JSON.stringify(requests[1].body), /KT1X5W2akGCxvykmHoqoQzJfEgg1RGNGBCDd/);
  });

  test('Art Blocks collection extracts static tokens_metadata records into an array', async () => {
    const html = [
      artBlocksMetadataToken(ETH_CONTRACT, '255000641'),
      artBlocksMetadataToken(ETH_CONTRACT, '255000642'),
      artBlocksMetadataToken(ETH_CONTRACT, '255000641'),
    ].join('');
    const result = await resolveTokenInfos('https://www.artblocks.io/collection/screens-by-thomas-lin-pedersen', {
      fetch: htmlFetch(html) as typeof fetch,
    });

    assert.equal(result.kind, 'tokens');
    if (result.kind !== 'tokens') {
      throw new Error('narrowing');
    }
    assert.equal(result.method, 'dom');
    assert.deepEqual(result.coords, [
      { chain: 'ethereum', contract: ETH_CONTRACT, tokenId: '255000641' },
      { chain: 'ethereum', contract: ETH_CONTRACT, tokenId: '255000642' },
    ]);
  });

  test('Art Blocks collection extracts Flight token records when contract follows typename', async () => {
    const contract = '0xab0000000000aa06f89b268d604a9c1c41524ac6';
    const html = [
      '<script>self.__next_f.push([1,"',
      artBlocksMetadataTokenWithLateContract(contract, '498000016'),
      artBlocksMetadataTokenWithLateContract(contract, '498000022'),
      artBlocksMetadataTokenWithLateContract(contract, '498000016'),
      '"])</script>',
    ].join('');
    const result = await resolveTokenInfos('https://www.artblocks.io/collection/while-true-by-lars-wander', {
      fetch: htmlFetch(html) as typeof fetch,
    });

    assert.equal(result.kind, 'tokens');
    if (result.kind !== 'tokens') {
      throw new Error('narrowing');
    }
    assert.equal(result.method, 'dom');
    assert.deepEqual(result.coords, [
      { chain: 'ethereum', contract, tokenId: '498000016' },
      { chain: 'ethereum', contract, tokenId: '498000022' },
    ]);
  });

  test('Art Blocks collection prefers public API tokens over partial Flight payloads', async () => {
    const contract = '0xab0000000000aa06f89b268d604a9c1c41524ac6';
    const projectId = `${contract}-498`;
    const html = [
      '<script>self.__next_f.push([1,"',
      artBlocksMetadataTokenWithLateContract(contract, '498000016'),
      artBlocksMetadataTokenWithLateContract(contract, '498000022'),
      `{\\"filter_tokens_metadata_by_features_aggregate\\":{\\"aggregate\\":{\\"count\\":60}},`,
      `\\"project_id\\":\\"${projectId}\\"}`,
      '"])</script>',
    ].join('');
    const result = await resolveTokenInfos('https://www.artblocks.io/collection/while-true-by-lars-wander', {
      fetch: artBlocksCollectionApiFetch(html, [
        { chain_id: 1, token_id: '498000000', contract_address: contract },
        { chain_id: 1, token_id: '498000001', contract_address: contract },
        { chain_id: 1, token_id: '498000002', contract_address: contract },
      ]) as typeof fetch,
    });

    assert.equal(result.kind, 'tokens');
    if (result.kind !== 'tokens') {
      throw new Error('narrowing');
    }
    assert.equal(result.method, 'api');
    assert.deepEqual(result.coords, [
      { chain: 'ethereum', contract, tokenId: '498000000' },
      { chain: 'ethereum', contract, tokenId: '498000001' },
      { chain: 'ethereum', contract, tokenId: '498000002' },
    ]);
  });

  test('OpenSea collection extracts every scoped Ethereum item', async () => {
    const html = openSeaCollectionItems(
      openSeaItem('ethereum', OPENSEA_COLLECTION_CONTRACT, '97'),
      openSeaItem('ethereum', OPENSEA_COLLECTION_CONTRACT, '15'),
      openSeaItem('matic', OPENSEA_STRAY_CONTRACT, '1'),
      openSeaItem('ethereum', OPENSEA_COLLECTION_CONTRACT, '15')
    );
    const result = await resolveTokenInfos('https://opensea.io/collection/a-eye-after-johannes-itten', {
      fetch: htmlFetch(html) as typeof fetch,
    });

    assert.equal(result.kind, 'tokens');
    if (result.kind !== 'tokens') {
      throw new Error('narrowing');
    }
    assert.equal(result.method, 'dom');
    assert.equal(result.title, 'A Eye After Johannes Itten');
    assert.deepEqual(result.coords, [
      { chain: 'ethereum', contract: OPENSEA_COLLECTION_CONTRACT, tokenId: '97' },
      { chain: 'ethereum', contract: OPENSEA_COLLECTION_CONTRACT, tokenId: '15' },
    ]);
  });

  test('OpenSea collection does not call the authenticated collection NFTs API', async () => {
    const html = openSeaCollectionItems(openSeaItem('ethereum', OPENSEA_COLLECTION_CONTRACT, '97'));
    const calledUrls: string[] = [];
    const fetchImpl = async (input: string | URL | Request): Promise<Response> => {
      const url = typeof input === 'string' ? input : input.toString();
      calledUrls.push(url);
      if (url.startsWith('https://api.opensea.io/')) {
        throw new Error('OpenSea API requires x-api-key and must not be called by keyless resolution');
      }
      return new Response(html, {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      });
    };

    const result = await resolveTokenInfos('https://opensea.io/collection/a-eye-after-johannes-itten', {
      fetch: fetchImpl as typeof fetch,
    });

    assert.equal(result.kind, 'tokens');
    if (result.kind !== 'tokens') {
      throw new Error('narrowing');
    }
    assert.equal(result.method, 'dom');
    assert.deepEqual(result.coords, [
      { chain: 'ethereum', contract: OPENSEA_COLLECTION_CONTRACT, tokenId: '97' },
    ]);
    assert.deepEqual(calledUrls, ['https://opensea.io/collection/a-eye-after-johannes-itten']);
  });

  test('SuperRare collection extracts static escaped token records', async () => {
    const html = [
      'tokenId\\":1,\\"contractAddress\\":\\"0x3e930455dcbf4bc69de9926bdaf8ef782398786f\\",\\"chainId\\":\\"1\\"',
      'tokenId\\":2,\\"contractAddress\\":\\"0x3e930455dcbf4bc69de9926bdaf8ef782398786f\\",\\"chainId\\":\\"1\\"',
    ].join('');
    const result = await resolveTokenInfos(
      'https://superrare.com/collection/0x3e930455dcbf4bc69de9926bdaf8ef782398786f',
      { fetch: htmlFetch(html) as typeof fetch }
    );

    assert.equal(result.kind, 'tokens');
    if (result.kind !== 'tokens') {
      throw new Error('narrowing');
    }
    assert.deepEqual(result.coords, [
      { chain: 'ethereum', contract: '0x3e930455dcbf4bc69de9926bdaf8ef782398786f', tokenId: '1' },
      { chain: 'ethereum', contract: '0x3e930455dcbf4bc69de9926bdaf8ef782398786f', tokenId: '2' },
    ]);
  });

  test('SuperRare collection prefers paginated public API tokens over partial DOM records', async () => {
    const contract = '0x3e930455dcbf4bc69de9926bdaf8ef782398786f';
    const html =
      'tokenId\\":1,\\"contractAddress\\":\\"0x3e930455dcbf4bc69de9926bdaf8ef782398786f\\",\\"chainId\\":\\"1\\"';
    const requests: Array<{ url: string; body: unknown }> = [];
    const result = await resolveTokenInfos(`https://superrare.com/collection/${contract}`, {
      fetch: superRareCollectionApiFetch(html, requests, [
        {
          nfts: [
            { chainId: '1', contractAddress: contract, tokenId: 1 },
            { chainId: '1', contractAddress: contract, tokenId: 2 },
          ],
          hasNextPage: true,
        },
        {
          nfts: [
            { chainId: '1', contractAddress: contract, tokenId: 3 },
            { chainId: '137', contractAddress: contract, tokenId: 4 },
          ],
          hasNextPage: false,
        },
      ]) as typeof fetch,
    });

    assert.equal(result.kind, 'tokens');
    if (result.kind !== 'tokens') {
      throw new Error('narrowing');
    }
    assert.equal(result.method, 'api');
    assert.deepEqual(result.coords, [
      { chain: 'ethereum', contract, tokenId: '1' },
      { chain: 'ethereum', contract, tokenId: '2' },
      { chain: 'ethereum', contract, tokenId: '3' },
    ]);
    assert.deepEqual(
      requests.map((request) => request.url),
      [
        `https://superrare.com/collection/${contract}`,
        'https://api.superrare.com/graphql',
        'https://api.superrare.com/graphql',
      ]
    );
  });

  test('Verse series extracts rendered item card tokens into an array', async () => {
    const html = [verseItemCard(ETH_CONTRACT, '216'), verseItemCard(ETH_CONTRACT, '178')].join('');
    const result = await resolveTokenInfos('https://verse.works/series/example-series', {
      fetch: htmlFetch('<html>client shell only</html>') as typeof fetch,
      renderer: { async render(): Promise<string> { return html; } },
    });

    assert.equal(result.kind, 'tokens');
    if (result.kind !== 'tokens') {
      throw new Error('narrowing');
    }
    assert.equal(result.method, 'headless');
    assert.deepEqual(result.coords, [
      { chain: 'ethereum', contract: ETH_CONTRACT, tokenId: '216' },
      { chain: 'ethereum', contract: ETH_CONTRACT, tokenId: '178' },
    ]);
  });

  test('Verse series resolves all editions through the public GraphQL API', async () => {
    const result = await resolveTokenInfos('https://verse.works/series/quantizer-by-harm-van-den-dorpel', {
      fetch: verseSeriesApiFetch() as typeof fetch,
    });

    assert.equal(result.kind, 'tokens');
    if (result.kind !== 'tokens') {
      throw new Error('narrowing');
    }
    assert.equal(result.method, 'api');
    assert.deepEqual(result.coords, [
      { chain: 'ethereum', contract: '0x23b72f7458a204446983f544d655df10f70533e9', tokenId: '167' },
      { chain: 'ethereum', contract: '0x23b72f7458a204446983f544d655df10f70533e9', tokenId: '0' },
    ]);
  });

  test('Raster artwork extracts rendered token links into an array', async () => {
    const html = [rasterArtworkCard(ETH_CONTRACT, '95'), rasterArtworkCard(ETH_CONTRACT, '100')].join('');
    const result = await resolveTokenInfos('https://raster.art/artwork/split-logic-by-ricky-retouch', {
      fetch: htmlFetch('<html>client shell only</html>') as typeof fetch,
      renderer: { async render(): Promise<string> { return html; } },
    });

    assert.equal(result.kind, 'tokens');
    if (result.kind !== 'tokens') {
      throw new Error('narrowing');
    }
    assert.deepEqual(result.coords, [
      { chain: 'ethereum', contract: ETH_CONTRACT, tokenId: '95' },
      { chain: 'ethereum', contract: ETH_CONTRACT, tokenId: '100' },
    ]);
  });

  test('Raster artwork resolves token arrays through the public kit API', async () => {
    const result = await resolveTokenInfos('https://raster.art/artwork/split-logic-by-ricky-retouch', {
      fetch: rasterApiFetch() as typeof fetch,
    });

    assert.equal(result.kind, 'tokens');
    if (result.kind !== 'tokens') {
      throw new Error('narrowing');
    }
    assert.equal(result.method, 'api');
    assert.deepEqual(result.coords, [
      { chain: 'ethereum', contract: '0xf5705202462f066ac55c293f5798ae027b2f27b5', tokenId: '95' },
      { chain: 'ethereum', contract: '0xf5705202462f066ac55c293f5798ae027b2f27b5', tokenId: '100' },
    ]);
  });

  test('fxhash project resolves full collection through public GraphQL', async () => {
    const result = await resolveTokenInfos('https://www.fxhash.xyz/generative/slug/the-fable', {
      fetch: fxhashProjectFetch() as typeof fetch,
    });

    assert.equal(result.kind, 'tokens');
    if (result.kind !== 'tokens') {
      throw new Error('narrowing');
    }
    assert.equal(result.method, 'api');
    assert.deepEqual(result.coords, [
      { chain: 'tezos', contract: 'KT1U6EHmNxJTkvaWJ4ThczG4FSDaHC21ssvi', tokenId: '1565369' },
      { chain: 'tezos', contract: 'KT1U6EHmNxJTkvaWJ4ThczG4FSDaHC21ssvi', tokenId: '1597012' },
    ]);
  });

  test('Feral File show resolves all series artwork tokens through public API', async () => {
    const result = await resolveTokenInfos('https://feralfile.com/exhibitions/shows/ex-nihilo-a3c', {
      fetch: feralFileShowFetch() as typeof fetch,
    });

    assert.equal(result.kind, 'tokens');
    if (result.kind !== 'tokens') {
      throw new Error('narrowing');
    }
    assert.equal(result.method, 'api');
    assert.deepEqual(result.coords, [
      { chain: 'ethereum', contract: ETH_CONTRACT, tokenId: '1' },
      { chain: 'ethereum', contract: ETH_CONTRACT, tokenId: '2' },
      { chain: 'tezos', contract: TEZOS_CONTRACT, tokenId: '9201' },
    ]);
  });

  test('Feral File series resolves artwork tokens through public API', async () => {
    const result = await resolveTokenInfos('https://feralfile.com/exhibitions/series/cosmos-simulacrum', {
      fetch: feralFileSeriesFetch() as typeof fetch,
    });

    assert.equal(result.kind, 'tokens');
    if (result.kind !== 'tokens') {
      throw new Error('narrowing');
    }
    assert.equal(result.method, 'api');
    assert.deepEqual(result.coords, [
      { chain: 'ethereum', contract: ETH_CONTRACT, tokenId: '7' },
      { chain: 'tezos', contract: TEZOS_CONTRACT, tokenId: '8' },
    ]);
  });
});

describe('fxhash DOM and headless extraction', () => {
  test('ignores FX1 token paths embedded in broad static HTML', async () => {
    const html =
      '<html><head>' +
      '<script>window.__noise="/gentk/FX1-KT1U6EHmNxJTkvaWJ4ThczG4FSDaHC21ssvi-1234";</script>' +
      '</head><body>' +
      '<main><a href="/iteration/id/FX1-KT1U6EHmNxJTkvaWJ4ThczG4FSDaHC21ssvi-5678">Cached token</a></main>' +
      '</body></html>';

    const result = await resolveTokenInfo('https://www.fxhash.xyz/project/garden-monoliths', {
      fetch: htmlFetch(html) as typeof fetch,
    });

    assert.equal(result.kind, 'not-found');
  });

  test('ignores FX1 token paths embedded in broad rendered HTML', async () => {
    let rendered = false;
    const fetchImpl = async (): Promise<Response> =>
      new Response('<html>client shell only</html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      });
    const renderer: HeadlessPageRenderer = {
      async render(): Promise<string> {
        rendered = true;
        return (
          '<html><body>' +
          '<section class="min-h-[60vh]">' +
          '<a href="/gentk/FX1-KT1U6EHmNxJTkvaWJ4ThczG4FSDaHC21ssvi-1234">Cached token</a>' +
          '</section>' +
          '</body></html>'
        );
      },
    };

    const result = await resolveTokenInfo('https://www.fxhash.xyz/iteration/garden-monoliths-215', {
      fetch: fetchImpl as typeof fetch,
      renderer,
    });

    assert.equal(rendered, true);
    assert.equal(result.kind, 'not-found');
  });
});

describe('Objkt DOM and headless extraction', () => {
  test('extracts alias token coordinates from Objkt social-image metadata', async () => {
    const html = [
      `<script>window.__noise = "/tokens/${INVALID_TEZOS_CONTRACT}/111068";</script>`,
      objktSocialImageMeta(TEZOS_CONTRACT, '111068'),
    ].join('');

    const result = await resolveTokenInfo('https://objkt.com/tokens/hicetnunc/111068', {
      fetch: htmlFetch(html) as typeof fetch,
    });

    assert.equal(result.kind, 'token');
    if (result.kind !== 'token') {
      throw new Error('narrowing');
    }
    assert.equal(result.method, 'dom');
    assert.deepEqual(result.coords, {
      chain: 'tezos',
      contract: TEZOS_CONTRACT,
      tokenId: '111068',
    });
  });

  test('ignores unrelated Objkt token paths outside social-image metadata', async () => {
    const html = [
      `<script>window.__noise = "/tokens/${TEZOS_CONTRACT}/111068";</script>`,
      `<a href="/tokens/${TEZOS_CONTRACT}/111068">Cached unrelated token</a>`,
      '<meta property="og:url" content="https://objkt.com/tokens/hicetnunc/111068">',
    ].join('');

    const result = await resolveTokenInfo('https://objkt.com/tokens/hicetnunc/111068', {
      fetch: htmlFetch(html) as typeof fetch,
    });

    assert.equal(result.kind, 'not-found');
  });

  test('ignores scoped-looking Objkt social metadata inside scripts and comments', async () => {
    const meta = objktSocialImageMeta(TEZOS_CONTRACT, '111068');
    const html = `<script>window.__meta = ${JSON.stringify(meta)};</script><!-- ${meta} -->`;

    const result = await resolveTokenInfo('https://objkt.com/tokens/hicetnunc/111068', {
      fetch: htmlFetch(html) as typeof fetch,
    });

    assert.equal(result.kind, 'not-found');
  });

  test('ignores Objkt social-image metadata for a different token id', async () => {
    const result = await resolveTokenInfo('https://objkt.com/tokens/hicetnunc/111068', {
      fetch: htmlFetch(objktSocialImageMeta(TEZOS_CONTRACT, '111069')) as typeof fetch,
    });

    assert.equal(result.kind, 'not-found');
  });

  test('does not extract Objkt metadata from invalid direct KT1 token URLs', async () => {
    const result = await resolveTokenInfo(
      `https://objkt.com/tokens/${INVALID_TEZOS_CONTRACT}/111068`,
      { fetch: htmlFetch(objktSocialImageMeta(TEZOS_CONTRACT, '111068')) as typeof fetch }
    );

    assert.equal(result.kind, 'not-found');
  });

  test('extracts Objkt rendered social metadata through the headless fallback', async () => {
    const fetchImpl = async (): Promise<Response> =>
      new Response('<html>client shell only</html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      });
    const renderer: HeadlessPageRenderer = {
      async render(): Promise<string> {
        return objktSocialImageMeta(TEZOS_CONTRACT, '111068');
      },
    };

    const result = await resolveTokenInfo('https://objkt.com/tokens/hicetnunc/111068', {
      fetch: fetchImpl as typeof fetch,
      renderer,
    });

    assert.equal(result.kind, 'token');
    if (result.kind !== 'token') {
      throw new Error('narrowing');
    }
    assert.equal(result.method, 'headless');
    assert.deepEqual(result.coords, {
      chain: 'tezos',
      contract: TEZOS_CONTRACT,
      tokenId: '111068',
    });
  });
});

describe('Art Blocks DOM extraction', () => {
  test('extracts token links from scoped collection cards', async () => {
    const html =
      `<script>window.__noise = "/token/${ETH_CONTRACT}-999";</script>` +
      artBlocksCard(`/token/${ETH_CONTRACT}-5001410`);
    const result = await resolveTokenInfo('https://artblocks.io/collection/example', {
      fetch: htmlFetch(html) as typeof fetch,
    });

    assert.equal(result.kind, 'token');
    if (result.kind !== 'token') {
      throw new Error('narrowing');
    }
    assert.equal(result.method, 'dom');
    assert.deepEqual(result.coords, {
      chain: 'ethereum',
      contract: ETH_CONTRACT,
      tokenId: '5001410',
    });
  });

  test('ignores unrelated Art Blocks token paths outside scoped cards', async () => {
    const html =
      `<script>window.__noise = "/token/${ETH_CONTRACT}-999";</script>` +
      `<a href="/token/${ETH_CONTRACT}-888">Out of scope</a>`;
    const result = await resolveTokenInfo('https://artblocks.io/collection/example', {
      fetch: htmlFetch(html) as typeof fetch,
    });

    assert.equal(result.kind, 'not-found');
  });

  test('ignores scoped-looking Art Blocks card markup inside scripts and comments', async () => {
    const html =
      `<script>${JSON.stringify(artBlocksCard(`/token/${ETH_CONTRACT}-777`))}</script>` +
      `<!-- ${artBlocksCard(`/token/${ETH_CONTRACT}-888`)} -->`;

    const result = await resolveTokenInfo('https://artblocks.io/collection/example', {
      fetch: htmlFetch(html) as typeof fetch,
    });

    assert.equal(result.kind, 'not-found');
  });

  test('ignores Art Blocks token hrefs nested in comments inside a valid card', async () => {
    const html =
      '<div class="relative self-start h-fit flex w-full flex-col">' +
      `<!-- <a class="relative isolate z-10 block flex-1" href="/token/${ETH_CONTRACT}-777">Cached</a> -->` +
      '</div>';

    const result = await resolveTokenInfo('https://artblocks.io/collection/example', {
      fetch: htmlFetch(html) as typeof fetch,
    });

    assert.equal(result.kind, 'not-found');
  });

  test('does not extract Art Blocks collection cards from legacy project URLs', async () => {
    const result = await resolveTokenInfo('https://artblocks.io/projects/123', {
      fetch: htmlFetch(artBlocksCard(`/token/${ETH_CONTRACT}-5001410`)) as typeof fetch,
    });

    assert.equal(result.kind, 'not-found');
  });
});

describe('Verse DOM and headless extraction', () => {
  test('extracts Verse item URLs from rendered item-card scope only', async () => {
    const outsideContract = '0x1111111111111111111111111111111111111111';
    const html = [
      `<nav><a href="/items/ethereum/${outsideContract}/999">Cached unrelated item</a></nav>`,
      verseItemCard(ETH_CONTRACT, '139'),
    ].join('');

    const result = await resolveTokenInfo('https://verse.works/series/example-series', {
      fetch: htmlFetch(html) as typeof fetch,
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

  test('ignores unrelated Verse item paths outside item-card scope', async () => {
    const html =
      `<script>const marker = "virtuoso-grid-item"; const path = "/items/ethereum/${ETH_CONTRACT}/888";</script>` +
      `<main><a href="/items/ethereum/${ETH_CONTRACT}/999">Cached unrelated item</a></main>`;

    const result = await resolveTokenInfo('https://verse.works/series/example-series', {
      fetch: htmlFetch(html) as typeof fetch,
    });

    assert.equal(result.kind, 'not-found');
  });

  test('ignores scoped-looking Verse card markup inside scripts and comments', async () => {
    const html =
      `<script>${JSON.stringify(verseItemCard(ETH_CONTRACT, '888'))}</script>` +
      `<!-- ${verseItemCard(ETH_CONTRACT, '999')} -->`;

    const result = await resolveTokenInfo('https://verse.works/series/example-series', {
      fetch: htmlFetch(html) as typeof fetch,
    });

    assert.equal(result.kind, 'not-found');
  });

  test('ignores Verse item paths nested in comments inside a valid item card', async () => {
    const html =
      '<div class="virtuoso-grid-item">' +
      '<figure class="TabArtworkThumbnail_root__qKVCx">' +
      `<!-- <a class="TabArtworkThumbnail_link__nHCZf" href="/items/ethereum/${ETH_CONTRACT}/888">Cached</a> -->` +
      '</figure></div>';

    const result = await resolveTokenInfo('https://verse.works/series/example-series', {
      fetch: htmlFetch(html) as typeof fetch,
    });

    assert.equal(result.kind, 'not-found');
  });

  test('does not extract Verse series cards from unsupported item URLs', async () => {
    const result = await resolveTokenInfo('https://verse.works/items/tezos/KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton/1', {
      fetch: htmlFetch(verseItemCard(ETH_CONTRACT, '139')) as typeof fetch,
    });

    assert.equal(result.kind, 'not-found');
  });

  test('extracts Verse rendered item cards through the headless fallback', async () => {
    const fetchImpl = async (): Promise<Response> =>
      new Response('<html>client shell only</html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      });
    const renderer: HeadlessPageRenderer = {
      async render(): Promise<string> {
        return verseItemCard(ETH_CONTRACT, '216');
      },
    };

    const result = await resolveTokenInfo('https://verse.works/series/example-series', {
      fetch: fetchImpl as typeof fetch,
      renderer,
    });
    assert.equal(result.kind, 'token');
    if (result.kind !== 'token') {
      throw new Error('narrowing');
    }
    assert.equal(result.method, 'headless');
    assert.deepEqual(result.coords, {
      chain: 'ethereum',
      contract: ETH_CONTRACT,
      tokenId: '216',
    });
  });
});

describe('Raster DOM and headless extraction', () => {
  test('extracts Raster token paths from rendered artwork-card scopes', async () => {
    const outsideContract = '0x1111111111111111111111111111111111111111';
    const html = [
      `<script>window.__noise = "/token/ethereum/${outsideContract}/999";</script>`,
      rasterArtworkCard(ETH_CONTRACT, '95'),
    ].join('');

    const result = await resolveTokenInfo(
      'https://raster.art/artwork/split-logic-by-ricky-retouch',
      { fetch: htmlFetch(html) as typeof fetch }
    );
    assert.equal(result.kind, 'token');
    if (result.kind !== 'token') {
      throw new Error('narrowing');
    }
    assert.equal(result.method, 'dom');
    assert.deepEqual(result.coords, {
      chain: 'ethereum',
      contract: ETH_CONTRACT,
      tokenId: '95',
    });
  });

  test('ignores unrelated Raster token paths outside artwork-card scopes', async () => {
    const html = [
      `<script>const cached = "/token/ethereum/${ETH_CONTRACT}/888";</script>`,
      `<main><a href="/token/ethereum/${ETH_CONTRACT}/999">Cached token</a></main>`,
      '<div class="ArtItem_artworkCard__LYD5v MediaGrid_gridItem__IQWJ_">',
      '<span>Rendered card shell without token link</span>',
      '</div>',
    ].join('');

    const result = await resolveTokenInfo(
      'https://raster.art/artwork/split-logic-by-ricky-retouch',
      { fetch: htmlFetch(html) as typeof fetch }
    );

    assert.equal(result.kind, 'not-found');
  });

  test('ignores stringified Raster artwork scopes in scripts and comments', async () => {
    const html = [
      '<script>',
      `const cached = '<a class="ArtItem_artworkLink__MdzKE" href="/token/ethereum/${ETH_CONTRACT}/888">Cached</a>';`,
      '</script>',
      `<!-- <a class="ArtItem_buyNow__dO2rg" href="/token/ethereum/${ETH_CONTRACT}/999">Cached</a> -->`,
      '<div class="ArtItem_artworkCard__LYD5v MediaGrid_gridItem__IQWJ_">',
      '<span>Rendered card shell without token link</span>',
      '</div>',
    ].join('');

    const result = await resolveTokenInfo(
      'https://raster.art/artwork/split-logic-by-ricky-retouch',
      { fetch: htmlFetch(html) as typeof fetch }
    );

    assert.equal(result.kind, 'not-found');
  });

  test('ignores Raster token paths nested in comments inside a valid artwork card', async () => {
    const html = [
      '<div class="ArtItem_artworkCard__LYD5v MediaGrid_gridItem__IQWJ_">',
      `<!-- <a class="ArtItem_artworkLink__MdzKE" href="/token/ethereum/${ETH_CONTRACT}/888">Cached</a> -->`,
      '</div>',
    ].join('');

    const result = await resolveTokenInfo(
      'https://raster.art/artwork/split-logic-by-ricky-retouch',
      { fetch: htmlFetch(html) as typeof fetch }
    );

    assert.equal(result.kind, 'not-found');
  });

  test('extracts Raster rendered artwork cards through the headless fallback', async () => {
    const fetchImpl = async (): Promise<Response> =>
      new Response('<html>client shell only</html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      });
    const renderer: HeadlessPageRenderer = {
      async render(): Promise<string> {
        return rasterArtworkCard(ETH_CONTRACT, '100');
      },
    };

    const result = await resolveTokenInfo(
      'https://raster.art/artwork/split-logic-by-ricky-retouch',
      { fetch: fetchImpl as typeof fetch, renderer }
    );
    assert.equal(result.kind, 'token');
    if (result.kind !== 'token') {
      throw new Error('narrowing');
    }
    assert.equal(result.method, 'headless');
    assert.deepEqual(result.coords, {
      chain: 'ethereum',
      contract: ETH_CONTRACT,
      tokenId: '100',
    });
  });
});

describe('OpenSea DOM extraction', () => {
  test('selects dominant contract and lowest tokenId, ignoring unrelated payment-token JSON', async () => {
    const html =
      '<html><script>' +
      '{"symbol":"WETH","contractAddress":"0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"}' +
      openSeaItem('ethereum', OPENSEA_STRAY_CONTRACT, '1') +
      openSeaCollectionItems(
        openSeaItem('ethereum', OPENSEA_COLLECTION_CONTRACT, '97'),
        openSeaItem('ethereum', OPENSEA_COLLECTION_CONTRACT, '15'),
        openSeaItem('ethereum', OPENSEA_COLLECTION_CONTRACT, '40')
      ) +
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
    const html = openSeaCollectionItems(
      openSeaItem('ethereum', OPENSEA_COLLECTION_CONTRACT, big),
      openSeaItem('ethereum', OPENSEA_COLLECTION_CONTRACT, '9')
    );
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
    const html = openSeaCollectionItems(
      openSeaItem('matic', OPENSEA_STRAY_CONTRACT, '1'),
      openSeaItem('matic', OPENSEA_STRAY_CONTRACT, '2')
    );
    const result = await resolveTokenInfo('https://opensea.io/collection/polygon-collection', {
      fetch: htmlFetch(html) as typeof fetch,
    });
    assert.equal(result.kind, 'not-found');
  });

  test('extracts rendered OpenSea item cards through the headless fallback', async () => {
    const fetchImpl = async (): Promise<Response> =>
      new Response('<html>client shell only</html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      });
    const renderer: HeadlessPageRenderer = {
      async render(): Promise<string> {
        return [
          openSeaCardAnchor(OPENSEA_COLLECTION_CONTRACT, '22'),
          openSeaCardAnchor(OPENSEA_COLLECTION_CONTRACT, '9'),
        ].join('');
      },
    };

    const result = await resolveTokenInfo('https://opensea.io/collection/rendered-items', {
      fetch: fetchImpl as typeof fetch,
      renderer,
    });
    assert.equal(result.kind, 'token');
    if (result.kind !== 'token') {
      throw new Error('narrowing');
    }
    assert.equal(result.method, 'headless');
    assert.deepEqual(result.coords, {
      chain: 'ethereum',
      contract: OPENSEA_COLLECTION_CONTRACT,
      tokenId: '9',
    });
  });

  test('ignores unscoped OpenSea token paths and anchors outside item scopes', async () => {
    const html =
      '<html><body>' +
      `<p>/item/ethereum/${OPENSEA_STRAY_CONTRACT}/1</p>` +
      `<a href="/item/ethereum/${OPENSEA_STRAY_CONTRACT}/3">Cached unrelated item</a>` +
      '<script>' +
      openSeaItem('ethereum', OPENSEA_STRAY_CONTRACT, '2') +
      '</script>' +
      '</body></html>';
    const result = await resolveTokenInfo('https://opensea.io/collection/no-scoped-items', {
      fetch: htmlFetch(html) as typeof fetch,
    });
    assert.equal(result.kind, 'not-found');
  });

  test('ignores scoped-looking rendered OpenSea item cards inside scripts and comments', async () => {
    const card = openSeaCardAnchor(OPENSEA_COLLECTION_CONTRACT, '22');
    const html = `<script>window.__card = ${JSON.stringify(card)};</script><!-- ${card} -->`;

    const result = await resolveTokenInfo('https://opensea.io/collection/no-rendered-items', {
      fetch: htmlFetch(html) as typeof fetch,
    });

    assert.equal(result.kind, 'not-found');
  });

  test('ignores OpenSea card markers nested in comments inside a token anchor', async () => {
    const html =
      `<a href="/item/ethereum/${OPENSEA_COLLECTION_CONTRACT}/22">` +
      '<!-- <article data-testid="ItemName">Cached card marker</article> -->' +
      '</a>';

    const result = await resolveTokenInfo('https://opensea.io/collection/no-rendered-items', {
      fetch: htmlFetch(html) as typeof fetch,
    });

    assert.equal(result.kind, 'not-found');
  });

  test('does not extract OpenSea collection cards from unsupported item URLs', async () => {
    const result = await resolveTokenInfo(
      `https://opensea.io/assets/matic/${OPENSEA_STRAY_CONTRACT}/1`,
      { fetch: htmlFetch(openSeaCardAnchor(OPENSEA_COLLECTION_CONTRACT, '22')) as typeof fetch }
    );

    assert.equal(result.kind, 'not-found');
  });
});

describe('SuperRare DOM extraction', () => {
  test('extracts first scoped collection card and normalizes mixed-case artwork paths', async () => {
    const html = superRareCollectionHtml(`
      <article class="group flex flex-col">
        <a data-reference-id="artwork-thumbnail" href="/artwork/eth/0x3e930455dcBf4bC69DE9926bDAF8ef782398786f/7"></a>
        <a href="/artwork/eth/0x3e930455dcBf4bC69DE9926bDAF8ef782398786f/7">Dissonance</a>
      </article>
      <article class="group flex flex-col">
        <a href="/artwork/eth/0x3e930455dcBf4bC69DE9926bDAF8ef782398786f/1">Disassociative</a>
      </article>
    `);

    const result = await resolveTokenInfo(
      'https://superrare.com/collection/0x3e930455dcbf4bc69de9926bdaf8ef782398786f',
      { fetch: htmlFetch(html) as typeof fetch }
    );
    assert.equal(result.kind, 'token');
    if (result.kind !== 'token') {
      throw new Error('narrowing');
    }
    assert.equal(result.method, 'dom');
    assert.deepEqual(result.coords, {
      chain: 'ethereum',
      contract: '0x3e930455dcbf4bc69de9926bdaf8ef782398786f',
      tokenId: '7',
    });
  });

  test('extracts SuperRare collection cards from headless-rendered HTML', async () => {
    const fetchImpl = async (): Promise<Response> =>
      new Response('<html>client shell only</html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      });
    const renderer: HeadlessPageRenderer = {
      async render(): Promise<string> {
        return superRareCollectionHtml(`
          <article class="group flex flex-col">
            <a href="/artwork/eth/0x3e930455dcBf4bC69DE9926bDAF8ef782398786f/7">Dissonance</a>
          </article>
        `);
      },
    };

    const result = await resolveTokenInfo(
      'https://superrare.com/collection/0x3e930455dcbf4bc69de9926bdaf8ef782398786f',
      { fetch: fetchImpl as typeof fetch, renderer }
    );
    assert.equal(result.kind, 'token');
    if (result.kind !== 'token') {
      throw new Error('narrowing');
    }
    assert.equal(result.method, 'headless');
    assert.equal(result.coords.tokenId, '7');
  });

  test('ignores unrelated SuperRare artwork paths outside the collection card scope', async () => {
    const html =
      '<html><script>"/artwork/eth/0x1111111111111111111111111111111111111111/999"</script>' +
      superRareCollectionHtml('<article class="group flex flex-col">No artwork link</article>') +
      '</html>';

    const result = await resolveTokenInfo(
      'https://superrare.com/collection/0x3e930455dcbf4bc69de9926bdaf8ef782398786f',
      { fetch: htmlFetch(html) as typeof fetch }
    );
    assert.equal(result.kind, 'not-found');
  });

  test('ignores visible SuperRare artwork paths outside the collection card scope', async () => {
    const html =
      '<html><nav><a href="/artwork/eth/0x1111111111111111111111111111111111111111/999">Cached</a></nav>' +
      superRareCollectionHtml('<article class="group flex flex-col">No artwork link</article>') +
      '</html>';

    const result = await resolveTokenInfos(
      'https://superrare.com/collection/0x3e930455dcbf4bc69de9926bdaf8ef782398786f',
      { fetch: htmlFetch(html) as typeof fetch }
    );

    assert.equal(result.kind, 'not-found');
  });

  test('ignores scoped-looking SuperRare collection markup inside scripts and comments', async () => {
    const scopedMarkup = superRareCollectionHtml(`
      <article class="group flex flex-col">
        <a href="/artwork/eth/0x3e930455dcBf4bC69DE9926bDAF8ef782398786f/7">Dissonance</a>
      </article>
    `);
    const html = `<script>${JSON.stringify(scopedMarkup)}</script><!-- ${scopedMarkup} -->`;

    const result = await resolveTokenInfo(
      'https://superrare.com/collection/0x3e930455dcbf4bc69de9926bdaf8ef782398786f',
      { fetch: htmlFetch(html) as typeof fetch }
    );

    assert.equal(result.kind, 'not-found');
  });

  test('ignores SuperRare artwork paths nested in comments inside a valid collection card', async () => {
    const html = superRareCollectionHtml(`
      <article class="group flex flex-col">
        <!-- <a href="/artwork/eth/0x3e930455dcBf4bC69DE9926bDAF8ef782398786f/7">Cached</a> -->
      </article>
    `);

    const result = await resolveTokenInfo(
      'https://superrare.com/collection/0x3e930455dcbf4bc69de9926bdaf8ef782398786f',
      { fetch: htmlFetch(html) as typeof fetch }
    );

    assert.equal(result.kind, 'not-found');
  });
});

describe('Feral File DOM extraction', () => {
  test('ignores unrelated token paths because Feral File IDs need caller-owned API resolution', async () => {
    const result = await resolveTokenInfo('https://feralfile.com/exhibitions/artwork/12345', {
      fetch: htmlFetch(`<a href="/items/ethereum/${ETH_CONTRACT}/1">Unrelated token</a>`) as typeof fetch,
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
 * objktSocialImageMeta returns the rendered token-detail meta scope Objkt uses
 * for social previews of alias-backed token pages.
 */
function objktSocialImageMeta(contract: string, tokenId: string): string {
  return (
    '<meta property="og:image" ' +
    `content="https://assets.objkt.media/file/assets-003/${contract}/${tokenId}/social">`
  );
}

/**
 * objktCollectionApiFetch mocks Objkt's static collection page fetch followed
 * by collection lookup and paginated token GraphQL calls.
 */
function objktCollectionApiFetch(requests: Array<{ url: string; body: unknown }>): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    let body: unknown = null;
    if (typeof init?.body === 'string') {
      body = JSON.parse(init.body);
    }
    requests.push({ url, body });

    if (url.startsWith('https://objkt.com/collections/')) {
      return new Response('<html>client shell only</html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      });
    }

    if (url !== 'https://data.objkt.com/v3/graphql') {
      return new Response('not found', { status: 404 });
    }

    const bodyText = JSON.stringify(body);
    if (bodyText.includes('ResolveObjktCollectionTokens') && bodyText.includes('"lastPk":0')) {
      return new Response(
        JSON.stringify({
          data: {
            token: [
              {
                pk: 50,
                fa_contract: 'KT1X5W2akGCxvykmHoqoQzJfEgg1RGNGBCDd',
                token_id: '914',
              },
              {
                pk: 60,
                fa_contract: 'KT1X5W2akGCxvykmHoqoQzJfEgg1RGNGBCDd',
                token_id: '913',
              },
            ],
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (bodyText.includes('ResolveObjktCollectionTokens')) {
      return new Response(JSON.stringify({ data: { token: [] } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (bodyText.includes('ResolveObjktCollection')) {
      return new Response(
        JSON.stringify({
          data: {
            fa: [
              {
                contract: 'KT1X5W2akGCxvykmHoqoQzJfEgg1RGNGBCDd',
                path: 'objkt-paint-98',
                collection_id: 'objkt-paint-98',
              },
            ],
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response(JSON.stringify({ data: {} }), { status: 200 });
  }) as typeof fetch;
}

/**
 * artBlocksCard returns the repeated rendered card/link shape used by Art
 * Blocks collection pages for token thumbnails.
 */
function artBlocksCard(href: string): string {
  return (
    '<div class="relative self-start h-fit flex w-full flex-col">' +
    `<a class="relative isolate z-10 block flex-1" href="${href}">Token</a>` +
    '</div>'
  );
}

/**
 * verseItemCard returns one rendered Verse series card fixture.
 */
function verseItemCard(contract: string, tokenId: string): string {
  return (
    '<div class="virtuoso-grid-item">' +
    '<figure class="TabArtworkThumbnail_root__qKVCx">' +
    `<a class="TabArtworkThumbnail_link__nHCZf" href="/items/ethereum/${contract}/${tokenId}">` +
    'Go to edition page</a>' +
    '<figcaption class="TabArtworkThumbnail_info__9ZISq">' +
    `<a class="TabArtworkThumbnail_title__95Dye" href="/items/ethereum/${contract}/${tokenId}">` +
    `Quantizer ${tokenId}</a>` +
    '</figcaption></figure></div>'
  );
}

function verseSeriesApiFetch(): (input: string | URL | Request, init?: RequestInit) => Promise<Response> {
  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url === 'https://verse.works/query') {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      assert.equal(body.variables?.slug, 'quantizer-by-harm-van-den-dorpel');
      return Response.json({
        data: {
          collectionsPage: {
            nodes: [
              {
                artworks: [
                  {
                    editions: [
                      {
                        tokenId: '167',
                        contractInfo: {
                          chain: 'ETHEREUM',
                          contractAddress: '0x23b72f7458a204446983f544d655df10f70533e9',
                        },
                      },
                      {
                        tokenId: '0',
                        contractInfo: {
                          chain: 'ETHEREUM',
                          contractAddress: '0x23b72f7458a204446983f544d655df10f70533e9',
                        },
                      },
                      {
                        tokenId: '1',
                        contractInfo: {
                          chain: 'TEZOS',
                          contractAddress: TEZOS_CONTRACT,
                        },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        },
      });
    }
    return new Response('<html>client shell only</html>', {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    });
  };
}

/**
 * rasterArtworkCard returns one rendered Raster artwork card fixture.
 */
function rasterArtworkCard(contract: string, tokenId: string): string {
  return (
    '<div class="ArtItem_artworkCard__LYD5v MediaGrid_gridItem__IQWJ_">' +
    '<div class="ArtItem_artworkCardContent__LCNlL">' +
    `<a class="ArtItem_artworkLink__MdzKE" href="/token/ethereum/${contract}/${tokenId}">` +
    '<div class="ArtItem_imageContainer__NNJDo">' +
    `<img alt="Split Logic #${tokenId}" class="ArtItem_artworkImage__8UfeW">` +
    '</div></a>' +
    '<div class="ArtItem_label__ReczX">' +
    '<div class="ArtItem_titleRow__A2Gom">' +
    `<a class="ArtItem_artworkLink__MdzKE" href="/token/ethereum/${contract}/${tokenId}">` +
    `<div class="ArtItem_artworkTitle__bNifT">Split Logic #${tokenId}</div></a>` +
    `<a class="ArtItem_buyNow__dO2rg" href="/token/ethereum/${contract}/${tokenId}?action=buy">` +
    'BUY 0.13 ETH</a>' +
    '</div></div></div></div>'
  );
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

/**
 * openSeaCollectionItems wraps item JSON in OpenSea's urql collection-card
 * relay payload shape.
 */
function openSeaCollectionItems(...items: string[]): string {
  return `{"collectionItems":{"items":[${items.join(',')}],"__typename":"CollectionItemsConnection"}}`;
}

/**
 * openSeaCardAnchor returns one rendered OpenSea item-card anchor scope.
 */
function openSeaCardAnchor(contract: string, tokenId: string): string {
  return (
    `<a class="cursor-pointer flex h-full flex-col" href="/item/ethereum/${contract}/${tokenId}">` +
    '<article class="relative grow overflow-hidden">' +
    `<span data-testid="ItemName">Azuki #${tokenId}</span>` +
    '</article></a>'
  );
}

/**
 * superRareCollectionHtml returns the rendered grid shell used by SuperRare
 * collection pages around virtualized artwork card articles.
 */
function superRareCollectionHtml(cards: string): string {
  return `
    <main>
      <div id="collection">
        <div class="flex w-full flex-col">
          <div class="container pt-0">
            <div data-virtuoso-scroller="true">
              <div>
                <div data-testid="virtuoso-item-list" class="grid grid-cols-1">
                  ${cards}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  `;
}

function superRareCollectionApiFetch(
  html: string,
  requests: Array<{ url: string; body: unknown }>,
  pages: Array<{
    nfts: Array<{ chainId: string; contractAddress: string; tokenId: string | number }>;
    hasNextPage: boolean;
  }>
): (input: string | URL | Request, init?: RequestInit) => Promise<Response> {
  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    let body: unknown = null;
    if (typeof init?.body === 'string') {
      body = JSON.parse(init.body);
    }
    requests.push({ url, body });

    if (url.startsWith('https://superrare.com/collection/')) {
      return new Response(html, {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      });
    }

    if (url !== 'https://api.superrare.com/graphql') {
      return new Response('not found', { status: 404 });
    }

    const variables = (body as { variables?: Record<string, unknown> } | null)?.variables;
    assert.deepEqual(variables?.filter, {
      contractAddress: { equals: '0x3e930455dcbf4bc69de9926bdaf8ef782398786f' },
    });
    assert.equal(
      (variables?.nftPagination as { take?: number; sortBy?: string; order?: string } | undefined)?.take,
      100
    );
    assert.equal(
      (variables?.nftPagination as { take?: number; sortBy?: string; order?: string } | undefined)?.sortBy,
      'createdAt'
    );
    assert.equal(
      (variables?.nftPagination as { take?: number; sortBy?: string; order?: string } | undefined)?.order,
      'asc'
    );

    const skip = (variables?.nftPagination as { skip?: number } | undefined)?.skip ?? 0;
    const page = pages[skip / 100] ?? { nfts: [], hasNextPage: false };
    return Response.json({
      data: {
        getNfts: {
          nfts: page.nfts,
          pagination: { hasNextPage: page.hasNextPage },
        },
      },
    });
  };
}

function artBlocksMetadataToken(contract: string, tokenId: string): string {
  return (
    `{"chain_id":1,"token_id":"${tokenId}",` +
    `"contract_address":"${contract}","__typename":"tokens_metadata"}`
  );
}

function artBlocksMetadataTokenWithLateContract(contract: string, tokenId: string): string {
  return (
    `{"id":"${contract}-${tokenId}","chain_id":1,"token_id":"${tokenId}",` +
    `"live_view_url":"https://generator.artblocks.io/1/${contract}/${tokenId}",` +
    `"image":{"metadata":{"width":2400},"__typename":"media"},` +
    `"features":{"Entropy":"Low"},"__typename":"tokens_metadata",` +
    `"owner":{"__typename":"users"},"contract_address":"${contract}"}`
  );
}

function artBlocksCollectionApiFetch(
  html: string,
  tokens: Array<{ chain_id: number; token_id: string; contract_address: string }>
): (input: string | URL | Request, init?: RequestInit) => Promise<Response> {
  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url === 'https://data.artblocks.io/v1/graphql') {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      assert.equal(body.variables?.where?.project_id?._eq, `${tokens[0].contract_address}-498`);
      assert.equal(body.variables?.where?.chain_id?._eq, 1);
      return Response.json({
        data: {
          filter_tokens_metadata_by_features: tokens,
        },
      });
    }
    return new Response(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    });
  };
}

function fxhashProjectFetch(): (input: string | URL | Request, init?: RequestInit) => Promise<Response> {
  return async (input: string | URL | Request): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url === 'https://api.fxhash.xyz/graphql') {
      return Response.json({
        data: {
          generativeToken: {
            entireCollection: [
              {
                onChainId: 1565369,
                gentkContractAddress: 'KT1U6EHmNxJTkvaWJ4ThczG4FSDaHC21ssvi',
              },
              {
                onChainId: 1597012,
                gentkContractAddress: 'KT1U6EHmNxJTkvaWJ4ThczG4FSDaHC21ssvi',
              },
            ],
          },
        },
      });
    }
    return new Response('<html>client shell only</html>', {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    });
  };
}

function feralFileShowFetch(): (input: string | URL | Request, init?: RequestInit) => Promise<Response> {
  return async (input: string | URL | Request): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url === 'https://feralfile.com/api/exhibitions/ex-nihilo-a3c') {
      return Response.json({ result: { id: 'show-uuid', series: [{ id: 'series-a' }, { id: 'series-b' }] } });
    }
    if (url === 'https://feralfile.com/api/artworks?seriesID=series-a') {
      return Response.json({
        result: [
          { chain: 'ethereum', contractAddress: ETH_CONTRACT, tokenID: '1' },
          { chain: 'polygon', contractAddress: ETH_CONTRACT, tokenID: '2' },
        ],
      });
    }
    if (url === 'https://feralfile.com/api/artworks?seriesID=series-b') {
      return Response.json({
        result: [
          { chain: 'ethereum', contractAddress: ETH_CONTRACT, tokenID: '2' },
          { chain: 'tezos', contractAddress: TEZOS_CONTRACT, tokenID: '9201' },
        ],
      });
    }
    return new Response('<html>client shell only</html>', {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    });
  };
}

function feralFileSeriesFetch(): (input: string | URL | Request, init?: RequestInit) => Promise<Response> {
  return async (input: string | URL | Request): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url === 'https://feralfile.com/api/series/cosmos-simulacrum') {
      return Response.json({ result: { id: 'series-uuid' } });
    }
    if (url === 'https://feralfile.com/api/artworks?seriesID=series-uuid') {
      return Response.json({
        result: [
          { chain: 'ethereum', contractAddress: ETH_CONTRACT, tokenID: '7' },
          { chain: 'tezos', contractAddress: TEZOS_CONTRACT, tokenID: '8' },
        ],
      });
    }
    return new Response('<html>client shell only</html>', {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    });
  };
}

function rasterApiFetch(): (input: string | URL | Request, init?: RequestInit) => Promise<Response> {
  return async (input: string | URL | Request): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url === 'https://raster.art/artwork/split-logic-by-ricky-retouch') {
      return new Response('{"children":[["$","$L25",null,{"artworkId\\":2886465}]]}', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      });
    }
    if (url.includes('https://kit.raster.art/artwork/2886465/tokens?cursor=0')) {
      return Response.json({
        tokens: [
          {
            chain_id: 'eip155:1',
            contract_address: '0xf5705202462f066ac55c293f5798ae027b2f27b5',
            token_id: '95',
          },
          {
            chain_id: 'eip155:1',
            contract_address: '0xf5705202462f066ac55c293f5798ae027b2f27b5',
            token_id: '100',
          },
        ],
        cursor: 2,
      });
    }
    if (url.includes('https://kit.raster.art/artwork/2886465/tokens?cursor=2')) {
      return Response.json({ tokens: [], cursor: 2 });
    }
    return new Response('not found', { status: 404 });
  };
}
