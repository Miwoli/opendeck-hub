// Usage: node scripts/check-versions.mjs [<plugin>-v<semver>]   (run from the repo root)
// Checks manifest Version == package.json version + ".0" for every plugin; with a tag, checks only that plugin
// and that the tag matches. Run before creating a release.

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fail } from './lib/plugin.mjs';
import { versionProblems } from './lib/version.mjs';

async function main() {
  const tag = process.argv[2];
  const tagPlugin = tag?.match(/^(.+)-v\d+\.\d+\.\d+$/)?.[1];
  if (tag && !tagPlugin) throw new Error(`Tag "${tag}" does not match <plugin>-v<semver>`);

  const names = tagPlugin ? [tagPlugin] : (await readdir('plugins', { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name);
  const problems = [];
  for (const name of names) {
    const dir = path.join('plugins', name);
    const pkg = JSON.parse(await readFile(path.join(dir, 'package.json'), 'utf8').catch(() => fail(`Unknown plugin "${name}"`)));
    const sd = (await readdir(dir)).find((f) => f.endsWith('.sdPlugin'));
    const manifest = JSON.parse(await readFile(path.join(dir, sd, 'manifest.json'), 'utf8'));
    problems.push(...versionProblems({ plugin: name, pkgVersion: String(pkg.version), manifestVersion: manifest.Version, tag }));
  }
  if (problems.length) throw new Error(problems.join('\n'));
  console.log(`Versions consistent for: ${names.join(', ')}`);
}

main().catch(fail);
