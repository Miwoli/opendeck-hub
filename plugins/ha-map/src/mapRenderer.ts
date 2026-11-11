// Composes a map spread over the whole deck. For every key (column,
// row) a separate 72x72 SVG image is built containing: OSM tile fragments
// (embedded without decoding, as data: URIs), GPS accuracy circles,
// a home marker and person markers. This way the plugin needs
// no image processing library at runtime.

import { createHash } from 'node:crypto';
import { KEY_SIZE, FONT_FAMILY } from './constants.js';
import { fitView, metersPerPixel, project, TILE_SIZE, type LatLon, type MapView, type Region } from './geo.js';
import { SVG_OPEN } from './render.js';
import type { Tile, TileCache } from './tiles.js';
import { escapeXml } from './util.js';

export interface MapMarker {
  entityId: string;
  initial: string;
  color: string;
  position: LatLon;
  accuracyM: number | null;
}

export interface MapInput {
  markers: readonly MapMarker[];
  home: LatLon | null;
  columns: number;
  rows: number;
  tiles: TileCache;
  minZoom: number;
  maxZoom: number;
  /** Attribution text (e.g. "© OpenStreetMap"); empty = no attribution. */
  attribution: string;
  /** Key without a map tile (back to the main profile) - markers must not hide under it. */
  reservedKey: { column: number; row: number } | null;
}

export interface RenderedKey {
  image: string;
  hash: string;
}

export interface RenderedMap {
  view: MapView;
  keys: Map<string, RenderedKey>;
}

export function keyId(column: number, row: number): string {
  return `${column},${row}`;
}

export function hashOf(value: string): string {
  return createHash('sha1').update(value).digest('hex');
}

const MARKER_RADIUS = 10;
const MIN_MARKER_GAP = 14;
const VIEW_PADDING = 26;
const SNAP_PX = 12;

interface PlacedMarker {
  marker: MapMarker;
  /** True position (world pixels) - centre of the accuracy circle. */
  x: number;
  y: number;
  /** Marker drawing position (after spreading apart overlapping markers). */
  drawX: number;
  drawY: number;
  accuracyPx: number;
}

function placeMarkers(markers: readonly MapMarker[], zoom: number): PlacedMarker[] {
  const placed: PlacedMarker[] = [];
  for (const marker of markers) {
    const p = project(marker.position, zoom);
    const x = Math.round(p.x);
    const y = Math.round(p.y);
    const mpp = metersPerPixel(marker.position.lat, zoom);
    const accuracyPx = marker.accuracyM !== null && mpp > 0 ? Math.round(marker.accuracyM / mpp) : 0;

    // Overlapping markers (e.g. two people at home) are spread apart horizontally.
    let drawX = x;
    for (let attempt = 0; attempt < 8; attempt++) {
      const clash = placed.some((o) => Math.hypot(drawX - o.drawX, y - o.drawY) < MIN_MARKER_GAP);
      if (!clash) break;
      drawX += MIN_MARKER_GAP;
    }
    placed.push({ marker, x, y, drawX, drawY: y, accuracyPx });
  }
  return placed;
}

interface ChosenView {
  view: MapView;
  placed: PlacedMarker[];
}

function hiddenUnderReservedKey(
  placed: readonly PlacedMarker[],
  view: MapView,
  reserved: { column: number; row: number },
): boolean {
  const rx = reserved.column * KEY_SIZE;
  const ry = reserved.row * KEY_SIZE;
  const r = MARKER_RADIUS + 3;
  return placed.some((m) => {
    const lx = m.drawX - view.originX;
    const ly = m.drawY - view.originY;
    return lx + r > rx && lx - r < rx + KEY_SIZE && ly + r > ry && ly - r < ry + KEY_SIZE;
  });
}

/**
 * Chooses the map view. The whole deck first; if a marker would hide
 * under the back key (bottom-right corner), the map is fitted to the strip above
 * it or to the block beside it - whichever gives the larger zoom.
 */
function chooseView(input: MapInput, width: number, height: number): ChosenView | null {
  const positions = input.markers.map((m) => m.position);
  const base = { width, height, padding: VIEW_PADDING, minZoom: input.minZoom, maxZoom: input.maxZoom, snapPx: SNAP_PX };
  const make = (region: Region): ChosenView | null => {
    const view = fitView(positions, { ...base, region });
    return view ? { view, placed: placeMarkers(input.markers, view.zoom) } : null;
  };

  const full = make({ x: 0, y: 0, width, height });
  const reserved = input.reservedKey;
  if (!full || !reserved || !hiddenUnderReservedKey(full.placed, full.view, reserved)) return full;

  const rx = reserved.column * KEY_SIZE;
  const ry = reserved.row * KEY_SIZE;
  const candidates = [
    make({ x: 0, y: 0, width, height: ry }), // strip above the key
    make({ x: 0, y: 0, width: rx, height }), // block to the left of the key
  ].filter((c): c is ChosenView => c !== null);
  candidates.sort((a, b) => b.view.zoom - a.view.zoom);
  return candidates.find((c) => !hiddenUnderReservedKey(c.placed, c.view, reserved)) ?? full;
}

function renderKeySvg(args: {
  column: number;
  row: number;
  view: MapView;
  tiles: Map<string, Tile | null>;
  placed: readonly PlacedMarker[];
  home: WorldXY | null;
  attribution: string;
  attributionKey: { column: number; row: number };
}): string {
  const { column, row, view } = args;
  const x0 = view.originX + column * KEY_SIZE;
  const y0 = view.originY + row * KEY_SIZE;

  const parts: string[] = [`${SVG_OPEN}`, '<rect width="72" height="72" fill="#2a2c30" />'];

  const tx0 = Math.floor(x0 / TILE_SIZE);
  const tx1 = Math.floor((x0 + KEY_SIZE - 1) / TILE_SIZE);
  const ty0 = Math.floor(y0 / TILE_SIZE);
  const ty1 = Math.floor((y0 + KEY_SIZE - 1) / TILE_SIZE);
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      const tile = args.tiles.get(`${tx},${ty}`);
      if (!tile) continue;
      parts.push(
        `<image x="${tx * TILE_SIZE - x0}" y="${ty * TILE_SIZE - y0}" width="${TILE_SIZE}" height="${TILE_SIZE}" xlink:href="data:${tile.mime};base64,${tile.b64}" />`,
      );
    }
  }

  const visible = (x: number, y: number, margin: number): boolean =>
    x > -margin && x < KEY_SIZE + margin && y > -margin && y < KEY_SIZE + margin;

  // GPS accuracy circles (under the markers).
  for (const m of args.placed) {
    const lx = m.x - x0;
    const ly = m.y - y0;
    if (m.accuracyPx >= MARKER_RADIUS + 2 && m.accuracyPx <= 400 && visible(lx, ly, m.accuracyPx)) {
      parts.push(
        `<circle cx="${lx}" cy="${ly}" r="${m.accuracyPx}" fill="${m.marker.color}" fill-opacity="0.16" stroke="${m.marker.color}" stroke-opacity="0.55" stroke-width="1" />`,
      );
    }
  }

  // Home marker.
  if (args.home) {
    const hx = args.home.x - x0;
    const hy = args.home.y - y0;
    if (visible(hx, hy, 10)) {
      parts.push(
        `<path transform="translate(${hx} ${hy})" d="M-7 0 L0 -7 L7 0 L5 0 L5 6 L-5 6 L-5 0 Z" fill="#ffffff" stroke="#333333" stroke-width="1.2" stroke-linejoin="round" />`,
      );
    }
  }

  // Person markers.
  for (const m of args.placed) {
    const lx = m.drawX - x0;
    const ly = m.drawY - y0;
    if (!visible(lx, ly, MARKER_RADIUS + 3)) continue;
    parts.push(
      `<g transform="translate(${lx} ${ly})">` +
        `<circle cx="0" cy="1" r="${MARKER_RADIUS + 0.5}" fill="#000000" fill-opacity="0.3" />` +
        `<circle r="${MARKER_RADIUS}" fill="${m.marker.color}" stroke="#ffffff" stroke-width="2" />` +
        `<text y="4.3" text-anchor="middle" font-family="${FONT_FAMILY}" font-size="12" font-weight="700" fill="#ffffff">${escapeXml(m.marker.initial)}</text>` +
        '</g>',
    );
  }

  // OSM attribution - on the key in the bottom-right corner of the map (next to the back key).
  if (args.attribution && column === args.attributionKey.column && row === args.attributionKey.row) {
    parts.push(
      `<text x="71" y="70" text-anchor="end" font-family="${FONT_FAMILY}" font-size="6" fill="#222222" stroke="#ffffff" stroke-width="1.6" stroke-opacity="0.85" paint-order="stroke">${escapeXml(args.attribution)}</text>`,
    );
  }

  parts.push('</svg>');
  return parts.join('\n');
}

interface WorldXY {
  x: number;
  y: number;
}

/** Returns null when there is nothing to draw (no people with coordinates). */
export async function renderMap(input: MapInput): Promise<RenderedMap | null> {
  if (input.markers.length === 0) return null;

  const width = input.columns * KEY_SIZE;
  const height = input.rows * KEY_SIZE;
  const chosen = chooseView(input, width, height);
  if (!chosen) return null;
  const { view, placed } = chosen;

  // Tiles needed to cover the whole view.
  const tx0 = Math.floor(view.originX / TILE_SIZE);
  const tx1 = Math.floor((view.originX + width - 1) / TILE_SIZE);
  const ty0 = Math.floor(view.originY / TILE_SIZE);
  const ty1 = Math.floor((view.originY + height - 1) / TILE_SIZE);
  const tiles = new Map<string, Tile | null>();
  const jobs: Array<Promise<void>> = [];
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      jobs.push(
        input.tiles.get(view.zoom, tx, ty).then((tile) => {
          tiles.set(`${tx},${ty}`, tile);
        }),
      );
    }
  }
  await Promise.all(jobs);

  const homeWorld = input.home ? project(input.home, view.zoom) : null;
  const home = homeWorld ? { x: Math.round(homeWorld.x), y: Math.round(homeWorld.y) } : null;
  const attributionKey = { column: Math.max(0, input.columns - 2), row: input.rows - 1 };

  const keys = new Map<string, RenderedKey>();
  for (let row = 0; row < input.rows; row++) {
    for (let column = 0; column < input.columns; column++) {
      const svg = renderKeySvg({
        column,
        row,
        view,
        tiles,
        placed,
        home,
        attribution: input.attribution,
        attributionKey,
      });
      keys.set(keyId(column, row), {
        image: `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`,
        hash: hashOf(svg),
      });
    }
  }
  return { view, keys };
}
