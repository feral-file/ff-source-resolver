import type {
  ArtworkSourceFinding,
  ParsedFindInput,
  SourceSiteAdapter,
  TokenFindingsResult,
} from '../../types';
import { limitTokenFindings, tokenLimitTarget } from '../../limits';
import {
  dp1ItemsToArtworkSourceFindings,
  dp1ItemToTokenFinding,
  resolveFeralFileDp1Data,
  type FeralFileDp1Item,
} from './dp1';

/**
 * feralFileAdapter resolves feralfile.com pages by reading the DP-1 document
 * the page itself declares (see ./dp1), not by matching the URL's path shape
 * or calling a Feral File API. Any feralfile.com URL works -- the current
 * flat scheme or an old `/exhibitions/...` URL, which 301-redirects to it --
 * because resolution starts from the live page, not the URL string.
 */
export const feralFileAdapter: SourceSiteAdapter = {
  source: 'feralfile',
  hosts: ['feralfile.com'],
  parseUrl(url: URL): ParsedFindInput {
    return { kind: 'ff-url', identifier: url.pathname.replace(/^\/+|\/+$/g, '') };
  },
  async resolveTokensFromApi(url, _parsed, fetchImpl, context): Promise<TokenFindingsResult> {
    const data = await resolveFeralFileDp1Data(url, fetchImpl, context?.html, context?.limit);
    const findings: ParsedFindInput[] = [];
    for (const item of data.items) {
      const finding = dp1ItemToTokenFinding(item);
      if (finding) {
        findings.push(finding);
      }
    }
    const targetCount = tokenLimitTarget(context?.limit);
    const hasMore = targetCount != null && findings.length >= targetCount;
    return {
      findings: limitTokenFindings(findings, context?.limit),
      ...(data.title ? { title: data.title } : {}),
      ...(hasMore ? { hasMore } : {}),
      enrichmentContext: data.items,
    };
  },
  async resolveArtworkSources(url, coords, fetchImpl, context): Promise<readonly ArtworkSourceFinding[]> {
    const items = isDp1Items(context?.enrichmentContext)
      ? context.enrichmentContext
      : (await resolveFeralFileDp1Data(url, fetchImpl, context?.html)).items;
    return dp1ItemsToArtworkSourceFindings(items, coords);
  },
};

function isDp1Items(value: unknown): value is readonly FeralFileDp1Item[] {
  return Array.isArray(value);
}
