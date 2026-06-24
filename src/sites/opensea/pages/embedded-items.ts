import type { ParsedFindInput } from '../../../types';
import { sourceTokenResult } from '../../../helpers';

interface Candidate {
  chain: string;
  contract: string;
  tokenId: bigint;
  count: number;
}

const COLLECTION_ITEMS_MARKER = '"collectionItems":{"items":';
const MAX_ITEM_SCOPE_LENGTH = 50_000;
const OPEN_SEA_CARD_MARKERS = ['<article', 'data-testid="ItemName"', "data-testid='ItemName'"];

/**
 * extractOpenSeaEmbeddedItems extracts token coordinates from relay-style JSON
 * embedded in OpenSea pages and from rendered item-card links. It mirrors the
 * keyless static extraction used by ff-cli collection resolution without
 * depending on OpenSea API keys.
 *
 * The dominant-contract and lowest-token rules matter because OpenSea pages
 * can embed payment-token metadata and stray item JSON near the collection
 * payload. Returning the first Ethereum-looking match would make pasted
 * collection pages nondeterministic.
 */
export function extractOpenSeaEmbeddedItems(html: string): ParsedFindInput | null {
  const byContract = new Map<string, Candidate>();

  for (const scope of collectOpenSeaItemScopes(html)) {
    const token = extractTokenFromOpenSeaScope(scope);
    if (!token) {
      continue;
    }
    const contract = token.contract.toLowerCase();
    const candidate = byContract.get(contract) ?? {
      chain: token.chain,
      contract,
      tokenId: token.tokenId,
      count: 0,
    };
    candidate.tokenId = token.tokenId < candidate.tokenId ? token.tokenId : candidate.tokenId;
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

/**
 * collectOpenSeaItemScopes narrows extraction to OpenSea item cards or relay
 * collection item objects before token regexes run. This avoids matching
 * generic payment-token metadata and unrelated token paths elsewhere in the
 * document.
 */
function collectOpenSeaItemScopes(html: string): string[] {
  return [...extractRelayCollectionItemScopes(html), ...extractItemAnchorScopes(html)];
}

/**
 * extractRelayCollectionItemScopes returns individual objects from
 * `data.collectionItems.items`, the urql rehydrate scope OpenSea uses for
 * collection cards.
 */
function extractRelayCollectionItemScopes(html: string): string[] {
  const scopes: string[] = [];
  let searchFrom = 0;
  for (;;) {
    const markerIndex = html.indexOf(COLLECTION_ITEMS_MARKER, searchFrom);
    if (markerIndex < 0) {
      return scopes;
    }
    const arrayStart = markerIndex + COLLECTION_ITEMS_MARKER.length;
    const arrayEnd = findBalancedEnd(html, arrayStart, '[', ']');
    if (arrayEnd < 0) {
      searchFrom = arrayStart;
      continue;
    }
    scopes.push(...extractTopLevelObjectScopes(html, arrayStart + 1, arrayEnd));
    searchFrom = arrayEnd + 1;
  }
}

/**
 * extractItemAnchorScopes returns rendered item-card anchor elements only. The
 * token regex still runs inside each card scope instead of the full document.
 */
function extractItemAnchorScopes(html: string): string[] {
  const scopes: string[] = [];
  const anchorRe =
    /<a\b[^>]{0,4096}\bhref=(["'])(?:https:\/\/opensea\.io)?\/(?:assets|item)\/[a-z_]+\/0x[a-fA-F0-9]{40}\/\d+(?:\?[^"']*)?\1[^>]*>[\s\S]{0,12000}?<\/a>/gi;
  for (;;) {
    const match = anchorRe.exec(html);
    if (!match) {
      return scopes;
    }
    const visibleScope = stripIgnoredHtmlRegions(match[0]);
    if (
      !isInsideIgnoredHtmlRegion(html, match.index) &&
      OPEN_SEA_CARD_MARKERS.some((marker) => visibleScope.includes(marker))
    ) {
      scopes.push(visibleScope);
    }
  }
}

function isInsideIgnoredHtmlRegion(html: string, index: number): boolean {
  return (
    isInsideRawTextElement(html, index, 'script') ||
    isInsideRawTextElement(html, index, 'style') ||
    isInsideRawTextElement(html, index, 'template') ||
    isInsideHtmlComment(html, index)
  );
}

function isInsideRawTextElement(html: string, index: number, tagName: string): boolean {
  const before = html.slice(0, index).toLowerCase();
  const open = before.lastIndexOf(`<${tagName}`);
  if (open === -1) {
    return false;
  }
  const close = before.lastIndexOf(`</${tagName}>`);
  return open > close;
}

function isInsideHtmlComment(html: string, index: number): boolean {
  const commentStart = html.lastIndexOf('<!--', index);
  if (commentStart === -1) {
    return false;
  }
  const commentEnd = html.lastIndexOf('-->', index);
  return commentStart > commentEnd;
}

function stripIgnoredHtmlRegions(html: string): string {
  return html.replace(
    /<!--[\s\S]*?-->|<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
    ''
  );
}

function extractTopLevelObjectScopes(text: string, start: number, end: number): string[] {
  const scopes: string[] = [];
  let cursor = start;
  for (;;) {
    const objectStart = findNextTopLevelObjectStart(text, cursor, end);
    if (objectStart < 0) {
      return scopes;
    }
    const objectEnd = findBalancedEnd(text, objectStart, '{', '}');
    if (objectEnd < 0 || objectEnd > end) {
      return scopes;
    }
    const length = objectEnd - objectStart + 1;
    if (length <= MAX_ITEM_SCOPE_LENGTH) {
      scopes.push(text.slice(objectStart, objectEnd + 1));
    }
    cursor = objectEnd + 1;
  }
}

function findNextTopLevelObjectStart(text: string, start: number, end: number): number {
  for (let i = start; i < end; i += 1) {
    if (text[i] === '{') {
      return i;
    }
    if (!/\s|,/.test(text[i])) {
      return -1;
    }
  }
  return -1;
}

function findBalancedEnd(text: string, start: number, open: string, close: string): number {
  if (text[start] !== open) {
    return -1;
  }
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === open) {
      depth += 1;
    } else if (ch === close) {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
}

function extractTokenFromOpenSeaScope(
  scope: string
): { chain: string; contract: string; tokenId: bigint } | null {
  const relayMatch =
    /"chain":\{"identifier":"([a-z0-9_-]+)"[^{}]*\}[\s\S]{0,300}?"contractAddress":"(0x[a-fA-F0-9]{40})"[\s\S]{0,100}?"tokenId":"(\d+)"[\s\S]{0,100}?"isFungible":false/.exec(
      scope
    );
  if (relayMatch) {
    return {
      chain: relayMatch[1],
      contract: relayMatch[2],
      tokenId: BigInt(relayMatch[3]),
    };
  }

  const anchorMatch =
    /\/(?:assets|item)\/([a-z_]+)\/(0x[a-fA-F0-9]{40})\/(\d+)(?:[?"'])/i.exec(scope);
  if (!anchorMatch) {
    return null;
  }
  return {
    chain: anchorMatch[1],
    contract: anchorMatch[2],
    tokenId: BigInt(anchorMatch[3]),
  };
}
