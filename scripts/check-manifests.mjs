// Usage: node scripts/check-manifests.mjs   (run from the repo root)
// Checks every plugins/<plugin>/<uuid>.sdPlugin/manifest.json against the CLAUDE.md "Hard rules". Reports all problems
// and exits 1 if there are any. Version consistency is checked by check-versions.mjs.

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fail } from './lib/plugin.mjs';
import { manifestProblems } from './lib/manifest.mjs';

const SUFFIX = '.sdPlugin';

async function main() {
  const plugins = (await readdir('plugins', { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name);
  const problems = [];
  for (const plugin of plugins) {
    const dir = path.join('plugins', plugin);
    const sdDirs = (await readdir(dir, { withFileTypes: true })).filter((e) => e.isDirectory() && e.name.endsWith(SUFFIX)).map((e) => e.name);
    if (sdDirs.length !== 1) {
      problems.push(`${dir}: expected exactly one *${SUFFIX} directory, found ${sdDirs.length}`);
      continue;
    }
    const file = path.join(dir, sdDirs[0], 'manifest.json');
    let manifest;
    try {
      manifest = JSON.parse(await readFile(file, 'utf8'));
    } catch (err) {
      problems.push(`${file}: cannot read or parse manifest (${err.message})`);
      continue;
    }
    const uuid = sdDirs[0].slice(0, -SUFFIX.length);
    problems.push(...manifestProblems({ plugin, uuid, manifest }).map((p) => `${file}: ${p}`));
  }
  if (problems.length) throw new Error(`Manifest problems (${problems.length}):\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  console.log(`Manifests valid for ${plugins.length} plugins`);
}

main().catch(fail);
