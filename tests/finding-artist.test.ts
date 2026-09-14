import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { cleanFindingArtist } from '../src/helpers';

describe('cleanFindingArtist', () => {
  test('drops a nameless artist and collapses whitespace in the name', () => {
    assert.equal(cleanFindingArtist({ name: '   ' }), null);
    assert.equal(cleanFindingArtist({ name: null, addresses: ['0xabc'] }), null);
    assert.deepEqual(cleanFindingArtist({ name: '  Tyler \n Hobbs ' }), { name: 'Tyler Hobbs' });
  });

  test('keeps every field the source published and nothing it did not', () => {
    assert.deepEqual(
      cleanFindingArtist({
        name: 'Snowfro',
        addresses: [' 0xF3860788 ', null, '0xF3860788', 'tz1abc'],
        slug: ' snowfro ',
        bio: '  _b. 1981_\n\nFounded Art Blocks.\n',
        avatar: ' https://cdn.example/snowfro.png ',
        links: [
          { url: 'https://snowfro.example', type: ' website ' },
          { url: 'https://x.com/artonblockchain', type: 'twitter' },
          { url: 'https://x.com/artonblockchain', type: 'twitter' },
          { url: 'https://untyped.example' },
        ],
      }),
      {
        name: 'Snowfro',
        // Verbatim: EVM case is not folded, Tezos is not touched, order is kept.
        addresses: ['0xF3860788', 'tz1abc'],
        slug: 'snowfro',
        // Trimmed at the ends only; paragraph breaks and markdown survive.
        bio: '_b. 1981_\n\nFounded Art Blocks.',
        avatar: 'https://cdn.example/snowfro.png',
        links: [
          { url: 'https://snowfro.example/', type: 'website' },
          { url: 'https://x.com/artonblockchain', type: 'twitter' },
          { url: 'https://untyped.example/' },
        ],
      }
    );
  });

  test('leaves a field absent, never empty, when it cleans to nothing', () => {
    assert.deepEqual(
      cleanFindingArtist({
        name: 'A',
        addresses: ['', ' ', null],
        slug: '',
        bio: null,
        // Not browser-loadable: a bare handle and an ipfs URI the adapter did
        // not route through a gateway are dropped rather than passed on.
        avatar: 'ipfs://QmAvatar',
        links: [{ url: '@handle', type: 'twitter' }, { url: '' }, null, { url: 'ipfs://x' }],
      }),
      { name: 'A' }
    );
  });
});
