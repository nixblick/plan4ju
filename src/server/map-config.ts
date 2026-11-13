import { DEFAULT_TILE_ATTRIBUTION, DEFAULT_TILE_URL, tileOrigin } from "../lib/map";

export interface MapConfig {
  tileUrl: string;
  attribution: string;
  /** Origin allowed in the CSP img-src; null when the configured template is unusable (map shows no tiles). */
  tileOrigin: string | null;
}

/**
 * Tile server from the runtime environment (docs/karte.md). Default: OpenStreetMap standard tiles.
 * MAP_TILE_URL must be an https template; the attribution is plain text or simple links set by the operator.
 */
export function mapConfig(): MapConfig {
  const tileUrl = process.env.MAP_TILE_URL?.trim() || DEFAULT_TILE_URL;
  const origin = tileOrigin(tileUrl);
  return {
    tileUrl: origin ? tileUrl : "",
    attribution: process.env.MAP_TILE_ATTRIBUTION?.trim() || DEFAULT_TILE_ATTRIBUTION,
    tileOrigin: origin,
  };
}
