import type {
  ArtworkSourceFinding,
  ResolveArtworkSourcesContext,
  TokenCoords,
} from '../../../types';
import { isValidTokenCoords } from '../../../validation';

const ETHEREUM_CHAIN_ID = 1;

/**
 * resolveArtBlocksArtworkSources maps supported Art Blocks Ethereum token
 * coordinates to the documented, iframe-able Generator API URL. The URL is
 * deterministic, so collections do not require one Token API request per
 * artwork.
 */
export async function resolveArtBlocksArtworkSources(
  _url: URL,
  coords: readonly TokenCoords[],
  _fetchImpl: typeof fetch,
  _context?: ResolveArtworkSourcesContext
): Promise<readonly ArtworkSourceFinding[]> {
  return coords.flatMap((token): ArtworkSourceFinding[] => {
    if (token.chain !== 'ethereum' || !isValidTokenCoords(token)) {
      return [];
    }

    const contract = token.contract.toLowerCase();
    return [
      {
        coords: token,
        artworkSource:
          `https://generator.artblocks.io/${ETHEREUM_CHAIN_ID}/` +
          `${contract}/${token.tokenId}`,
      },
    ];
  });
}
