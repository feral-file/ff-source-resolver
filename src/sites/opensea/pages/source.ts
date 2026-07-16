import type {
  ArtworkSourceFinding,
  ResolveArtworkSourcesContext,
  TokenCoords,
} from '../../../types';

const URQL_TRANSPORT_MARKER = 'urql_transport';
const IPFS_GATEWAY = 'https://ipfs.io/ipfs/';
const MAX_JSON_DEPTH = 100;

interface OpenSeaEmbeddedItem {
  chain?: { identifier?: string | null } | null;
  contractAddress?: string | null;
  tokenId?: string | number | null;
  isFungible?: boolean | null;
  originalAnimationUrl?: string | null;
  animationUrl?: string | null;
  originalImageUrl?: string | null;
  imageUrl?: string | null;
}

/**
 * resolveOpenSeaArtworkSources extracts keyless artwork URLs from OpenSea's
 * embedded page data. Existing static or rendered HTML is reused; direct item
 * URLs require at most one additional page fetch when no HTML was supplied.
 */
export async function resolveOpenSeaArtworkSources(
  url: URL,
  coords: readonly TokenCoords[],
  fetchImpl: typeof fetch,
  context?: ResolveArtworkSourcesContext
): Promise<ArtworkSourceFinding[]> {
  const html = context?.html ?? (await fetchOpenSeaHtml(url, fetchImpl));
  if (!html) {
    return [];
  }

  const requested = new Map(
    coords
      .filter(({ chain }) => chain === 'ethereum')
      .map((tokenCoords) => [coordsKey(tokenCoords), tokenCoords] as const)
  );
  const findings = new Map<string, ArtworkSourceFinding>();

  for (const item of extractOpenSeaArtworkItems(html)) {
    const contract = item.contractAddress ?? '';
    const tokenId = item.tokenId == null ? '' : String(item.tokenId);
    const key = coordsKey({ chain: 'ethereum', contract, tokenId });
    const tokenCoords = requested.get(key);
    const artworkSource = playableOpenSeaUrl(
      item.originalAnimationUrl,
      item.animationUrl,
      item.originalImageUrl,
      item.imageUrl
    );
    if (tokenCoords && artworkSource && !findings.has(key)) {
      findings.set(key, { coords: tokenCoords, artworkSource });
    }
  }

  return coords.flatMap((tokenCoords) => {
    const finding = findings.get(coordsKey(tokenCoords));
    return finding ? [finding] : [];
  });
}

async function fetchOpenSeaHtml(url: URL, fetchImpl: typeof fetch): Promise<string | null> {
  const response = await fetchImpl(url.toString(), {
    headers: { Accept: 'text/html,application/xhtml+xml' },
  });
  if (!response.ok) {
    return null;
  }
  return response.text();
}

/**
 * extractOpenSeaArtworkItems reads only urql rehydration payloads and accepts
 * item-shaped objects with explicit chain, contract, token id, and NFT marker.
 * This prevents collection art, currency icons, and recommendations from being
 * treated as media for an unrelated requested token.
 */
function extractOpenSeaArtworkItems(html: string): OpenSeaEmbeddedItem[] {
  const items: OpenSeaEmbeddedItem[] = [];
  for (const payload of extractUrqlPayloads(html)) {
    collectEmbeddedItems(payload, items, 0);
  }
  return items;
}

function extractUrqlPayloads(html: string): unknown[] {
  const payloads: unknown[] = [];
  let searchFrom = 0;
  for (;;) {
    const marker = html.indexOf(URQL_TRANSPORT_MARKER, searchFrom);
    if (marker < 0) {
      return payloads;
    }
    const push = html.indexOf('.push(', marker);
    if (push < 0 || push - marker > 200) {
      searchFrom = marker + URQL_TRANSPORT_MARKER.length;
      continue;
    }
    const objectStart = skipWhitespace(html, push + '.push('.length);
    const objectEnd = findJsonObjectEnd(html, objectStart);
    if (objectEnd < 0) {
      searchFrom = objectStart + 1;
      continue;
    }
    try {
      payloads.push(JSON.parse(html.slice(objectStart, objectEnd + 1)) as unknown);
    } catch {
      // Ignore malformed hydration entries and continue scanning later pushes.
    }
    searchFrom = objectEnd + 1;
  }
}

function collectEmbeddedItems(value: unknown, items: OpenSeaEmbeddedItem[], depth: number): void {
  if (depth > MAX_JSON_DEPTH || value == null || typeof value !== 'object') {
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectEmbeddedItems(entry, items, depth + 1);
    }
    return;
  }

  const candidate = value as OpenSeaEmbeddedItem;
  if (isOpenSeaArtworkItem(candidate)) {
    items.push(candidate);
  }
  for (const entry of Object.values(value)) {
    collectEmbeddedItems(entry, items, depth + 1);
  }
}

function isOpenSeaArtworkItem(item: OpenSeaEmbeddedItem): boolean {
  return (
    item.chain?.identifier === 'ethereum' &&
    /^0x[a-f0-9]{40}$/i.test(item.contractAddress ?? '') &&
    /^\d+$/.test(String(item.tokenId ?? '')) &&
    item.isFungible === false &&
    [
      item.originalAnimationUrl,
      item.animationUrl,
      item.originalImageUrl,
      item.imageUrl,
    ].some((value) => Boolean(value?.trim()))
  );
}

function playableOpenSeaUrl(...candidates: Array<string | null | undefined>): string | null {
  for (const candidate of candidates) {
    const value = candidate?.trim();
    if (!value) {
      continue;
    }
    if (/^ipfs:\/\//i.test(value)) {
      const path = value.replace(/^ipfs:\/\/(?:ipfs\/)?/i, '').replace(/^\/+/, '');
      if (path) {
        return `${IPFS_GATEWAY}${path}`;
      }
    }
    try {
      const parsed = new URL(value);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        return parsed.toString();
      }
    } catch {
      // Try the next media candidate when an embedded URL is malformed.
    }
  }
  return null;
}

function skipWhitespace(text: string, start: number): number {
  let cursor = start;
  while (/\s/.test(text[cursor] ?? '')) {
    cursor += 1;
  }
  return cursor;
}

function findJsonObjectEnd(text: string, start: number): number {
  if (text[start] !== '{') {
    return -1;
  }
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let cursor = start; cursor < text.length; cursor += 1) {
    const char = text[cursor];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
    } else if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return cursor;
      }
    }
  }
  return -1;
}

function coordsKey({ chain, contract, tokenId }: TokenCoords): string {
  return `${chain}:${contract.toLowerCase()}:${tokenId}`;
}
