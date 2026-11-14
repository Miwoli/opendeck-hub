// Helpers for installing into a local OpenDeck: finding its plugin directory, listing this repo's
// plugins and moving an old copy to the backup folder. Used by install-plugin.mjs and uninstall-plugin.mjs.

import { cp, mkdir, readdir, readFile, rename, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { findPlugin } from './plugin.mjs';

export const exists = async (p) => Boolean(await stat(p).catch(() => null));

// OPENDECK_PLUGINS_DIR replaces detection; otherwise native and every Flatpak app dir that exists.
export async function pluginTargets({ home = os.homedir(), override = process.env.OPENDECK_PLUGINS_DIR } = {}) {
  if (override) {
    const dir = path.resolve(override);
    if (!(await exists(dir))) throw new Error(`OPENDECK_PLUGINS_DIR does not exist: ${dir}`);
    return [dir];
  }
  const checked = [path.join(home, '.config', 'opendeck', 'plugins')];
  // Flatpak app id is not verified, so match any app dir containing "opendeck"
  const flatpakRoot = path.join(home, '.var', 'app');
  for (const app of await readdir(flatpakRoot).catch(() => [])) {
    if (app.toLowerCase().includes('opendeck')) checked.push(path.join(flatpakRoot, app, 'config', 'opendeck', 'plugins'));
  }
  const found = [];
  for (const t of checked) if (await exists(t)) found.push(t);
  if (found.length === 0) {
    throw new Error(`OpenDeck plugin directory not found (set OPENDECK_PLUGINS_DIR to override). Checked:\n  ${checked.join('\n  ')}`);
  }
  return found;
}

// Every plugins/<name> with a *.sdPlugin directory, as findPlugin() results plus `name`.
export async function repoPlugins(repoRoot) {
  const pluginsDir = path.join(repoRoot, 'plugins');
  const plugins = [];
  for (const e of await readdir(pluginsDir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const plugin = await findPlugin(path.join(pluginsDir, e.name)).catch(() => null);
    if (plugin) plugins.push({ name: e.name, ...plugin });
  }
  return plugins.sort((a, b) => a.name.localeCompare(b.name));
}

// Names of the plugins release-please releases (dev-preview is left out there on purpose).
export async function releasedPlugins(repoRoot) {
  const config = JSON.parse(await readFile(path.join(repoRoot, 'release-please-config.json'), 'utf8'));
  return Object.keys(config.packages ?? {}).map((p) => path.basename(p));
}

// No filter = all plugins, or only `defaults` when given; an unknown name is an error rather than a silent no-op.
export function selectPlugins(plugins, filter, defaults) {
  if (filter.length === 0) return defaults ? plugins.filter((p) => defaults.includes(p.name)) : plugins;
  const unknown = filter.filter((n) => !plugins.some((p) => p.name === n));
  if (unknown.length) throw new Error(`Unknown plugin(s): ${unknown.join(', ')}. Available: ${plugins.map((p) => p.name).join(', ')}`);
  return plugins.filter((p) => filter.includes(p.name));
}

// Moves dest to ~/.cache/opendeck-hub/backup/<dirName>-<stamp>[-n], never deletes it. Returns the backup path.
// The -n suffix keeps one backup per target when native and Flatpak hold the same plugin in one run.
export async function backup(dest, dirName, stamp, home = os.homedir()) {
  const backupRoot = path.join(home, '.cache', 'opendeck-hub', 'backup');
  await mkdir(backupRoot, { recursive: true });
  let target = path.join(backupRoot, `${dirName}-${stamp}`);
  for (let n = 1; await exists(target); n++) target = path.join(backupRoot, `${dirName}-${stamp}-${n}`);
  try {
    await rename(dest, target);
  } catch (err) {
    if (err.code !== 'EXDEV') throw err;
    // across filesystems: copy (never into an existing dir), then remove the original
    await cp(dest, target, { recursive: true, force: false, errorOnExist: true });
    await rm(dest, { recursive: true, force: true });
  }
  return target;
}

export const timestamp = () => new Date().toISOString().replace(/[:.]/g, '-');

export function printRestartHint(dirNames) {
  console.log('\nRestart OpenDeck to load the changes.');
  console.log('Logs: ~/.local/share/opendeck/logs/opendeck.log');
  for (const d of dirNames) console.log(`      ~/.local/share/opendeck/logs/plugins/${d}.log`);
  console.log('(Flatpak: ~/.var/app/<app id>/data/opendeck/logs/ instead.)');
}
