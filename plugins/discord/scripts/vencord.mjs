// Builds Vencord with the DeckBridge userplugin for Vesktop.
//   npm run vencord -w plugins/discord            # clone (first time) or update, copy userplugin, build
//   VENCORD_DIR=/path npm run vencord -w plugins/discord
//   npm run vencord -w plugins/discord -- --check   # only verify that dist/ still contains DeckBridge
// Then Vesktop -> Settings -> Developer Options -> Vencord Location -> pick <VENCORD_DIR>/dist,
// restart Vesktop and enable "DeckBridge" in Vencord's plugin list.
// Network: git clone/pull of github.com/Vendicated/Vencord and `pnpm install` (npm registry).
// Child processes: spawnSync with argument arrays, no shell.

import { spawnSync } from 'node:child_process';
import { cp, mkdir, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = 'https://github.com/Vendicated/Vencord';
const here = path.dirname(fileURLToPath(import.meta.url));
const userplugin = path.resolve(here, '..', 'vencord-userplugin', 'deckBridge');
const vencordDir = process.env.VENCORD_DIR || path.join(os.homedir(), '.local', 'share', 'opendeck-hub', 'vencord');

function run(cmd, args, cwd) {
  console.log(`$ ${cmd} ${args.join(' ')}`);
  const res = spawnSync(cmd, args, {
    cwd,
    stdio: 'inherit',
    // corepack would otherwise ask interactively before fetching the pnpm version pinned by Vencord
    env: { ...process.env, COREPACK_ENABLE_DOWNLOAD_PROMPT: '0' },
    timeout: 15 * 60 * 1000,
  });
  if (res.error) throw res.error;
  if (res.status !== 0) throw new Error(`${cmd} ${args.join(' ')} exited with ${res.status}`);
}

async function exists(p) {
  return Boolean(await stat(p).catch(() => null));
}

// Vesktop's "repair" path (ensureVencordFiles/downloadVencordFiles) and Vencord's own updater can replace
// dist/ with the official release, which silently drops DeckBridge. Detect that.
async function verify(dist) {
  const problems = [];
  const main = await readFile(path.join(dist, 'vencordDesktopMain.js'), 'utf8').catch(() => '');
  const renderer = await readFile(path.join(dist, 'vencordDesktopRenderer.js'), 'utf8').catch(() => '');
  if (!main) problems.push('vencordDesktopMain.js missing');
  else if (!main.includes('opendeck-discord.sock')) problems.push('vencordDesktopMain.js has no DeckBridge socket code');
  if (!renderer) problems.push('vencordDesktopRenderer.js missing');
  else if (!renderer.includes('name:"DeckBridge"')) problems.push('vencordDesktopRenderer.js has no DeckBridge plugin');
  if (renderer.includes('// Standalone: true')) problems.push('files are the official standalone release (overwritten by Vesktop/Vencord updater)');
  if (!(await exists(path.join(dist, 'vencordDesktopRenderer.css')))) problems.push('vencordDesktopRenderer.css missing (Vesktop would re-download)');
  return problems;
}

async function main() {
  const dist = path.join(vencordDir, 'dist');
  if (process.argv.includes('--check')) {
    const problems = await verify(dist);
    if (problems.length) throw new Error(`DeckBridge NOT present in ${dist}:\n  - ${problems.join('\n  - ')}\nRun: npm run vencord -w plugins/discord`);
    console.log(`OK: ${dist} contains DeckBridge`);
    return;
  }

  if (await exists(path.join(vencordDir, '.git'))) {
    run('git', ['pull', '--ff-only'], vencordDir);
  } else {
    await mkdir(path.dirname(vencordDir), { recursive: true });
    run('git', ['clone', '--depth', '1', REPO, vencordDir]);
  }

  // copied, not symlinked: Vencord's build inspects directory entries
  const dest = path.join(vencordDir, 'src', 'userplugins', 'deckBridge');
  await rm(dest, { recursive: true, force: true });
  await mkdir(path.dirname(dest), { recursive: true });
  await cp(userplugin, dest, { recursive: true });
  console.log(`Copied DeckBridge -> ${dest}`);

  run('corepack', ['pnpm', 'install', '--frozen-lockfile'], vencordDir);
  // --disable-updater: Vencord's updater must not replace our build; updates come from this script
  run('corepack', ['pnpm', 'build', '--disable-updater'], vencordDir);

  const problems = await verify(dist);
  if (problems.length) throw new Error(`Build finished but:\n  - ${problems.join('\n  - ')}`);
  console.log(`\nVencord with DeckBridge built: ${dist}`);
  console.log('Vesktop -> Settings -> Developer Options -> Vencord Location -> choose that folder, restart Vesktop,');
  console.log('then Vencord -> Plugins -> enable "DeckBridge". Socket: $XDG_RUNTIME_DIR/opendeck-discord.sock');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
