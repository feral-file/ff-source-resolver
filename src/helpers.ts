import type { IndexerChain, TokenCoords } from './types';

export const ETH_ADDR = /^0x[a-fA-F0-9]{40}$/;
export const TEZOS_ADDR = /^(tz1|tz2|tz3)[1-9A-HJ-NP-Za-km-z]{33}$/;
export const RAW_COORDS = /^(ethereum|tezos):([^:]+):([^:]+)$/i;

/**
 * normalizeContract normalizes EVM contracts while preserving Tezos base58
 * casing. Tezos addresses are case-sensitive; lowercasing them breaks lookup.
 */
export function normalizeContract(contract: string): string {
  return contract.startsWith('0x') ? contract.toLowerCase() : contract;
}

/**
 * tokenResult builds the CLI-compatible parse result used by adapters.
 */
export function tokenResult(
  chain: IndexerChain,
  contract: string,
  tokenId: string
): { kind: 'token'; coords: TokenCoords } {
  return { kind: 'token', coords: { chain, contract: normalizeContract(contract), tokenId } };
}

/**
 * hasHostMatch checks both exact hosts and subdomains against a site host
 * allowlist. The caller strips a leading `www.` before this helper runs.
 */
export function hasHostMatch(host: string, hosts: readonly string[]): boolean {
  return hosts.some((candidate) => host === candidate || host.endsWith(`.${candidate}`));
}

/**
 * extractTokenFromText performs low-level keyless extraction from page text.
 *
 * This helper is intentionally conservative and only recognizes URL/path
 * shapes that already encode chain, contract, and token id. Site adapters own
 * when this fallback is safe to run for their pages.
 */
export function extractTokenFromText(text: string): TokenCoords | null {
  let m = /\bethereum:(0x[a-fA-F0-9]{40}):(\d+)\b/i.exec(text);
  if (m) {
    return { chain: 'ethereum', contract: m[1].toLowerCase(), tokenId: m[2] };
  }
  m = /\btezos:(KT[A-Za-z0-9]+):(\d+)\b/.exec(text);
  if (m) {
    return { chain: 'tezos', contract: m[1], tokenId: m[2] };
  }
  m = /\/items\/ethereum\/(0x[a-fA-F0-9]{40})\/(\d+)/i.exec(text);
  if (m) {
    return { chain: 'ethereum', contract: m[1].toLowerCase(), tokenId: m[2] };
  }
  m = /\/(?:assets|item)\/ethereum\/(0x[a-fA-F0-9]{40})\/(\d+)/i.exec(text);
  if (m) {
    return { chain: 'ethereum', contract: m[1].toLowerCase(), tokenId: m[2] };
  }
  m = /\/artwork\/eth\/(0x[a-fA-F0-9]{40})\/(\d+)/i.exec(text);
  if (m) {
    return { chain: 'ethereum', contract: m[1].toLowerCase(), tokenId: m[2] };
  }
  m = /\/token\/(0x[a-fA-F0-9]{40})-(\d+)/i.exec(text);
  if (m) {
    return { chain: 'ethereum', contract: m[1].toLowerCase(), tokenId: m[2] };
  }
  m = /\/token\/\d+\/(0x[a-fA-F0-9]{40})\/(\d+)/i.exec(text);
  if (m) {
    return { chain: 'ethereum', contract: m[1].toLowerCase(), tokenId: m[2] };
  }
  m = /\/(?:tokens|asset)\/(KT[A-Za-z0-9]+)\/(\d+)/.exec(text);
  if (m) {
    return { chain: 'tezos', contract: m[1], tokenId: m[2] };
  }
  m = /\/token\/ethereum\/(0x[a-fA-F0-9]{40})\/(\d+)/i.exec(text);
  if (m) {
    return { chain: 'ethereum', contract: m[1].toLowerCase(), tokenId: m[2] };
  }
  m = /\/token\/tezos\/(KT[A-Za-z0-9]+)\/(\d+)/.exec(text);
  if (m) {
    return { chain: 'tezos', contract: m[1], tokenId: m[2] };
  }
  m = /\/gentk\/FX1-(KT[A-Za-z0-9]+)-(\d+)/.exec(text);
  if (m) {
    return { chain: 'tezos', contract: m[1], tokenId: m[2] };
  }
  return null;
}
