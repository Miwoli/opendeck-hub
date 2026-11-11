// "Map tile" action: instances are placed on all keys
// of the map profile (except the back key). Each instance learns its
// coordinates (column, row) from willAppear and draws its slice
// of the shared map. Refreshing runs only while any tile is
// visible: willDisappear (profile change) stops the timer and disconnects from Home Assistant.

import type { PluginConnection } from '../connection.js';
import { ACTION_TILE, GRID_COLUMNS, GRID_ROWS } from '../constants.js';
import type { HaClient } from '../ha/haClient.js';
import type { HaStore } from '../ha/store.js';
import { buildMarkers } from '../markers.js';
import { hashOf, keyId, renderMap, type RenderedMap } from '../mapRenderer.js';
import { logError } from '../logger.js';
import { setImage, type Coordinates } from '../protocol.js';
import { tileImage } from '@miwoli/deck-core';
import { mapMessageTile } from '../personTile.js';
import { buildBlankTileSvg, svgToDataUri } from '../render.js';
import type { GlobalSettings } from '../settings.js';
import { TileCache } from '../tiles.js';
import { createScheduler } from '../util.js';

const MIN_RENDER_GAP_MS = 2000;
const APPEAR_DELAY_MS = 150;
const OSM_ATTRIBUTION = '© OpenStreetMap';

export class TileAction {
  private readonly contexts = new Map<string, Coordinates>();
  private readonly lastHash = new Map<string, string>();
  private readonly scheduler = createScheduler(() => void this.render());
  private timer: ReturnType<typeof setInterval> | null = null;
  private timerSeconds = 0;
  private rendering = false;
  private dirty = false;
  private lastRenderAt = 0;
  private tiles: TileCache;
  private tilesKey: string;

  constructor(
    private readonly connection: PluginConnection,
    private readonly store: HaStore,
    private readonly ha: HaClient,
    private readonly getGlobalSettings: () => GlobalSettings,
  ) {
    const g = getGlobalSettings();
    this.tilesKey = `${g.tileUrl}\n${g.userAgent}`;
    this.tiles = new TileCache(g.tileUrl, g.userAgent);
    store.on('change', () => this.scheduleAfterChange());
    ha.on('status', () => this.scheduleAfterChange());
  }

  matches(actionUuid: string): boolean {
    return actionUuid === ACTION_TILE;
  }

  get size(): number {
    return this.contexts.size;
  }

  handleWillAppear(context: string, coordinates: Coordinates): void {
    this.contexts.set(context, coordinates);
    this.lastHash.delete(context);
    this.ensureTimer();
    this.scheduler.schedule(APPEAR_DELAY_MS);
  }

  handleWillDisappear(context: string): void {
    this.contexts.delete(context);
    this.lastHash.delete(context);
    if (this.contexts.size === 0) {
      this.stopTimer();
      this.scheduler.cancel();
    }
  }

  /** Any tile: forced refresh (new snapshot from Home Assistant + redraw of everything). */
  handleKeyUp(): void {
    this.lastHash.clear();
    this.ha.requestSync();
    this.scheduler.schedule(0);
  }

  handleGlobalSettingsChanged(): void {
    const g = this.getGlobalSettings();
    const key = `${g.tileUrl}\n${g.userAgent}`;
    if (key !== this.tilesKey) {
      this.tilesKey = key;
      this.tiles = new TileCache(g.tileUrl, g.userAgent);
    }
    this.lastHash.clear();
    if (this.contexts.size > 0) {
      this.ensureTimer(true);
      this.scheduler.schedule(0);
    }
  }

  dispose(): void {
    this.stopTimer();
    this.scheduler.cancel();
  }

  private scheduleAfterChange(): void {
    if (this.contexts.size === 0) return;
    const wait = Math.max(0, this.lastRenderAt + MIN_RENDER_GAP_MS - Date.now());
    this.scheduler.schedule(wait);
  }

  private ensureTimer(forceRestart = false): void {
    const seconds = this.getGlobalSettings().refreshSeconds;
    if (this.timer && !forceRestart && seconds === this.timerSeconds) return;
    this.stopTimer();
    this.timerSeconds = seconds;
    this.timer = setInterval(() => {
      if (this.contexts.size === 0) return;
      // A resync catches any missed events; the redraw also retries
      // tiles that failed to download earlier.
      this.ha.requestSync();
      this.scheduler.schedule(0);
    }, seconds * 1000);
  }

  private stopTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.timerSeconds = 0;
  }

  private async render(): Promise<void> {
    if (this.contexts.size === 0) return;
    if (this.rendering) {
      this.dirty = true;
      return;
    }
    this.rendering = true;
    this.lastRenderAt = Date.now();
    try {
      const g = this.getGlobalSettings();
      const markers = buildMarkers(this.store);
      const rendered: RenderedMap | null =
        markers.length > 0
          ? await renderMap({
              markers,
              home: this.store.home(),
              columns: GRID_COLUMNS,
              rows: GRID_ROWS,
              tiles: this.tiles,
              minZoom: 4,
              maxZoom: g.maxZoom,
              attribution: g.tileUrl.includes('openstreetmap.org') ? OSM_ATTRIBUTION : '',
              // The bottom-right key is the way back to the main profile (a Starter Pack action).
              reservedKey: { column: GRID_COLUMNS - 1, row: GRID_ROWS - 1 },
            })
          : null;

      // Tiles may have disappeared from the screen while downloading.
      for (const [context, coordinates] of this.contexts) {
        const key = rendered?.keys.get(keyId(coordinates.column, coordinates.row));
        const image = key ? key.image : this.placeholder(coordinates);
        const hash = key ? key.hash : hashOf(image);
        if (this.lastHash.get(context) === hash) continue;
        this.lastHash.set(context, hash);
        this.connection.send(setImage(context, image));
      }
    } catch (err) {
      logError('Map render failed:', err instanceof Error ? err.message : String(err));
    } finally {
      this.rendering = false;
      if (this.dirty) {
        this.dirty = false;
        this.scheduler.schedule(500);
      }
    }
  }

  /** No data for the map: a message on the middle tile, the rest stay empty. */
  private placeholder(coordinates: Coordinates): string {
    const isCenter = coordinates.column === Math.floor(GRID_COLUMNS / 2) && coordinates.row === Math.floor(GRID_ROWS / 2);
    if (!isCenter) return svgToDataUri(buildBlankTileSvg());
    return tileImage(mapMessageTile(this.ha.status));
  }
}
