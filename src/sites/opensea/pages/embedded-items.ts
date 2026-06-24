import type { ParsedFindInput } from '../../../types';
import { sourceTokenResult } from '../../../helpers';

interface Candidate {
  chain: string;
  contract: string;
  tokenId: bigint;
  count: number;
}

/**
 * extractOpenSeaEmbeddedItems extracts token coordinates from relay-style JSON
 * embedded in OpenSea pages. It mirrors the keyless static extraction used by
 * ff-cli collection resolution without depending on OpenSea API keys.
 *
 * The dominant-contract and lowest-token rules matter because OpenSea pages
 * can embed payment-token metadata and stray item JSON near the collection
 * payload. Returning the first Ethereum-looking match would make pasted
 * collection pages nondeterministic.
 */
export function extractOpenSeaEmbeddedItems(html: string): ParsedFindInput | null {
  const re =
    /"chain":\{"identifier":"([a-z0-9_-]+)"[^{}]*\}[\s\S]{0,200}?"contractAddress":"(0x[a-fA-F0-9]{40})"[\s\S]{0,200}?"tokenId":"(\d+)"/g;
  const byContract = new Map<string, Candidate>();
  for (;;) {
    const match = re.exec(html);
    if (!match) {
      break;
    }
    const contract = match[2].toLowerCase();
    const candidate = byContract.get(contract) ?? {
      chain: match[1],
      contract,
      tokenId: BigInt(match[3]),
      count: 0,
    };
    const tokenId = BigInt(match[3]);
    candidate.tokenId = tokenId < candidate.tokenId ? tokenId : candidate.tokenId;
    candidate.count += 1;
    byContract.set(contract, candidate);
  }
  let best: Candidate | null = null;
  for (const candidate of byContract.values()) {
    if (!best || candidate.count > best.count) {
      best = candidate;
    }
  }
  if (!best || best.chain !== 'ethereum') {
    return null;
  }
  return sourceTokenResult('opensea', 'ethereum', best.contract, best.tokenId.toString());
}
