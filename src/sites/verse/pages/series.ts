import type { ParsedFindInput } from '../../../types';
import { sourceTokenResult } from '../../../helpers';

const VERSE_ITEM_CARD_MARKERS = [
  'virtuoso-grid-item',
  'TabArtworkThumbnail_root',
  'TabArtworkThumbnail_link',
  'TabArtworkThumbnail_title',
] as const;
const VERSE_CARD_SCOPE_CHARS = 4000;
const VERSE_ITEM_PATH = /\/items\/ethereum\/(0x[a-fA-F0-9]{40})\/(\d+)/i;
const HTML_TAG_NAME = /^<([A-Za-z][A-Za-z0-9:-]*)\b/;

/**
 * parseVerseSeries parses Verse series pages. Static DOM extraction may later
 * find item links on the same page, but the CLI keeps this marker for its
 * existing series resolver.
 */
export function parseVerseSeries(url: URL): ParsedFindInput | null {
  const m = /^\/series\/([A-Za-z0-9][A-Za-z0-9_-]*)\/?$/.exec(url.pathname);
  if (m) {
    return { kind: 'verse-series', slug: m[1] };
  }
  return null;
}

/**
 * extractVerseSeriesTokenFromHtml scans only rendered Verse item-card scopes.
 * Series pages expose item links inside virtualized artwork cards, so broad
 * whole-document path scanning risks picking up unrelated cached or nav URLs.
 */
export function extractVerseSeriesTokenFromHtml(html: string): ParsedFindInput | null {
  for (const scope of verseItemCardScopes(html)) {
    const m = VERSE_ITEM_PATH.exec(stripIgnoredHtmlRegions(scope));
    if (m) {
      return sourceTokenResult('verse', 'ethereum', m[1], m[2]);
    }
  }
  return null;
}

/**
 * verseItemCardScopes returns small chunks around known Verse item-card markers.
 */
function verseItemCardScopes(html: string): string[] {
  const scopes: string[] = [];
  const seen = new Set<string>();
  for (const marker of VERSE_ITEM_CARD_MARKERS) {
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
  if (!tagName) {
    return null;
  }
  if (tagName === 'script' || tagName === 'style' || tagName === 'template') {
    return null;
  }
  const elementEnd = findElementEnd(html, tagStart, tagName);
  if (elementEnd) {
    return html.slice(tagStart, elementEnd);
  }
  return html.slice(tagStart, Math.min(html.length, tagStart + VERSE_CARD_SCOPE_CHARS));
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
    const isSelfClosing = tag.endsWith('/>');
    if (isClosing) {
      depth -= 1;
      if (depth === 0) {
        return tagPattern.lastIndex;
      }
    } else if (!isSelfClosing) {
      depth += 1;
    }
    if (match.index > tagStart + VERSE_CARD_SCOPE_CHARS) {
      return null;
    }
  }
  return null;
}
