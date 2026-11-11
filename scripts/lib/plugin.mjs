// Helpers shared by the plugin scripts. Every script runs with cwd = plugins/<name>
// (npm -w sets it), so the plugin is discovered from the working directory.

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

export async function findPlugin(cwd = process.cwd()) {
  const entries = await readdir(cwd, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory() && e.name.endsWith('.sdPlugin')).map((e) => e.name);
  if (dirs.length !== 1) {
    throw new Error(`Expected exactly one *.sdPlugin directory in ${cwd}, found: ${dirs.join(', ') || 'none'}`);
  }
  const dirName = dirs[0];
  const pkg = JSON.parse(await readFile(path.join(cwd, 'package.json'), 'utf8'));
  return {
    root: cwd,
    dirName,
    dir: path.join(cwd, dirName),
    bundle: path.join(cwd, dirName, 'bin', 'plugin.cjs'),
    version: String(pkg.version),
  };
}

export function fail(err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
