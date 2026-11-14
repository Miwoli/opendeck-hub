// Generates plugins/<name>/ from scripts/templates/plugin and registers it in the release configuration.
// Usage (repo root): npm run new-plugin -- <name>
// Never overwrites: every check runs before the first file is written.

import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const TEMPLATE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'templates', 'plugin');
const exists = (p) => stat(p).then(() => true, () => false);

export function nameProblem(name) {
  if (typeof name !== 'string' || !NAME_RE.test(name)) return 'name must be lowercase letters, digits and single hyphens ([a-z0-9-], no leading or trailing hyphen)';
  return null;
}

// "scaffold-test" -> "Scaffold Test"
export const titleOf = (name) => name.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

async function renderDir(src, dest, vars) {
  await mkdir(dest, { recursive: true });
  for (const entry of await readdir(src, { withFileTypes: true })) {
    const target = path.join(dest, vars(entry.name));
    if (entry.isDirectory()) await renderDir(path.join(src, entry.name), target, vars);
    else await writeFile(target, vars(await readFile(path.join(src, entry.name), 'utf8')));
  }
}

export async function scaffold(root, name) {
  const problem = nameProblem(name);
  if (problem) throw new Error(problem);
  const dir = path.join(root, 'plugins', name);
  if (await exists(dir)) throw new Error(`plugins/${name} already exists; nothing was changed`);

  const configPath = path.join(root, 'release-please-config.json');
  const manifestPath = path.join(root, '.release-please-manifest.json');
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  const versions = JSON.parse(await readFile(manifestPath, 'utf8'));
  const key = `plugins/${name}`;
  if (key in config.packages || key in versions) throw new Error(`${key} is already in the release configuration; nothing was changed`);

  const title = titleOf(name);
  await renderDir(TEMPLATE, dir, (s) => s.replaceAll('__NAME__', name).replaceAll('__TITLE__', title));

  const sorted = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
  config.packages[key] = {
    component: name,
    'extra-files': [{ type: 'json', path: `com.miwoli.${name}.sdPlugin/manifest.json`, jsonpath: '$.Version' }],
  };
  versions[key] = '0.1.0';
  config.packages = sorted(config.packages);
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
  await writeFile(manifestPath, `${JSON.stringify(sorted(versions), null, 2)}\n`);
  return dir;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const name = process.argv[2];
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  scaffold(root, name).then(() => {
    console.log(`Created plugins/${name}. Next:
  npm install                                  # registers the new workspace (commit the package-lock.json change)
  npm test -w plugins/${name}
  npm run check-manifests && npm run check-versions
Then add the plugin to the root README table (see CONTRIBUTING.md, "Adding a plugin").`);
  }, (err) => {
    console.error(`new-plugin: ${err.message}\nUsage: npm run new-plugin -- <name>`);
    process.exit(1);
  });
}
