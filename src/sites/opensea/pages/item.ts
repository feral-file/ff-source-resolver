import type { ParsedFindInput } from '../../../types';

/**
 * parseOpenSeaItem parses OpenSea token routes. Non-Ethereum chains stay
 * unsupported because downstream FF indexer coverage is Ethereum + Tezos.
 */
export function parseOpenSeaItem(url: URL): ParsedFindInput | null {
  const tokenMatch = /^\/(?:assets|item)\/([a-z_]+)\/(0x[a-fA-F0-9]{40})\/(\d+)\/?$/.exec(
    url.pathname
  );
  if (!tokenMatch) {
    return null;
  }
  const chain = tokenMatch[1];
  if (chain !== 'ethereum') {
    return {
      kind: 'unsupported',
      reason:
        `OpenSea ${chain} URLs aren't supported — ff-cli covers Ethereum and Tezos mainnet only. ` +
        'Paste an Ethereum-chain OpenSea URL or a Tezos source (Objkt, fxhash).',
    };
  }
  return {
    kind: 'token',
    source: 'opensea',
    coords: { chain: 'ethereum', contract: tokenMatch[2].toLowerCase(), tokenId: tokenMatch[3] },
  };
}
