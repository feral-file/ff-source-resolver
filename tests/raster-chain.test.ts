import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { rasterChain, rasterSupportedChain } from '../src/sites/raster/chain';

describe('Raster chain_id mapping', () => {
  test('maps Ethereum mainnet', () => {
    assert.deepEqual(rasterChain('eip155:1'), { kind: 'supported', chain: 'ethereum' });
    assert.equal(rasterSupportedChain('eip155:1'), 'ethereum');
  });

  test('maps every Tezos chain_id shape Raster reports', () => {
    // Observed live 2026-08-17 on artwork 117841 (plotterns-by-nt-worm).
    assert.deepEqual(rasterChain('tezos:NetXdQprcVkpaWU'), { kind: 'supported', chain: 'tezos' });
    assert.deepEqual(rasterChain('tezos'), { kind: 'supported', chain: 'tezos' });
    assert.equal(rasterSupportedChain('tezos:NetXdQprcVkpaWU'), 'tezos');
  });

  test('reports out-of-scope EVM chains as unsupported rather than unknown', () => {
    // Raster serves Base artworks (e.g. terminal-frames-by-v4wenko); this
    // package resolves Ethereum and Tezos only, so Base is dropped by name.
    assert.deepEqual(rasterChain('eip155:8453'), { kind: 'unsupported', chainId: 'eip155:8453' });
    assert.equal(rasterSupportedChain('eip155:8453'), null);
  });

  test('reports unrecognized and missing chain ids as unknown', () => {
    assert.deepEqual(rasterChain('solana:mainnet'), {
      kind: 'unknown',
      chainId: 'solana:mainnet',
    });
    assert.deepEqual(rasterChain(undefined), { kind: 'unknown', chainId: null });
    assert.deepEqual(rasterChain(''), { kind: 'unknown', chainId: '' });
    assert.equal(rasterSupportedChain(undefined), null);
  });
});
