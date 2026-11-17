import { cleanFindingArtist, hasHostMatch, httpUrl, sourceTokenResult } from '../../helpers';
import { tokenLimitTarget } from '../../limits';
import type { ArtworkSourceFinding, IndexerChain, ParsedFindInput, TokenCoords } from '../../types';

const DP1_DOCUMENT_HOSTS = ['feralfile.com'];

const PLAYLIST_LINK_TITLE = 'DP-1 playlist';
const CHANNEL_LINK_TITLE = 'DP-1 channel';

const IPFS_GATEWAY = 'https://ipfs.io/ipfs/';

/**
 * ipfsToHttp converts an `ipfs://<cid>/...` URI to a public gateway URL, the
 * same way every sibling adapter does before handing a value to `httpUrl` --
 * real Feral File DP-1 documents declare `provenance.contract.uri` as an
 * `ipfs://` reference, which `httpUrl` would otherwise reject outright.
 */
function ipfsToHttp(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (!/^ipfs:\/\//i.test(trimmed)) return trimmed;
  const path = trimmed.replace(/^ipfs:\/\/(?:ipfs\/)?/i, '').replace(/^\/+/, '');
  return path ? `${IPFS_GATEWAY}${path}` : null;
}

interface Dp1Contract {
  chain?: string;
  address?: string;
  tokenId?: string | number;
  standard?: string;
  uri?: string;
}

interface Dp1Provenance {
  contract?: Dp1Contract;
}

interface Dp1ArtistAvatar {
  uri?: string;
}

interface Dp1ArtistBiography {
  text?: string;
}

interface Dp1Artist {
  name?: string;
  addresses?: readonly string[];
  avatar?: Dp1ArtistAvatar | null;
  biographies?: readonly Dp1ArtistBiography[];
}

/**
 * FeralFileDp1Item is the subset of a DP-1 PlaylistItem this package reads:
 * on-chain provenance for token identity, the already-resolved playable
 * `source` URL, and inline artist credits. Everything else a Feral File
 * playlist document carries (display prefs, licensing, reproduction data) is
 * irrelevant to source resolution and left unparsed.
 */
export interface FeralFileDp1Item {
  source?: string;
  provenance?: Dp1Provenance;
  inlineManifest?: {
    metadata?: {
      artists?: readonly Dp1Artist[];
    };
  };
}

interface Dp1Playlist {
  title?: string;
  items?: readonly FeralFileDp1Item[];
}

interface Dp1Channel {
  title?: string;
  playlists?: readonly string[];
}

export interface FeralFileDp1Result {
  items: readonly FeralFileDp1Item[];
  title?: string;
}

/**
 * resolveFeralFileDp1Data reads a feralfile.com page's declared DP-1
 * document(s) -- the `<link rel="alternate" title="DP-1 playlist|channel">`
 * tags every page emits -- rather than parsing the URL shape or calling a
 * Feral File API. A page that bundles multiple series (an exhibition)
 * declares a channel; its `playlists` are each series' own playlist URL,
 * which is where the real on-chain items live. A page with only one series
 * or one artwork declares just a playlist.
 */
export async function resolveFeralFileDp1Data(
  pageUrl: URL,
  fetchImpl: typeof fetch,
  htmlHint: string | null | undefined,
  limit?: number
): Promise<FeralFileDp1Result> {
  const html = htmlHint ?? (await fetchText(pageUrl.toString(), fetchImpl));
  if (!html) {
    return { items: [] };
  }

  const channelHref = extractDp1LinkHref(html, CHANNEL_LINK_TITLE, pageUrl);
  if (channelHref) {
    const channel = await fetchJson<Dp1Channel>(channelHref, fetchImpl);
    const playlistUrls = (channel?.playlists ?? []).flatMap((url) => {
      const resolved = resolveDp1DocumentUrl(url, pageUrl);
      return resolved ? [resolved] : [];
    });
    if (playlistUrls.length > 0) {
      const items = await fetchFeralFileSeriesItems(playlistUrls, fetchImpl, limit);
      return { items, ...(channel?.title ? { title: channel.title } : {}) };
    }
  }

  const playlistHref = extractDp1LinkHref(html, PLAYLIST_LINK_TITLE, pageUrl);
  if (!playlistHref) {
    return { items: [] };
  }
  const playlist = await fetchJson<Dp1Playlist>(playlistHref, fetchImpl);
  return {
    items: playlist?.items ?? [],
    ...(playlist?.title ? { title: playlist.title } : {}),
  };
}

/**
 * fetchFeralFileSeriesItems fetches each series' playlist in order, stopping
 * once enough resolvable tokens have been collected to satisfy limit plus
 * one (for hasMore detection) -- mirroring the per-series API walk this
 * mechanism replaces, which stopped fetching further series the same way.
 */
async function fetchFeralFileSeriesItems(
  playlistUrls: readonly string[],
  fetchImpl: typeof fetch,
  limit: number | undefined
): Promise<FeralFileDp1Item[]> {
  const items: FeralFileDp1Item[] = [];
  const targetCount = tokenLimitTarget(limit);
  for (const playlistUrl of playlistUrls) {
    const playlist = await fetchJson<Dp1Playlist>(playlistUrl, fetchImpl);
    items.push(...(playlist?.items ?? []));
    if (targetCount != null && countResolvableTokens(items) >= targetCount) {
      break;
    }
  }
  return items;
}

function countResolvableTokens(items: readonly FeralFileDp1Item[]): number {
  let count = 0;
  for (const item of items) {
    if (dp1ItemToTokenFinding(item)) {
      count += 1;
    }
  }
  return count;
}

/**
 * dp1ItemToTokenFinding maps one DP-1 PlaylistItem's on-chain provenance to
 * token coordinates. DP-1's chain vocabulary is `evm`/`tezos`/`bitmark`/
 * `other`, not this package's `ethereum`/`tezos`; an item on any chain this
 * package does not support (bitmark, for pre-current-chain Feral File
 * editions, or anything else) is simply omitted, never an error for the rest
 * of the page.
 */
export function dp1ItemToTokenFinding(item: FeralFileDp1Item): ParsedFindInput | null {
  const contract = item.provenance?.contract;
  const chain = mapDp1Chain(contract?.chain);
  if (!chain || !contract?.address || contract.tokenId == null) {
    return null;
  }
  return sourceTokenResult('feralfile', chain, contract.address, String(contract.tokenId));
}

function mapDp1Chain(chain: string | undefined): IndexerChain | null {
  if (chain === 'evm') return 'ethereum';
  if (chain === 'tezos') return 'tezos';
  return null;
}

/**
 * dp1ItemsToArtworkSourceFindings pairs requested token coordinates with the
 * playable `source` URL, artist credits, and token standard/metadata URI each
 * matching DP-1 item carries. Coordinates that do not match any item --
 * including one on an unsupported chain -- are simply absent from the
 * result.
 *
 * In production today, only a single-artwork page's own DP-1 document
 * carries `inlineManifest.metadata.artists` on its item; a series' own
 * playlist (fetched directly for a series page, or as one of a channel's
 * listed playlists for an exhibition page) does not, so a series or
 * exhibition resolution currently yields findings with no `artists` --
 * `artists` is read here exactly the same way regardless, so this will
 * start crediting series/exhibition artists the moment Feral File's own
 * publishing pipeline adds the field at that level, with no code change.
 */
export function dp1ItemsToArtworkSourceFindings(
  items: readonly FeralFileDp1Item[],
  requestedCoords: readonly TokenCoords[]
): ArtworkSourceFinding[] {
  const requested = new Map(requestedCoords.map((coords) => [coordsKey(coords), coords] as const));
  const findings: ArtworkSourceFinding[] = [];
  for (const item of items) {
    const finding = dp1ItemToTokenFinding(item);
    if (finding?.kind !== 'token') {
      continue;
    }
    const coords = requested.get(coordsKey(finding.coords));
    const artworkSource = httpUrl(item.source);
    if (!coords || !artworkSource) {
      continue;
    }
    const artists = feralFileArtists(item.inlineManifest?.metadata?.artists);
    const metadataUri = httpUrl(ipfsToHttp(item.provenance?.contract?.uri));
    const standard = dp1Standard(item.provenance?.contract?.standard);
    findings.push({
      coords,
      artworkSource,
      ...(artists.length > 0 ? { artists } : {}),
      ...(metadataUri ? { metadataUri } : {}),
      ...(standard ? { standard } : {}),
    });
  }
  return findings;
}

function feralFileArtists(artists: readonly Dp1Artist[] | undefined) {
  return (artists ?? []).flatMap((artist) => {
    const cleaned = cleanFindingArtist({
      name: artist.name,
      addresses: artist.addresses,
      avatar: artist.avatar?.uri,
      bio: artist.biographies?.[0]?.text,
    });
    return cleaned ? [cleaned] : [];
  });
}

function dp1Standard(standard: string | undefined): ArtworkSourceFinding['standard'] {
  return standard === 'erc721' || standard === 'erc1155' || standard === 'fa2' ? standard : undefined;
}

function coordsKey(coords: TokenCoords): string {
  // Ethereum hex addresses are case-insensitive after validation, while Tezos
  // Base58 contracts must retain their exact casing.
  const contract = coords.chain === 'ethereum' ? coords.contract.toLowerCase() : coords.contract;
  return `${coords.chain}:${contract}:${coords.tokenId}`;
}

/**
 * extractDp1LinkHref finds the href of the one `<link rel="alternate">` tag
 * whose `title` attribute matches, by that title alone -- never by guessing
 * the DP-1 document's URL from the page's own URL path. Script, style,
 * template and comment regions are stripped first, the same way every other
 * adapter's HTML extractor does, so a `<link>`-shaped string embedded in page
 * data (not a real tag) cannot be mistaken for the real declaration. The
 * resolved href must also stay on a feralfile.com host: this document's
 * content becomes trusted on-chain provenance and a playable artwork URL,
 * not just a display title, so an off-host href is treated as absent rather
 * than fetched.
 */
function extractDp1LinkHref(html: string, title: string, base: URL): string | null {
  const linkTag = /<link\b[^>]*>/gi;
  const visible = stripIgnoredHtmlRegions(html);
  let match: RegExpExecArray | null;
  while ((match = linkTag.exec(visible))) {
    const tag = match[0];
    if (!/\brel\s*=\s*["']alternate["']/i.test(tag)) {
      continue;
    }
    const tagTitle = /\btitle\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
    if (tagTitle !== title) {
      continue;
    }
    const href = /\bhref\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
    if (!href) {
      continue;
    }
    const resolved = resolveDp1DocumentUrl(href, base);
    if (resolved) {
      return resolved;
    }
  }
  return null;
}

function resolveDp1DocumentUrl(href: string, base: URL): string | null {
  try {
    const url = new URL(href, base);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    return hasHostMatch(host, DP1_DOCUMENT_HOSTS) ? url.toString() : null;
  } catch {
    return null;
  }
}

function stripIgnoredHtmlRegions(html: string): string {
  return html.replace(/<!--[\s\S]*?-->|<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
}

async function fetchText(url: string, fetchImpl: typeof fetch): Promise<string | null> {
  try {
    const response = await fetchImpl(url, { headers: { Accept: 'text/html,application/xhtml+xml' } });
    return response.ok ? await response.text() : null;
  } catch {
    return null;
  }
}

async function fetchJson<T>(url: string, fetchImpl: typeof fetch): Promise<T | null> {
  try {
    const response = await fetchImpl(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) {
      return null;
    }
    return (await response.json().catch(() => null)) as T | null;
  } catch {
    return null;
  }
}
