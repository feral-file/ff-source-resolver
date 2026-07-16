import type { ParsedFindInput } from '../../../types';
import { sourceTokenResult } from '../../../helpers';

const RASTER_ARTWORK_SCOPE_MARKERS = [
  'ArtItem_artworkCard__',
  'ArtItem_artworkLink__',
  'ArtItem_buyNow__',
] as const;
const RASTER_ARTWORK_SCOPE_CHARS = 12000;
const RASTER_TOKEN_PATH = /\/token\/(ethereum|tezos)\/([^/"'<>?\s]+)\/(\d+)/gi;
const HTML_TAG_NAME = /^<([A-Za-z][A-Za-z0-9:-]*)\b/;

/**
 * parseRasterArtwork parses Raster artwork pages. Raster is a series resolver
 * in the CLI, so this parser returns the slug marker rather than coordinates.
 */
export function parseRasterArtwork(url: URL): ParsedFindInput | null {
  const m = /^\/artwork\/([A-Za-z0-9][A-Za-z0-9_-]*)\/?$/.exec(url.pathname);
  if (m) {
    return { kind: 'raster-artwork', slug: m[1] };
  }
  return null;
}

/**
 * extractRasterArtworkId reads Raster's numeric artwork id from its serialized
 * page payload. The public kit API uses this id rather than the page slug.
 */
export function extractRasterArtworkId(html: string): string | null {
  return /\\?"artworkId\\?":(\d+)/.exec(html)?.[1] ?? null;
}

/**
 * extractRasterArtworkTokenFromHtml extracts rendered Raster artwork-card
 * token links from the artwork page only. Raster pages may contain unrelated
 * token paths elsewhere in the document, so token regexes run only inside
 * observed `ArtItem_*` card/link scopes.
 */
export function extractRasterArtworkTokenFromHtml(url: URL, html: string): ParsedFindInput | null {
  return extractRasterArtworkTokensFromHtml(url, html)[0] ?? null;
}

/**
 * extractRasterArtworkTokensFromHtml extracts all rendered Raster artwork-card
 * token links from a collection artwork page.
 */
export function extractRasterArtworkTokensFromHtml(url: URL, html: string): ParsedFindInput[] {
  if (!parseRasterArtwork(url)) {
    return [];
  }

  const results: ParsedFindInput[] = [];
  for (const scope of rasterArtworkScopes(html)) {
    const result = extractRasterTokenFromScope(scope);
    if (result) {
      results.push(result);
    }
  }
  return results;
}

/**
 * rasterArtworkScopes returns bounded rendered Raster card/link elements.
 */
function rasterArtworkScopes(html: string): string[] {
  const scopes: string[] = [];
  const seen = new Set<string>();
  for (const marker of RASTER_ARTWORK_SCOPE_MARKERS) {
    let fromIndex = 0;
    while (fromIndex < html.length) {
      const markerIndex = html.indexOf(marker, fromIndex);
      if (markerIndex === -1) {
        break;
      }
      if (isInsideIgnoredHtmlRegion(html, markerIndex)) {
        fromIndex = markerIndex + marker.length;
        continue;
      }

      const scope = enclosingHtmlElement(html, markerIndex);
      if (scope && !seen.has(scope)) {
        seen.add(scope);
        scopes.push(scope);
      }
      fromIndex = markerIndex + marker.length;
    }
  }
  return scopes;
}

function isInsideIgnoredHtmlRegion(html: string, index: number): boolean {
  if (isInsideHtmlComment(html, index)) {
    return true;
  }
  return (
    isInsideRawTextElement(html, index, 'script') ||
    isInsideRawTextElement(html, index, 'style') ||
    isInsideRawTextElement(html, index, 'template')
  );
}

function isInsideHtmlComment(html: string, index: number): boolean {
  const commentStart = html.lastIndexOf('<!--', index);
  if (commentStart === -1) {
    return false;
  }
  const commentEnd = html.lastIndexOf('-->', index);
  return commentStart > commentEnd;
}

function isInsideRawTextElement(html: string, index: number, tagName: string): boolean {
  const openTag = new RegExp(`<${tagName}\\b`, 'gi');
  let lastOpen = -1;
  let match: RegExpExecArray | null;
  while ((match = openTag.exec(html)) && match.index < index) {
    lastOpen = match.index;
  }
  if (lastOpen === -1) {
    return false;
  }

  const closeTag = new RegExp(`</${tagName}\\s*>`, 'gi');
  let lastClose = -1;
  while ((match = closeTag.exec(html)) && match.index < index) {
    lastClose = match.index;
  }
  return lastOpen > lastClose;
}

function extractRasterTokenFromScope(scope: string): ParsedFindInput | null {
  const visibleScope = stripIgnoredHtmlRegions(scope);
  RASTER_TOKEN_PATH.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = RASTER_TOKEN_PATH.exec(visibleScope))) {
    const chain = match[1].toLowerCase() === 'ethereum' ? 'ethereum' : 'tezos';
    const result = sourceTokenResult('raster', chain, match[2], match[3]);
    if (result) {
      return result;
    }
  }
  return null;
}

function stripIgnoredHtmlRegions(html: string): string {
  return html.replace(
    /<!--[\s\S]*?-->|<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
    ''
  );
}

/**
 * enclosingHtmlElement returns the element whose opening tag contains index.
 */
function enclosingHtmlElement(html: string, index: number): string | null {
  const tagStart = html.lastIndexOf('<', index);
  if (tagStart === -1 || html[tagStart + 1] === '/' || html[tagStart + 1] === '!') {
    return null;
  }

  const tagName = HTML_TAG_NAME.exec(html.slice(tagStart))?.[1]?.toLowerCase();
  if (!tagName || tagName === 'script' || tagName === 'style' || tagName === 'template') {
    return null;
  }

  const elementEnd = findElementEnd(html, tagStart, tagName);
  if (elementEnd) {
    return html.slice(tagStart, elementEnd);
  }
  return html.slice(tagStart, Math.min(html.length, tagStart + RASTER_ARTWORK_SCOPE_CHARS));
}

/**
 * findElementEnd finds a matching close tag for simple rendered HTML scopes.
 */
function findElementEnd(html: string, tagStart: number, tagName: string): number | null {
  const tagPattern = new RegExp(`<\\/?${tagName}\\b[^>]*>`, 'gi');
  tagPattern.lastIndex = tagStart;
  let depth = 0;
  let match: RegExpExecArray | null;
  while ((match = tagPattern.exec(html))) {
    const tag = match[0];
    const isClosing = tag.startsWith('</');
    const isSelfClosing = /\/\s*>$/.test(tag);
    if (isClosing) {
      depth -= 1;
      if (depth === 0) {
        return tagPattern.lastIndex;
      }
    } else if (!isSelfClosing) {
      depth += 1;
    }
    if (match.index > tagStart + RASTER_ARTWORK_SCOPE_CHARS) {
      return null;
    }
  }
  return null;
}
