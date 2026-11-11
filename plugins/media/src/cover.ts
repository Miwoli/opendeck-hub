// Cover art -> data: URI for the Cover tile.
// file:// URLs (Zen, local players) are read directly. https:// URLs (Spotify: i.scdn.co) are downloaded ONLY when
// the user enabled it in the PI (network access needs consent) and cached in ~/.cache/opendeck-hub/covers.

import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { imageDataUri, sniffMime } from '@miwoli/deck-core';

const MAX_BYTES = 2 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 5000;

export { sniffMime };

export function toDataUri(buf: Uint8Array): string | null {
  return imageDataUri(buf);
}

export interface CoverOptions {
  allowRemote: boolean;
  cacheDir?: string;
  fetchImpl?: typeof fetch;
}

export function defaultCacheDir(): string {
  return path.join(process.env['XDG_CACHE_HOME'] || path.join(os.homedir(), '.cache'), 'opendeck-hub', 'covers');
}

async function readLocal(url: string): Promise<Uint8Array | null> {
  const file = fileURLToPath(url);
  const info = await stat(file);
  if (!info.isFile() || info.size > MAX_BYTES) return null;
  return readFile(file);
}

async function readRemote(url: string, opts: CoverOptions): Promise<Uint8Array | null> {
  const dir = opts.cacheDir ?? defaultCacheDir();
  const cached = path.join(dir, createHash('sha1').update(url).digest('hex'));
  const hit = await readFile(cached).catch(() => null);
  if (hit) return hit;
  const res = await (opts.fetchImpl ?? fetch)(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), redirect: 'follow' });
  if (!res.ok) return null;
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > MAX_BYTES || !sniffMime(buf)) return null;
  await mkdir(dir, { recursive: true });
  await writeFile(cached, buf);
  return buf;
}

/** Returns a data: URI or null (no art, not allowed, unreadable). Never throws. */
export async function loadCover(artUrl: string, opts: CoverOptions): Promise<string | null> {
  try {
    if (artUrl.startsWith('file://')) {
      const buf = await readLocal(artUrl);
      return buf ? toDataUri(buf) : null;
    }
    if (artUrl.startsWith('https://') && opts.allowRemote) {
      const buf = await readRemote(artUrl, opts);
      return buf ? toDataUri(buf) : null;
    }
  } catch {
    // unreadable file / network error -> gradient placeholder
  }
  return null;
}

/** Small in-memory cache so polling does not re-read the same cover every 1.5 s. */
export class CoverCache {
  private readonly entries = new Map<string, string | null>();
  private readonly limit: number;

  constructor(limit = 8) {
    this.limit = limit;
  }

  async get(artUrl: string, opts: CoverOptions): Promise<string | null> {
    const key = `${opts.allowRemote ? 'r' : 'l'}|${artUrl}`;
    if (this.entries.has(key)) return this.entries.get(key) ?? null;
    const value = await loadCover(artUrl, opts);
    this.entries.set(key, value);
    if (this.entries.size > this.limit) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    return value;
  }
}
