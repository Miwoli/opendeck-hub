// XDG user dirs (~/.config/user-dirs.dirs), e.g. XDG_PICTURES_DIR="$HOME/Pictures". Parsed directly instead of
// spawning xdg-user-dir.

import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function parseUserDirs(text: string, home: string): Record<string, string> {
  const dirs: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const m = /^\s*(XDG_[A-Z]+_DIR)="(.*)"\s*$/.exec(line);
    if (m?.[1] && m[2] !== undefined) dirs[m[1]] = m[2].replace(/^\$HOME/, home);
  }
  return dirs;
}

export function picturesDir(env: NodeJS.ProcessEnv = process.env): string {
  const home = os.homedir();
  const config = env['XDG_CONFIG_HOME'] || path.join(home, '.config');
  try {
    const dirs = parseUserDirs(readFileSync(path.join(config, 'user-dirs.dirs'), 'utf8'), home);
    if (dirs['XDG_PICTURES_DIR']) return dirs['XDG_PICTURES_DIR'];
  } catch {
    // no user-dirs.dirs
  }
  return path.join(home, 'Pictures');
}
