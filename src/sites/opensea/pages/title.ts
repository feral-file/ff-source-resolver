import type { ParsedFindInput } from '../../../types';

const NAME_WINDOW_CHARS = 500;
const NAME_PATTERN = /"name"\s*:\s*"((?:[^"\\]|\\.)*)"/g;

/**
 * extractOpenSeaCollectionTitle returns the collection's own name for a
 * collection page, never the page `<title>` verbatim.
 *
 * OpenSea's collection `<title>` embeds the floor price and page furniture
 * ("PXL NET 0.1904 ETH - Collection | OpenSea"), so a title taken from it
 * persists a price that is stale the moment it is stored. The collection's
 * real name rides the same embedded JSON payloads the keyless item extraction
 * already scans: the collection object carries adjacent `"name"` and
 * `"slug"` fields, and the slug is known from the parsed URL.
 *
 * Fallback order matters: embedded name first (exact), then a `<title>`
 * scrubbed of the price/"- Collection" furniture (close), then null so the
 * caller's generic title chain keeps its existing behavior.
 */
export function extractOpenSeaCollectionTitle(
  _url: URL,
  html: string,
  parsed: ParsedFindInput | null
): string | null {
  if (parsed?.kind !== 'os-collection') {
    return null;
  }
  return embeddedCollectionName(html, parsed.slug) ?? scrubbedCollectionHtmlTitle(html);
}

/**
 * embeddedCollectionName finds the `"name"` nearest to `"slug":"<slug>"` in
 * the page's embedded JSON. The window bound keeps a payment-token or item
 * name elsewhere in the payload from being read as the collection's.
 */
function embeddedCollectionName(html: string, slug: string): string | null {
  const slugMarker = `"slug":"${slug}"`;
  let searchFrom = 0;
  for (;;) {
    const slugIndex = html.indexOf(slugMarker, searchFrom);
    if (slugIndex < 0) {
      return null;
    }
    const windowStart = Math.max(0, slugIndex - NAME_WINDOW_CHARS);
    const window = html.slice(windowStart, slugIndex + slugMarker.length + NAME_WINDOW_CHARS);
    const name = nearestName(window, slugIndex - windowStart);
    if (name) {
      return name;
    }
    searchFrom = slugIndex + slugMarker.length;
  }
}

function nearestName(window: string, slugOffset: number): string | null {
  let best: { distance: number; raw: string } | null = null;
  NAME_PATTERN.lastIndex = 0;
  for (;;) {
    const match = NAME_PATTERN.exec(window);
    if (!match) {
      break;
    }
    const distance = Math.abs(match.index - slugOffset);
    if (!best || distance < best.distance) {
      best = { distance, raw: match[1] };
    }
  }
  if (!best) {
    return null;
  }
  try {
    const decoded = JSON.parse(`"${best.raw}"`) as string;
    const trimmed = decoded.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

/**
 * scrubbedCollectionHtmlTitle strips the collection-page furniture from a
 * `<title>` when no embedded name was found: the "| OpenSea" suffix, then a
 * trailing floor price + "- Collection" segment.
 */
function scrubbedCollectionHtmlTitle(html: string): string | null {
  const titleMatch = /<title[^>]*>([^<]*)<\/title>/i.exec(html);
  if (!titleMatch) {
    return null;
  }
  let title = titleMatch[1].trim();
  title = title.replace(/\s*\|\s*OpenSea\s*$/i, '').trim();
  const withoutFurniture = title
    .replace(/\s+[\d.,]+\s*ETH\s*[-–—]\s*Collection\s*$/i, '')
    .replace(/\s*[-–—]\s*Collection\s*$/i, '')
    .trim();
  if (withoutFurniture.length === 0 || withoutFurniture === title) {
    // No collection furniture found: leave the generic title chain to apply
    // its own marketplace suffix handling unchanged.
    return null;
  }
  return withoutFurniture;
}
