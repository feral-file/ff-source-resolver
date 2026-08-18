import type { IndexerChain } from '../../types';

const RASTER_ETHEREUM_CHAIN_ID = 'eip155:1';
const RASTER_EVM_CHAIN_ID_PREFIX = 'eip155:';
const RASTER_TEZOS_CHAIN_ID_PREFIX = 'tezos:';

/**
 * RasterChain is the outcome of mapping Raster's CAIP-2 `chain_id` onto the
 * chains this package resolves.
 *
 * `unsupported` and `unknown` stay separate on purpose: a chain Raster serves
 * that this package deliberately does not resolve is a different fact from a
 * chain nobody has mapped yet, and collapsing both into one silent drop is what
 * hid Tezos from series enumeration until #18.
 */
export type RasterChain =
  | { kind: 'supported'; chain: IndexerChain }
  | { kind: 'unsupported'; chainId: string }
  | { kind: 'unknown'; chainId: string | null };

/**
 * rasterChain maps a Raster kit API `chain_id` to an indexer chain. Raster
 * reports Ethereum mainnet as `eip155:1` and Tezos mainnet as
 * `tezos:NetXdQprcVkpaWU`; it also lists artworks on other EVM chains such as
 * Base (`eip155:8453`), which this package does not resolve.
 */
export function rasterChain(chainId: string | null | undefined): RasterChain {
  if (chainId === RASTER_ETHEREUM_CHAIN_ID) {
    return { kind: 'supported', chain: 'ethereum' };
  }
  if (chainId === 'tezos' || chainId?.startsWith(RASTER_TEZOS_CHAIN_ID_PREFIX)) {
    return { kind: 'supported', chain: 'tezos' };
  }
  if (chainId?.startsWith(RASTER_EVM_CHAIN_ID_PREFIX)) {
    // A well-formed EVM chain id that is not Ethereum mainnet is out of scope
    // by design, not an oversight — this package indexes Ethereum and Tezos.
    return { kind: 'unsupported', chainId };
  }
  return { kind: 'unknown', chainId: chainId ?? null };
}

/**
 * rasterSupportedChain is the drop-anything-else shorthand for call sites that
 * only need coordinates. Callers that want to tell an out-of-scope chain from an
 * unmapped one should switch on rasterChain directly.
 */
export function rasterSupportedChain(chainId: string | null | undefined): IndexerChain | null {
  const mapped = rasterChain(chainId);
  return mapped.kind === 'supported' ? mapped.chain : null;
}
