// Bundle smoke test without OpenDeck: start bin/plugin.cjs against port 1 and expect ECONNREFUSED.
// Anything else fails: a missing bundle, a non-CommonJS bundle, or any other crash.
// See docs/notes/opendeck-nodejs-plugin-runtime-notes.md.

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fail, findPlugin } from './lib/plugin.mjs';

const TIMEOUT_MS = 5000;
// After the first ECONNREFUSED, wait this long for a crash printed right after it.
const GRACE_MS = 300;
// Printed when the bundle is not CommonJS (esbuild format 'esm', or a require shim in ESM output).
const NOT_CJS = /Dynamic require|require is not defined|Cannot use import statement|Failed to load the ES module/;

async function main() {
  const plugin = await findPlugin();
  const bundle = path.relative(plugin.root, plugin.bundle);
  if (!existsSync(plugin.bundle)) {
    throw new Error(`${plugin.dirName}: ${bundle} is missing. Run "npm run build" in this plugin first.`);
  }

  const child = spawn(
    process.execPath,
    [plugin.bundle, '-port', '1', '-pluginUUID', 'test', '-registerEvent', 'registerPlugin', '-info', '{}'],
    { cwd: plugin.dir, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let output = '';
  // A real bundle keeps reconnecting after ECONNREFUSED and never exits, so decide on the output, not on exit.
  const outcome = await new Promise((resolve, reject) => {
    let settled = false;
    let grace;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(grace);
      resolve(value);
    };
    const timer = setTimeout(() => finish({ timedOut: true }), TIMEOUT_MS);
    const onData = (chunk) => {
      output += chunk.toString();
      if (NOT_CJS.test(output)) finish({ notCjs: true });
      else if (output.includes('ECONNREFUSED') && !grace) grace = setTimeout(() => finish({}), GRACE_MS);
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(grace);
      reject(new Error(`${plugin.dirName}: could not start ${bundle}: ${err.message}`));
    });
    // A bundle that exits (during the grace period or before) has crashed.
    child.on('exit', (code) => finish({ exitedWith: code }));
  }).finally(() => child.kill('SIGTERM'));

  if (outcome.notCjs) {
    throw new Error(`${plugin.dirName}: ${bundle} is not a CommonJS bundle (esbuild format must be 'cjs'). Output:\n${output}`);
  }
  if (outcome.exitedWith !== undefined) {
    throw new Error(`${plugin.dirName}: ${bundle} crashed (exit code ${outcome.exitedWith}). Output:\n${output}`);
  }
  if (!output.includes('ECONNREFUSED')) {
    const how = outcome.timedOut ? `timed out after ${TIMEOUT_MS} ms` : 'finished';
    throw new Error(`${plugin.dirName}: ${bundle} ${how} without ECONNREFUSED on port 1. Output:\n${output}`);
  }
  console.log(`Smoke test OK: ${plugin.dirName} loads and reports ECONNREFUSED on port 1`);
}

main().catch(fail);
