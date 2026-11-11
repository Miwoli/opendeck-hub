// Bundle smoke test without OpenDeck: start bin/plugin.cjs against port 1 and expect ECONNREFUSED.
// "Dynamic require" / "require is not defined" means a broken bundle (see docs/notes/opendeck-nodejs-plugin-runtime-notes.md).

import { spawn } from 'node:child_process';
import { fail, findPlugin } from './lib/plugin.mjs';

const TIMEOUT_MS = 5000;

async function main() {
  const plugin = await findPlugin();
  const child = spawn(
    process.execPath,
    [plugin.bundle, '-port', '1', '-pluginUUID', 'test', '-registerEvent', 'registerPlugin', '-info', '{}'],
    { cwd: plugin.dir, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let output = '';
  const ok = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), TIMEOUT_MS);
    const onData = (chunk) => {
      output += chunk.toString();
      if (output.includes('ECONNREFUSED')) {
        clearTimeout(timer);
        resolve(true);
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('exit', () => {
      clearTimeout(timer);
      resolve(output.includes('ECONNREFUSED'));
    });
  });
  child.kill('SIGTERM');
  if (!ok) throw new Error(`Smoke test FAILED for ${plugin.dirName}. Output:\n${output}`);
  console.log(`Smoke test OK: ${plugin.dirName} loads and reports ECONNREFUSED on port 1`);
}

main().catch(fail);
