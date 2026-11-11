// Map geometry: Web Mercator projection (256 px OSM tiles), distance
// on the globe and fitting the map view to a set of points.

import { clamp } from './util.js';

export const TILE_SIZE = 256;
const MAX_LATITUDE = 85.0511;
const EARTH_RADIUS_M = 6_371_008.8;

export interface LatLon {
  lat: number;
  lon: number;
}

export interface WorldPoint {
  x: number;
  y: number;
}

/** Pixel coordinates in the "world" at a given zoom (0,0 = top-left corner of the world map). */
export function project(point: LatLon, zoom: number): WorldPoint {
  const scale = TILE_SIZE * 2 ** zoom;
  const sin = Math.sin((clamp(point.lat, -MAX_LATITUDE, MAX_LATITUDE) * Math.PI) / 180);
  return {
    x: ((point.lon + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  };
}

export function metersPerPixel(lat: number, zoom: number): number {
  return (156_543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
}

export function haversineMeters(a: LatLon, b: LatLon): number {
  const toRad = (deg: number): number => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.max(10, Math.round(meters / 10) * 10)} m`;
  if (meters < 10_000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters / 1000)} km`;
}

export interface MapView {
  zoom: number;
  /** Top-left corner of the view in world pixels (integer). */
  originX: number;
  originY: number;
  width: number;
  height: number;
}

export interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FitOptions {
  /** Size of the whole view (pixels). */
  width: number;
  height: number;
  /** Points are fitted into this view rectangle (with `padding` inside) and its centre becomes the centre of the points. */
  region: Region;
  padding: number;
  minZoom: number;
  maxZoom: number;
  /** The view centre is rounded to this grid so small GPS movements do not shift the whole map. */
  snapPx: number;
}

const CLOSE_POINTS_ZOOM = 15;
const CLOSE_POINTS_PX = 40;

export function fitView(points: readonly LatLon[], options: FitOptions): MapView | null {
  if (points.length === 0) return null;

  const bounds = (zoom: number): { minX: number; maxX: number; minY: number; maxY: number } => {
    const projected = points.map((p) => project(p, zoom));
    return {
      minX: Math.min(...projected.map((p) => p.x)),
      maxX: Math.max(...projected.map((p) => p.x)),
      minY: Math.min(...projected.map((p) => p.y)),
      maxY: Math.max(...projected.map((p) => p.y)),
    };
  };

  const availW = options.region.width - 2 * options.padding;
  const availH = options.region.height - 2 * options.padding;

  let zoom = options.minZoom;
  for (let z = options.maxZoom; z >= options.minZoom; z--) {
    const b = bounds(z);
    if (b.maxX - b.minX <= availW && b.maxY - b.minY <= availH) {
      zoom = z;
      break;
    }
  }

  let b = bounds(zoom);
  // Points at practically the same place: do not zoom in to rooftop level.
  if (b.maxX - b.minX < CLOSE_POINTS_PX && b.maxY - b.minY < CLOSE_POINTS_PX && zoom > CLOSE_POINTS_ZOOM) {
    zoom = Math.max(options.minZoom, CLOSE_POINTS_ZOOM);
    b = bounds(zoom);
  }

  const snap = (value: number): number => Math.round(value / options.snapPx) * options.snapPx;
  const centerX = snap((b.minX + b.maxX) / 2);
  const centerY = snap((b.minY + b.maxY) / 2);

  return {
    zoom,
    originX: Math.round(centerX - (options.region.x + options.region.width / 2)),
    originY: Math.round(centerY - (options.region.y + options.region.height / 2)),
    width: options.width,
    height: options.height,
  };
}
