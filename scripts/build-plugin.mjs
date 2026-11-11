// Bundles plugins/<name>/src/index.ts into <uuid>.sdPlugin/bin/plugin.cjs and copies pi/.
// IMPORTANT (verified on a live OpenDeck, see docs/notes/opendeck-nodejs-plugin-runtime-notes.md):
// format 'cjs' + '.cjs' extension. An ESM bundle crashes on `ws` ("Dynamic require").
// Usage: node ../../scripts/build-plugin.mjs [--watch]

import { cp, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import * as esbuild from 'esbuild';
import { fail, findPlugin } from './lib/plugin.mjs';

async function main() {
  const plugin = await findPlugin();
  const watch = process.argv.includes('--watch');

  const piSrc = path.join(plugin.root, 'pi');
  if (await stat(piSrc).catch(() => null)) {
    const dest = path.join(plugin.dir, 'pi');
    await mkdir(dest, { recursive: true });
    await cp(piSrc, dest, { recursive: true });
  }

  const options = {
    entryPoints: [path.join(plugin.root, 'src', 'index.ts')],
    outfile: plugin.bundle,
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    sourcemap: true,
    logLevel: 'info',
    // optional native add-ons of `ws`; not required at runtime
    external: ['bufferutil', 'utf-8-validate'],
  };

  if (watch) {
    const ctx = await esbuild.context(options);
    await ctx.watch();
    console.log(`Watching ${plugin.dirName} (Ctrl+C to stop)`);
  } else {
    await esbuild.build(options);
    console.log(`Built ${path.relative(process.cwd(), plugin.bundle)}`);
  }
}

main().catch(fail);
