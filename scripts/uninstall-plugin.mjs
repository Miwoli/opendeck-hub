// Removes this repo's plugins (all, or the named ones) from OpenDeck's plugin directory. Only directories
// named after a plugin in plugins/ are touched, and they are MOVED to ~/.cache/opendeck-hub/backup/, not deleted.
// Usage (repo root): node scripts/uninstall-plugin.mjs [<plugin>...]

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { backup, exists, pluginTargets, printRestartHint, repoPlugins, selectPlugins, timestamp } from './lib/opendeck.mjs';
import { fail } from './lib/plugin.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function main() {
  const plugins = selectPlugins(await repoPlugins(repoRoot), process.argv.slice(2));
  const targets = await pluginTargets();
  const stamp = timestamp();
  const removed = [];
  for (const plugin of plugins) {
    for (const target of targets) {
      const dest = path.join(target, plugin.dirName);
      if (!(await exists(dest))) continue;
      console.log(`Removed ${dest} (backup: ${await backup(dest, plugin.dirName, stamp)})`);
      removed.push(plugin.dirName);
    }
  }
  if (removed.length === 0) return console.log('Nothing to uninstall.');
  printRestartHint([]);
}

main().catch(fail);
