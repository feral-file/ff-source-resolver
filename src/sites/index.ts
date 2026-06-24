import type { SourceSiteAdapter } from '../types';
import { artBlocksAdapter } from './artblocks';
import { feralFileAdapter } from './feralfile';
import { fxhashAdapter } from './fxhash';
import { neortAdapter } from './neort';
import { objktAdapter } from './objkt';
import { openSeaAdapter } from './opensea';
import { rasterAdapter } from './raster';
import { superRareAdapter } from './superrare';
import { verseAdapter } from './verse';

/**
 * siteAdapters lists the keyless site adapters in dispatch order. The order is
 * not a fallback policy; host matching selects exactly one adapter.
 */
export const siteAdapters: readonly SourceSiteAdapter[] = [
  objktAdapter,
  artBlocksAdapter,
  fxhashAdapter,
  feralFileAdapter,
  openSeaAdapter,
  superRareAdapter,
  neortAdapter,
  verseAdapter,
  rasterAdapter,
];
