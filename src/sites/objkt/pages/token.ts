import type { ParsedFindInput } from '../../../types';
import { sourceTokenResult } from '../../../helpers';

const OBJKT_TOKEN_PAGE = /^\/(?:tokens|asset)\/([^/]+)\/(\d+)\/?$/;
const OBJKT_IMAGE_META_ATTR =
  /\b(?:property|name)\s*=\s*(["'])(?:og:image|twitter:image|fc:frame:image)\1/i;
const OBJKT_ASSET_MEDIA_TOKEN =
  /https?:\/\/assets\.objkt\.media\/file\/assets-\d+\/(KT[A-Za-z0-9]+)\/(\d+)\/social(?:[?"'\s>]|$)/;
const META_TAG = /<meta\b[^>]*>/gi;
const MAX_META_SCOPE_LENGTH = 1200;

/**
 * parseObjktToken parses Objkt token pages that encode a Tezos contract and
 * token id directly in the path. Alias-backed URLs deliberately return their
 * own marker because a keyless static lookup is required to discover the KT1
 * contract behind the alias.
 */
export function parseObjktToken(url: URL): ParsedFindInput | null {
  const direct = /^\/(?:tokens|asset)\/(KT[A-Za-z0-9]+)\/(\d+)\/?$/.exec(url.pathname);
  if (direct) {
    return sourceTokenResult('objkt', 'tezos', direct[1], direct[2]);
  }
  const alias = /^\/(?:tokens|asset)\/([a-zA-Z][a-zA-Z0-9_-]*)\/(\d+)\/?$/.exec(url.pathname);
  if (alias) {
    return { kind: 'objkt-alias', alias: alias[1], tokenId: alias[2] };
  }
  return null;
}

/**
 * extractObjktTokenFromHtml extracts alias-backed Objkt token coordinates from
 * token-detail metadata. Rendered Objkt token pages expose their canonical KT1
 * contract in narrow social-image meta tags such as
 * `assets.objkt.media/file/assets-003/{KT1}/{tokenId}/social`; scanning only
 * those token-detail scopes avoids matching unrelated paths elsewhere.
 */
export function extractObjktTokenFromHtml(url: URL, html: string): ParsedFindInput | null {
  const parsed = parseObjktToken(url);
  if (parsed?.kind !== 'objkt-alias') {
    return null;
  }

  for (const scope of objktTokenDetailScopes(html)) {
    const result = extractObjktMetaToken(scope, parsed.tokenId);
    if (result) {
      return result;
    }
  }
  return null;
}

/**
 * objktTokenDetailScopes returns only Objkt token-detail social preview meta
 * tags. The tags are tiny, stable after headless rendering, and contain the
 * canonical KT1/token path for alias URLs.
 */
function objktTokenDetailScopes(html: string): string[] {
  const scopes: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = META_TAG.exec(html))) {
    if (isInsideIgnoredHtmlRegion(html, match.index)) {
      continue;
    }
    const tag = match[0];
    if (
      tag.length <= MAX_META_SCOPE_LENGTH &&
      OBJKT_IMAGE_META_ATTR.test(tag) &&
      tag.includes('assets.objkt.media')
    ) {
      scopes.push(tag);
    }
  }
  return scopes;
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

function extractObjktMetaToken(scope: string, pageTokenId: string): ParsedFindInput | null {
  const match = OBJKT_ASSET_MEDIA_TOKEN.exec(scope.replace(/\\\//g, '/'));
  if (!match || match[2] !== pageTokenId) {
    return null;
  }
  return sourceTokenResult('objkt', 'tezos', match[1], match[2]);
}
