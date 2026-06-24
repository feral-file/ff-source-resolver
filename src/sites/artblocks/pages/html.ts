import type { ParsedFindInput } from '../../../types';
import { parseArtBlocksToken } from './token';

const CARD_SCOPE_CLASS_TOKENS = ['self-start', 'h-fit', 'w-full', 'flex-col'];
const CARD_LINK_CLASS_TOKENS = ['isolate', 'flex-1'];
const CARD_SCOPE_MAX_LENGTH = 6000;
const CARD_LINK_SCOPE_MAX_LENGTH = 1200;

const ART_BLOCKS_TOKEN_HREF =
  /\/(?:token\/(?:\d+\/0x[a-fA-F0-9]{40}\/\d+|0x[a-fA-F0-9]{40}-\d+)|marketplace\/collections\/0x[a-fA-F0-9]{40}\/tokens\/\d+)/i;
const HREF_ATTRIBUTE = /\bhref\s*=\s*(["'])([^"']+)\1/gi;

/**
 * extractArtBlocksTokenFromHtml extracts token links only from repeated
 * collection card/link scopes observed on rendered Art Blocks collection pages.
 */
export function extractArtBlocksTokenFromHtml(url: URL, html: string): ParsedFindInput | null {
  for (const scope of artBlocksTokenScopes(html)) {
    const result = extractTokenFromScope(url, scope);
    if (result) {
      return result;
    }
  }
  return null;
}

/**
 * artBlocksTokenScopes finds small repeated card/link blocks before token href
 * parsing runs, avoiding broad whole-document path extraction.
 */
function artBlocksTokenScopes(html: string): string[] {
  const scopes = [
    ...classedTagScopes(html, 'div', CARD_SCOPE_CLASS_TOKENS, CARD_SCOPE_MAX_LENGTH),
    ...classedTagScopes(html, 'a', CARD_LINK_CLASS_TOKENS, CARD_LINK_SCOPE_MAX_LENGTH),
  ];
  return [...new Set(scopes)];
}

function classedTagScopes(
  html: string,
  tagName: string,
  requiredClassTokens: readonly string[],
  maxLength: number
): string[] {
  const scopes: string[] = [];
  const tag = new RegExp(`<${tagName}\\b[^>]*\\bclass\\s*=\\s*(["'])([^"']*)\\1[^>]*>`, 'gi');
  let match: RegExpExecArray | null;
  while ((match = tag.exec(html))) {
    if (isInsideIgnoredHtmlRegion(html, match.index)) {
      continue;
    }
    if (!hasClassTokens(match[2], requiredClassTokens)) {
      continue;
    }

    const closingTag = `</${tagName}>`;
    const closingIndex = html.indexOf(closingTag, tag.lastIndex);
    const tagEndIndex =
      closingIndex >= 0 && closingIndex - match.index <= maxLength
        ? closingIndex + closingTag.length
        : match.index + maxLength;
    scopes.push(html.slice(match.index, Math.min(tagEndIndex, html.length)));
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

function hasClassTokens(className: string, requiredTokens: readonly string[]): boolean {
  const tokens = new Set(className.split(/\s+/).filter(Boolean));
  return requiredTokens.every((token) => tokens.has(token));
}

function extractTokenFromScope(url: URL, scope: string): ParsedFindInput | null {
  const visibleScope = stripIgnoredHtmlRegions(scope);
  if (!ART_BLOCKS_TOKEN_HREF.test(visibleScope)) {
    return null;
  }

  HREF_ATTRIBUTE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = HREF_ATTRIBUTE.exec(visibleScope))) {
    const href = decodeHtmlAttribute(match[2]);
    if (!ART_BLOCKS_TOKEN_HREF.test(href)) {
      continue;
    }

    const hrefUrl = parseHref(url, href);
    if (!hrefUrl || !isArtBlocksHost(hrefUrl.hostname)) {
      continue;
    }

    const result = parseArtBlocksToken(hrefUrl);
    if (result?.kind === 'token') {
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

function parseHref(baseUrl: URL, href: string): URL | null {
  try {
    return new URL(href, baseUrl);
  } catch {
    return null;
  }
}

function isArtBlocksHost(hostname: string): boolean {
  return hostname.toLowerCase().replace(/^www\./, '') === 'artblocks.io';
}

function decodeHtmlAttribute(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}
