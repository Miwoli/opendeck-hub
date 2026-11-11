// Fetches map tiles (OpenStreetMap by default) with a cache in memory and on
// disk. Follows the OSM tile usage policy: own User-Agent, a cache
// (tiles rarely change), at most 2 parallel downloads, no
// retry loop after an error.

import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { logError } from './logger.js';

export interface Tile {
  mime: string;
  b64: string;
}

const MEMORY_LIMIT = 96;
const DISK_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const NEGATIVE_TTL_MS = 15_000;
const MAX_TILE_BYTES = 1_000_000;
const MAX_PARALLEL = 2;
const FETCH_TIMEOUT_MS = 8000;

export function defaultCacheRoot(): string {
  const base = process.env['XDG_CACHE_HOME'] ?? path.join(homedir(), '.cache');
  return path.join(base, 'opendeck-ha-map');
}

export function sniffMime(buf: Buffer): string | null {
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

function toTile(buf: Buffer): Tile | null {
  const mime = sniffMime(buf);
  return mime ? { mime, b64: buf.toString('base64') } : null;
}

export class TileCache {
  private readonly memory = new Map<string, Tile>();
  private readonly failedUntil = new Map<string, number>();
  private readonly inflight = new Map<string, Promise<Tile | null>>();
  private readonly waiters: Array<() => void> = [];
  private running = 0;
  private readonly dir: string;
  private diskWarned = false;

  constructor(
    private readonly template: string,
    private readonly userAgent: string,
    cacheRoot: string = defaultCacheRoot(),
  ) {
    // A separate subdirectory per URL template so switching tile providers
    // does not mix caches.
    this.dir = path.join(cacheRoot, createHash('sha1').update(template).digest('hex').slice(0, 12));
  }

  /** Returns the tile or null (missing/error). `x` may fall outside [0, 2^z) - it is wrapped. */
  async get(zoom: number, x: number, y: number): Promise<Tile | null> {
    const n = 2 ** zoom;
    if (y < 0 || y >= n) return null;
    const wrappedX = ((x % n) + n) % n;
    const key = `${zoom}/${wrappedX}/${y}`;

    const cached = this.memory.get(key);
    if (cached) {
      this.memory.delete(key);
      this.memory.set(key, cached);
      return cached;
    }
    if ((this.failedUntil.get(key) ?? 0) > Date.now()) return null;

    const pending = this.inflight.get(key);
    if (pending) return pending;

    const promise = this.load(key, zoom, wrappedX, y).finally(() => this.inflight.delete(key));
    this.inflight.set(key, promise);
    return promise;
  }

  private remember(key: string, tile: Tile): void {
    this.memory.set(key, tile);
    while (this.memory.size > MEMORY_LIMIT) {
      const oldest = this.memory.keys().next().value;
      if (oldest === undefined) break;
      this.memory.delete(oldest);
    }
  }

  private async load(key: string, zoom: number, x: number, y: number): Promise<Tile | null> {
    const file = path.join(this.dir, String(zoom), String(x), `${y}.img`);

    try {
      const info = await stat(file);
      if (Date.now() - info.mtimeMs < DISK_TTL_MS) {
        const tile = toTile(await readFile(file));
        if (tile) {
          this.remember(key, tile);
          return tile;
        }
      }
    } catch {
      // not in the cache - fetch from the network
    }

    try {
      const buf = await this.withSlot(() => this.download(zoom, x, y));
      const tile = toTile(buf);
      if (!tile) throw new Error('response is not a PNG/JPEG/WebP image');
      this.remember(key, tile);
      void this.writeToDisk(file, buf);
      return tile;
    } catch (err) {
      this.failedUntil.set(key, Date.now() + NEGATIVE_TTL_MS);
      logError(`Tile ${key}:`, err instanceof Error ? err.message : String(err));
      return null;
    }
  }

  private async download(zoom: number, x: number, y: number): Promise<Buffer> {
    const url = this.template.replace('{z}', String(zoom)).replace('{x}', String(x)).replace('{y}', String(y));
    const res = await fetch(url, {
      headers: { 'User-Agent': this.userAgent, Accept: 'image/png,image/*;q=0.8' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_TILE_BYTES) throw new Error('tile too large');
    return buf;
  }

  private async withSlot<T>(fn: () => Promise<T>): Promise<T> {
    while (this.running >= MAX_PARALLEL) {
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
    this.running += 1;
    try {
      return await fn();
    } finally {
      this.running -= 1;
      this.waiters.shift()?.();
    }
  }

  private async writeToDisk(file: string, buf: Buffer): Promise<void> {
    try {
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, buf);
    } catch (err) {
      if (!this.diskWarned) {
        this.diskWarned = true;
        logError('Cannot write the tile cache to disk (only the in-memory cache works):', String(err));
      }
    }
  }
}
