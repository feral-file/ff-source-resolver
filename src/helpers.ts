import type { IndexerChain, MarketplaceSource, ParsedFindInput, TokenCoords } from './types';
import {
  isValidTokenId,
  isValidWalletAddress,
  normalizeTokenCoords,
} from './validation';

export const RAW_COORDS = /^(ethereum|tezos):([^:]+):([^:]+)$/i;

/**
 * tokenResult builds a token parse result only when the chain-specific
 * contract and token id are valid.
 */
export function tokenResult(
  chain: IndexerChain,
  contract: string,
  tokenId: string
): { kind: 'token'; coords: TokenCoords } | null {
  const coords = normalizeTokenCoords({ chain, contract, tokenId });
  return coords ? { kind: 'token', coords } : null;
}

/**
 * sourceTokenResult builds a marketplace-scoped token parse result only after
 * chain-specific coordinate validation.
 */
export function sourceTokenResult(
  source: MarketplaceSource,
  chain: IndexerChain,
  contract: string,
  tokenId: string
): ParsedFindInput | null {
  const result = tokenResult(chain, contract, tokenId);
  return result ? { ...result, source } : null;
}

/**
 * normalizeParsedFindInput validates and normalizes token, address, and
 * alias-token findings before they leave parser or resolver paths.
 */
export function normalizeParsedFindInput(result: ParsedFindInput | null): ParsedFindInput | null {
  if (!result) {
    return null;
  }
  if (result.kind === 'token') {
    const coords = normalizeTokenCoords(result.coords);
    return coords ? { ...result, coords } : null;
  }
  if (result.kind === 'address') {
    if (!isValidWalletAddress(result.chain, result.address)) {
      return null;
    }
    return {
      ...result,
      address: result.chain === 'ethereum' ? result.address.toLowerCase() : result.address,
    };
  }
  if (result.kind === 'objkt-alias' && !isValidTokenId('tezos', result.tokenId)) {
    return null;
  }
  return result;
}

/**
 * hasHostMatch checks both exact hosts and subdomains against a site host
 * allowlist. The caller strips a leading `www.` before this helper runs.
 */
export function hasHostMatch(host: string, hosts: readonly string[]): boolean {
  return hosts.some((candidate) => host === candidate || host.endsWith(`.${candidate}`));
}
