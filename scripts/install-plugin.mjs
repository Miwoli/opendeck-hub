// Copies the built <uuid>.sdPlugin into OpenDeck's plugin directory (native and/or Flatpak).
// An existing copy is MOVED to ~/.cache/opendeck-hub/backup/<uuid>-<timestamp>, never deleted.
// OpenDeck must be restarted afterwards. The recommended install path is still `npm run pack`
// + OpenDeck "Install from file"; this script is for quick iteration.

import { cp, mkdir, readdir, rename, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fail, findPlugin } from './lib/plugin.mjs';

async function exists(p) {
  return Boolean(await stat(p).catch(() => null));
}

async function pluginTargets() {
  const home = os.homedir();
  const targets = [path.join(home, '.config', 'opendeck', 'plugins')];
  // Flatpak app id is not verified, so match any app dir containing "opendeck"
  const flatpakRoot = path.join(home, '.var', 'app');
  for (const app of await readdir(flatpakRoot).catch(() => [])) {
    if (app.toLowerCase().includes('opendeck')) {
      targets.push(path.join(flatpakRoot, app, 'config', 'opendeck', 'plugins'));
    }
  }
  const found = [];
  for (const t of targets) if (await exists(t)) found.push(t);
  return { checked: targets, found };
}

async function main() {
  const plugin = await findPlugin();
  if (!(await exists(plugin.bundle))) throw new Error(`Missing ${plugin.bundle} - run "npm run build" first.`);

  const { checked, found } = await pluginTargets();
  if (found.length === 0) throw new Error(`OpenDeck plugin directory not found. Checked:\n  ${checked.join('\n  ')}`);

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupRoot = path.join(os.homedir(), '.cache', 'opendeck-hub', 'backup');
  for (const target of found) {
    const dest = path.join(target, plugin.dirName);
    if (await exists(dest)) {
      await mkdir(backupRoot, { recursive: true });
      const backup = path.join(backupRoot, `${plugin.dirName}-${stamp}`);
      await rename(dest, backup).catch(async () => {
        // rename fails across filesystems; fall back to copy (the old dir is then overwritten)
        await cp(dest, backup, { recursive: true });
      });
      console.log(`Previous copy backed up to ${backup}`);
    }
    await cp(plugin.dir, dest, { recursive: true, force: true });
    console.log(`Installed ${dest}`);
  }
  console.log('Restart OpenDeck to load the plugin.');
  console.log(`Plugin log: ~/.local/share/opendeck/logs/plugins/${plugin.dirName}.log`);
}

main().catch(fail);
