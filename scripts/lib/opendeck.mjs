// Helpers for installing into a local OpenDeck: finding its plugin directory, listing this repo's
// plugins and moving an old copy to the backup folder. Used by install-plugin.mjs and uninstall-plugin.mjs.

import { cp, mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
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

// No filter = all plugins; an unknown name is an error rather than a silent no-op.
export function selectPlugins(plugins, filter) {
  if (filter.length === 0) return plugins;
  const unknown = filter.filter((n) => !plugins.some((p) => p.name === n));
  if (unknown.length) throw new Error(`Unknown plugin(s): ${unknown.join(', ')}. Available: ${plugins.map((p) => p.name).join(', ')}`);
  return plugins.filter((p) => filter.includes(p.name));
}

// Moves dest to ~/.cache/opendeck-hub/backup/<dirName>-<stamp>, never deletes it. Returns the backup path.
export async function backup(dest, dirName, stamp, home = os.homedir()) {
  const backupRoot = path.join(home, '.cache', 'opendeck-hub', 'backup');
  await mkdir(backupRoot, { recursive: true });
  const target = path.join(backupRoot, `${dirName}-${stamp}`);
  await rename(dest, target).catch(async () => {
    // rename fails across filesystems; copy, then remove the original
    await cp(dest, target, { recursive: true });
    await rm(dest, { recursive: true, force: true });
  });
  return target;
}

export const timestamp = () => new Date().toISOString().replace(/[:.]/g, '-');

export function printRestartHint(dirNames) {
  console.log('\nRestart OpenDeck to load the changes.');
  console.log('Logs: ~/.local/share/opendeck/logs/opendeck.log');
  for (const d of dirNames) console.log(`      ~/.local/share/opendeck/logs/plugins/${d}.log`);
  console.log('(Flatpak: ~/.var/app/<app id>/data/opendeck/logs/ instead.)');
}
