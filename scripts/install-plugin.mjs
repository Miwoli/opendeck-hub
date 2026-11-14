// Copies built <uuid>.sdPlugin directories into OpenDeck's plugin directory (native and/or Flatpak,
// or OPENDECK_PLUGINS_DIR). An existing copy is MOVED to ~/.cache/opendeck-hub/backup/<uuid>-<timestamp>,
// never deleted. OpenDeck must be restarted afterwards. The recommended install path is still `npm run pack`
// + OpenDeck "Install from file"; this script is for quick iteration.
//
// From the repo root:   node scripts/install-plugin.mjs [<plugin>...]   builds and installs all (or the named) plugins
// From plugins/<name>:  node ../../scripts/install-plugin.mjs           installs that plugin (its npm script builds first)

import { execFileSync } from 'node:child_process';
import { cp } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { backup, exists, pluginTargets, printRestartHint, repoPlugins, selectPlugins, timestamp } from './lib/opendeck.mjs';
import { fail, findPlugin } from './lib/plugin.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function main() {
  let plugins;
  if (path.resolve(process.cwd()) === repoRoot) {
    plugins = selectPlugins(await repoPlugins(repoRoot), process.argv.slice(2));
    const workspaces = plugins.flatMap((p) => ['-w', `plugins/${p.name}`]);
    execFileSync('npm', ['run', 'build', ...workspaces], { cwd: repoRoot, stdio: 'inherit', timeout: 10 * 60_000 });
  } else {
    plugins = [await findPlugin()];
  }

  const targets = await pluginTargets();
  const stamp = timestamp();
  for (const plugin of plugins) {
    if (!(await exists(plugin.bundle))) throw new Error(`Missing ${plugin.bundle} - run "npm run build" first.`);
    for (const target of targets) {
      const dest = path.join(target, plugin.dirName);
      if (await exists(dest)) console.log(`Previous copy backed up to ${await backup(dest, plugin.dirName, stamp)}`);
      await cp(plugin.dir, dest, { recursive: true });
      console.log(`Installed ${dest}`);
    }
  }
  printRestartHint(plugins.map((p) => p.dirName));
}

main().catch(fail);
