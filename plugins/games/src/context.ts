// Shared state of the games plugin: the merged Steam+Lutris list (re-read at most every REFRESH_MS while a recent
// tile is visible) and cover data URIs cached per file + mtime.

import { readFile, stat } from 'node:fs/promises';
import { type OpenActionClient, type Logger, imageDataUri, launchDetached } from '@miwoli/deck-core';
import { DEFAULT_LUTRIS_EXCLUDE, type Game, type LibraryPaths, type Source, defaultPaths, recentGames } from './library.ts';

const REFRESH_MS = 30_000;
const MAX_COVER_BYTES = 2 * 1024 * 1024;

export interface GamesContext {
  client: OpenActionClient;
  log: Logger;
  games(force?: boolean): Promise<Game[]>;
  cover(file: string | null): Promise<string | null>;
  launch(source: Source, args: string[]): Promise<void>;
  setExclude(slugs: string[]): void;
}

export function binaryFor(source: Source, env: NodeJS.ProcessEnv = process.env): string {
  return source === 'steam' ? env['OPENDECK_STEAM_BIN'] || 'steam' : env['OPENDECK_LUTRIS_BIN'] || 'lutris';
}

export function createContext(client: OpenActionClient, log: Logger, paths: LibraryPaths = defaultPaths()): GamesContext {
  let cache: { at: number; games: Game[] } | null = null;
  let exclude = DEFAULT_LUTRIS_EXCLUDE;
  const covers = new Map<string, { mtime: number; uri: string | null }>();

  return {
    client,
    log,
    async games(force = false) {
      if (!force && cache && Date.now() - cache.at < REFRESH_MS) return cache.games;
      const games = await recentGames(paths, exclude);
      cache = { at: Date.now(), games };
      return games;
    },
    async cover(file) {
      if (!file) return null;
      try {
        const info = await stat(file);
        const hit = covers.get(file);
        if (hit && hit.mtime === info.mtimeMs) return hit.uri;
        const uri = info.size <= MAX_COVER_BYTES ? imageDataUri(await readFile(file)) : null;
        covers.set(file, { mtime: info.mtimeMs, uri });
        return uri;
      } catch {
        return null;
      }
    },
    async launch(source, args) {
      const bin = binaryFor(source);
      log.info(`launch: ${bin} ${args.join(' ')}`);
      await launchDetached(bin, args);
    },
    setExclude(slugs) {
      exclude = slugs;
      cache = null;
    },
  };
}
