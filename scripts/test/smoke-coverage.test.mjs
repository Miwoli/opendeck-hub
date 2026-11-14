import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

// `npm run smoke --workspaces --if-present` skips a workspace without a smoke script, so a missing one would pass silently.
test('every plugin workspace defines a smoke script', async () => {
  const pluginsDir = path.resolve(import.meta.dirname, '../../plugins');
  const dirs = (await readdir(pluginsDir, { withFileTypes: true })).filter((e) => e.isDirectory());
  assert.ok(dirs.length > 0);
  for (const dir of dirs) {
    const pkg = JSON.parse(await readFile(path.join(pluginsDir, dir.name, 'package.json'), 'utf8'));
    assert.ok(pkg.scripts?.smoke, `plugins/${dir.name} has no "smoke" script`);
  }
});
