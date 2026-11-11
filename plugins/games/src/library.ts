// Local game libraries (no network). Layout verified on a real system:
// Steam: ~/.local/share/Steam; libraries in steamapps/libraryfolders.vdf, installed games in
//   <library>/steamapps/appmanifest_<appid>.acf, last played in userdata/<id>/config/localconfig.vdf
//   (UserLocalConfigStore > Software > Valve > Steam > apps > <appid> > LastPlayed), covers in
//   appcache/librarycache/<appid>/[<hash>/]library_600x900.jpg (portrait), library_capsule.jpg or header.jpg.
// Lutris: ~/.local/share/lutris/pga.db (SQLite, table games), covers coverart/<slug>.jpg.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import os from 'node:os';
import nodePath from 'node:path';
import { child, obj, parseVdf, path, str } from './vdf.ts';

export type Source = 'steam' | 'lutris';

export interface Game {
  source: Source;
  /** Steam appid or Lutris numeric id */
  id: string;
  name: string;
  /** unix seconds, 0 = never */
  lastPlayed: number;
  cover: string | null;
}

export interface LibraryPaths {
  steamRoot: string;
  lutrisDir: string;
}

export function defaultPaths(env: NodeJS.ProcessEnv = process.env): LibraryPaths {
  const home = os.homedir();
  const data = env['XDG_DATA_HOME'] || nodePath.join(home, '.local', 'share');
  return {
    steamRoot: env['OPENDECK_STEAM_ROOT'] || nodePath.join(data, 'Steam'),
    lutrisDir: env['OPENDECK_LUTRIS_DIR'] || nodePath.join(data, 'lutris'),
  };
}

function readText(file: string): string | null {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

function isFile(file: string): boolean {
  try {
    return statSync(file).isFile();
  } catch {
    return false;
  }
}

// Steam ships runtimes/compat tools as "apps"; they show up in LastPlayed but are not games
const STEAM_TOOLS = /^(proton\b|steam linux runtime|steamworks common redistributables|steamvr)/i;

export function steamLibraries(steamRoot: string): string[] {
  const libs = new Set<string>([steamRoot]);
  const text = readText(nodePath.join(steamRoot, 'steamapps', 'libraryfolders.vdf'));
  const folders = obj(text ? child(parseVdf(text), 'libraryfolders') : undefined);
  for (const entry of Object.values(folders ?? {})) {
    const p = str(entry, 'path');
    if (p) libs.add(p);
  }
  return [...libs];
}

export function steamInstalled(steamRoot: string): Map<string, string> {
  const games = new Map<string, string>();
  for (const lib of steamLibraries(steamRoot)) {
    const dir = nodePath.join(lib, 'steamapps');
    let files: string[];
    try {
      files = readdirSync(dir).filter((f) => /^appmanifest_\d+\.acf$/.test(f));
    } catch {
      continue; // unmounted drive
    }
    for (const f of files) {
      const text = readText(nodePath.join(dir, f));
      const state = text ? child(parseVdf(text), 'AppState') : undefined;
      const appid = str(state, 'appid');
      const name = str(state, 'name');
      if (appid && name && !STEAM_TOOLS.test(name)) games.set(appid, name);
    }
  }
  return games;
}

export function steamLastPlayed(steamRoot: string): Map<string, number> {
  const result = new Map<string, number>();
  let users: string[];
  try {
    users = readdirSync(nodePath.join(steamRoot, 'userdata'));
  } catch {
    return result;
  }
  for (const user of users) {
    const text = readText(nodePath.join(steamRoot, 'userdata', user, 'config', 'localconfig.vdf'));
    if (!text) continue;
    const apps = obj(path(parseVdf(text), 'UserLocalConfigStore', 'Software', 'Valve', 'Steam', 'apps'));
    for (const [appid, app] of Object.entries(apps ?? {})) {
      const ts = Number(str(app, 'LastPlayed') ?? 0);
      if (Number.isFinite(ts) && ts > (result.get(appid) ?? 0)) result.set(appid, ts);
    }
  }
  return result;
}

// Newer Steam clients keep each image in a hash-named subfolder (<appid>/<sha1>/library_600x900.jpg), older ones
// directly in <appid>/ - both occur in the wild.
const STEAM_COVER_NAMES = ['library_600x900.jpg', 'library_capsule.jpg', 'header.jpg', 'library_header.jpg'];

export function steamCover(steamRoot: string, appid: string): string | null {
  const dir = nodePath.join(steamRoot, 'appcache', 'librarycache', appid);
  let subdirs: string[] = [];
  try {
    subdirs = readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => nodePath.join(dir, d.name));
  } catch {
    return null;
  }
  for (const name of STEAM_COVER_NAMES) {
    for (const base of [dir, ...subdirs]) {
      const p = nodePath.join(base, name);
      if (isFile(p)) return p;
    }
  }
  return null;
}

/**
 * Games hidden in the Steam library. Newer clients keep collections in
 * userdata/<id>/config/cloudstorage/cloud-storage-namespace-1.json as [key, entry] pairs; the hidden collection is
 * key "user-collections.hidden" whose `value` is JSON {id, name, added: number[], removed: number[]}
 * (verified on a real install). Pending local edits live in the matching *.modified.json.
 */
export function steamHidden(steamRoot: string): Set<string> {
  const hidden = new Set<string>();
  let users: string[];
  try {
    users = readdirSync(nodePath.join(steamRoot, 'userdata'));
  } catch {
    return hidden;
  }
  for (const user of users) {
    for (const file of ['cloud-storage-namespace-1.json', 'cloud-storage-namespace-1.modified.json']) {
      const text = readText(nodePath.join(steamRoot, 'userdata', user, 'config', 'cloudstorage', file));
      if (!text) continue;
      let entries: unknown;
      try {
        entries = JSON.parse(text);
      } catch {
        continue;
      }
      if (!Array.isArray(entries)) continue;
      for (const e of entries) {
        if (!Array.isArray(e) || e[0] !== 'user-collections.hidden') continue;
        const entry: unknown = e[1];
        if (typeof entry !== 'object' || entry === null || ('is_deleted' in entry && entry.is_deleted === true)) continue;
        const raw = 'value' in entry && typeof entry.value === 'string' ? entry.value : '';
        let value: unknown;
        try {
          value = JSON.parse(raw);
        } catch {
          continue;
        }
        if (typeof value !== 'object' || value === null) continue;
        const ids = (k: string): string[] => {
          const list: unknown = (value as Record<string, unknown>)[k];
          return Array.isArray(list) ? list.filter((x) => typeof x === 'number' || typeof x === 'string').map(String) : [];
        };
        for (const id of ids('added')) hidden.add(id);
        for (const id of ids('removed')) hidden.delete(id);
      }
    }
  }
  return hidden;
}

export function steamGames(steamRoot: string): Game[] {
  const installed = steamInstalled(steamRoot);
  const last = steamLastPlayed(steamRoot);
  const hidden = steamHidden(steamRoot);
  return [...installed].filter(([id]) => !hidden.has(id)).map(([id, name]) => ({ source: 'steam', id, name, lastPlayed: last.get(id) ?? 0, cover: steamCover(steamRoot, id) }));
}

/** Launchers installed as Lutris "games"; also every game that is a parent_slug of another game is excluded. */
export const DEFAULT_LUTRIS_EXCLUDE = ['ubisoft-connect', 'epic-games-store', 'ea-app', 'battlenet', 'gog-galaxy', 'amazon-games', 'rockstar-games-launcher'];

export interface LutrisRow {
  id: number;
  name: string;
  slug: string;
  installer_slug: string | null;
  parent_slug: string | null;
  runner: string | null;
  lastplayed: number | null;
}

export function lutrisCover(lutrisDir: string, row: Pick<LutrisRow, 'slug' | 'installer_slug'>): string | null {
  const candidates: string[] = [row.slug];
  // covers are sometimes stored under a shorter slug ("the-witcher-3-wild-hunt-remastered" -> "the-witcher-3-wild-hunt")
  const parts = row.slug.split('-');
  for (let k = parts.length - 1; k >= 2; k--) candidates.push(parts.slice(0, k).join('-'));
  if (row.installer_slug) candidates.push(row.installer_slug);
  for (const dir of ['coverart', 'banners']) {
    for (const c of candidates) {
      for (const ext of ['jpg', 'png']) {
        const p = nodePath.join(lutrisDir, dir, `${c}.${ext}`);
        if (isFile(p)) return p;
      }
    }
  }
  return null;
}

export function lutrisFromRows(lutrisDir: string, rows: readonly LutrisRow[], exclude: readonly string[]): Game[] {
  const parents = new Set(rows.map((r) => r.parent_slug).filter((s): s is string => Boolean(s)));
  const skip = new Set([...exclude, ...parents]);
  return rows
    .filter((r) => r.runner !== 'steam' && !skip.has(r.slug))
    .map((r) => ({ source: 'lutris', id: String(r.id), name: r.name, lastPlayed: r.lastplayed ?? 0, cover: lutrisCover(lutrisDir, r) }));
}

/** Reads pga.db read-only with the built-in node:sqlite (Node >= 22.5; OpenDeck runs the user's Node 24). */
export async function lutrisRows(lutrisDir: string): Promise<LutrisRow[]> {
  const db = nodePath.join(lutrisDir, 'pga.db');
  if (!isFile(db)) return [];
  const { DatabaseSync } = await import('node:sqlite');
  const conn = new DatabaseSync(db, { readOnly: true });
  try {
    const rows = conn.prepare('SELECT id, name, slug, installer_slug, parent_slug, runner, lastplayed FROM games WHERE installed = 1').all();
    const out: LutrisRow[] = [];
    for (const r of rows) {
      if (typeof r['id'] !== 'number' || typeof r['name'] !== 'string' || typeof r['slug'] !== 'string') continue;
      const text = (k: string): string | null => (typeof r[k] === 'string' ? (r[k] as string) : null);
      out.push({
        id: r['id'],
        name: r['name'],
        slug: r['slug'],
        installer_slug: text('installer_slug'),
        parent_slug: text('parent_slug'),
        runner: text('runner'),
        lastplayed: typeof r['lastplayed'] === 'number' ? r['lastplayed'] : null,
      });
    }
    return out;
  } finally {
    conn.close();
  }
}

/** Steam + Lutris, most recently played first; never-played games last (alphabetical). */
export async function recentGames(paths: LibraryPaths, exclude: readonly string[] = DEFAULT_LUTRIS_EXCLUDE): Promise<Game[]> {
  let lutris: Game[] = [];
  try {
    lutris = lutrisFromRows(paths.lutrisDir, await lutrisRows(paths.lutrisDir), exclude);
  } catch {
    // node:sqlite unavailable or database locked
  }
  return [...steamGames(paths.steamRoot), ...lutris].sort((a, b) => b.lastPlayed - a.lastPlayed || a.name.localeCompare(b.name));
}
