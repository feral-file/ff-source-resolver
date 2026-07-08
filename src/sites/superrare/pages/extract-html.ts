import type { ParsedFindInput } from '../../../types';
import { sourceTokenResult } from '../../../helpers';
import { parseSuperRareCollectionContract } from './collection';

const ARTWORK_PATH = /\/artwork\/eth\/(0x[a-fA-F0-9]{40})\/(\d+)/i;
const STATIC_TOKEN_OBJECT =
  /tokenId\\+":?(\d+),\\+"contractAddress\\+":\\+"(0x[a-fA-F0-9]{40})\\+",\\+"chainId\\+":\\+"1\\+"/g;
const MAX_COLLECTION_SCAN_CHARS = 120_000;

interface ElementSlice {
  start: number;
  end: number;
}

/**
 * extractSuperRareCollectionArtwork extracts the first artwork card token from
 * SuperRare collection HTML. SuperRare's rendered collection page virtualizes
 * artwork cards inside `#collection [data-testid="virtuoso-item-list"]`; keep
 * token regexes scoped to those cards so unrelated page paths do not win.
 */
export function extractSuperRareCollectionArtwork(url: URL, html: string): ParsedFindInput | null {
  return extractSuperRareCollectionArtworks(url, html)[0] ?? null;
}

/**
 * extractSuperRareCollectionArtworks extracts static RSC token records and
 * rendered collection artwork links from SuperRare collection pages.
 */
export function extractSuperRareCollectionArtworks(url: URL, html: string): ParsedFindInput[] {
  if (!parseSuperRareCollectionContract(url)) {
    return [];
  }

  const staticTokens = extractStaticTokenObjects(html);
  if (staticTokens.length > 0) {
    return staticTokens;
  }

  const collection = extractElementByAttribute(html, 'id', 'collection');
  if (!collection) {
    return [];
  }

  const list = extractElementByAttribute(
    html,
    'data-testid',
    'virtuoso-item-list',
    collection.start,
    Math.min(collection.end, collection.start + MAX_COLLECTION_SCAN_CHARS)
  );
  if (!list || list.end > collection.end) {
    return [];
  }

  const results: ParsedFindInput[] = [];
  for (const card of extractElementsByTag(html, 'article', list.start, list.end)) {
    const parsed = extractArtworkPath(html.slice(card.start, card.end));
    if (parsed) {
      results.push(parsed);
    }
  }
  return results;
}

function extractArtworkPath(scope: string): ParsedFindInput | null {
  const match = ARTWORK_PATH.exec(stripIgnoredHtmlRegions(scope));
  if (!match) {
    return null;
  }

  return sourceTokenResult('superrare', 'ethereum', match[1].toLowerCase(), match[2]);
}

function extractStaticTokenObjects(html: string): ParsedFindInput[] {
  const results: ParsedFindInput[] = [];
  const visible = stripIgnoredHtmlRegions(html);
  STATIC_TOKEN_OBJECT.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = STATIC_TOKEN_OBJECT.exec(visible))) {
    const result = sourceTokenResult('superrare', 'ethereum', match[2].toLowerCase(), match[1]);
    if (result) {
      results.push(result);
    }
  }
  return results;
}

function extractElementByAttribute(
  html: string,
  name: string,
  value: string,
  from = 0,
  to = html.length
): ElementSlice | null {
  const openTag = findOpenTagByAttribute(html, name, value, from, to);
  if (!openTag) {
    return null;
  }
  const end = findElementEnd(html, openTag.tagName, openTag.start, to);
  return end ? { start: openTag.start, end } : null;
}

function extractElementsByTag(
  html: string,
  tagName: string,
  from: number,
  to: number
): ElementSlice[] {
  const elements: ElementSlice[] = [];
  const re = new RegExp(`<${tagName}\\b[^>]*>`, 'gi');
  re.lastIndex = from;

  for (;;) {
    const match = re.exec(html);
    if (!match || match.index >= to) {
      break;
    }
    if (isInsideIgnoredHtmlRegion(html, match.index)) {
      continue;
    }
    const end = findElementEnd(html, tagName, match.index, to);
    if (!end) {
      break;
    }
    elements.push({ start: match.index, end });
    re.lastIndex = end;
  }

  return elements;
}

function findOpenTagByAttribute(
  html: string,
  name: string,
  value: string,
  from: number,
  to: number
): { tagName: string; start: number } | null {
  const attr = `${escapeRegex(name)}\\s*=\\s*(?:"${escapeRegex(value)}"|'${escapeRegex(value)}')`;
  const re = new RegExp(`<([a-z][a-z0-9:-]*)\\b(?=[^>]*\\b${attr})[^>]*>`, 'gi');
  re.lastIndex = from;

  for (;;) {
    const match = re.exec(html);
    if (!match || match.index >= to) {
      return null;
    }
    if (!isInsideIgnoredHtmlRegion(html, match.index)) {
      return { tagName: match[1].toLowerCase(), start: match.index };
    }
  }
}

function findElementEnd(html: string, tagName: string, start: number, to: number): number | null {
  const tag = escapeRegex(tagName);
  const re = new RegExp(`</?${tag}\\b[^>]*>`, 'gi');
  re.lastIndex = start;
  let depth = 0;

  for (;;) {
    const match = re.exec(html);
    if (!match || match.index >= to) {
      return null;
    }
    if (match[0][1] === '/') {
      depth -= 1;
      if (depth === 0) {
        return re.lastIndex;
      }
      continue;
    }
    if (!/\/\s*>$/.test(match[0])) {
      depth += 1;
    }
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripIgnoredHtmlRegions(html: string): string {
  return html.replace(
    /<!--[\s\S]*?-->|<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
    ''
  );
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
