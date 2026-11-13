// Packs the built <uuid>.sdPlugin into dist/<uuid>-<version>.streamDeckPlugin (a plain ZIP,
// Elgato naming convention). Install in OpenDeck via Plugins -> "Install from file".

import { createHash } from 'node:crypto';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fail, findPlugin } from './lib/plugin.mjs';
import { buildZip, walk } from './lib/zip.mjs';

async function main() {
  const plugin = await findPlugin();
  if (!(await stat(plugin.bundle).catch(() => null))) throw new Error(`Missing ${plugin.bundle} - run "npm run build" first.`);

  const distDir = path.join(plugin.root, 'dist');
  await mkdir(distDir, { recursive: true });
  const outFile = path.join(distDir, `${plugin.dirName}-${plugin.version}.streamDeckPlugin`);
  await rm(outFile, { force: true });

  const entries = await walk(plugin.dir, plugin.root);
  entries.sort((a, b) => a.name.localeCompare(b.name));
  const zip = buildZip(entries);
  await writeFile(outFile, zip);
  // sha256sum-compatible: verify with `cd dist && sha256sum -c <file>.sha256`
  const sum = createHash('sha256').update(zip).digest('hex');
  await writeFile(`${outFile}.sha256`, `${sum}  ${path.basename(outFile)}\n`);

  console.log(`Packed ${path.relative(process.cwd(), outFile)} (${entries.length} entries, ${zip.length} bytes) + .sha256`);
  console.log('OpenDeck: Plugins -> Install from file -> pick this file.');
}

main().catch(fail);
