import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { manifestProblems } from '../lib/manifest.mjs';
import { nameProblem, scaffold, titleOf } from '../new-plugin.mjs';

const json = async (file) => JSON.parse(await readFile(file, 'utf8'));

async function tempRepo() {
  const root = await mkdtemp(path.join(tmpdir(), 'new-plugin-'));
  await mkdir(path.join(root, 'plugins', 'existing'), { recursive: true });
  await writeFile(path.join(root, 'release-please-config.json'), '{"packages":{"plugins/zeta":{"component":"zeta"}}}');
  await writeFile(path.join(root, '.release-please-manifest.json'), '{"plugins/zeta":"1.0.0"}');
  return root;
}

test('name validation', () => {
  for (const ok of ['a', 'scaffold-test', 'ha-map2']) assert.equal(nameProblem(ok), null, ok);
  for (const bad of ['', 'Upper', 'a_b', '-a', 'a-', 'a--b', 'a b', '../x', undefined]) assert.notEqual(nameProblem(bad), null, String(bad));
  assert.equal(titleOf('scaffold-test'), 'Scaffold Test');
});

test('a generated plugin passes the manifest rules and is registered for releases', async () => {
  const root = await tempRepo();
  try {
    const dir = await scaffold(root, 'scaffold-test');
    const uuid = 'com.miwoli.scaffold-test';
    const manifest = await json(path.join(dir, `${uuid}.sdPlugin`, 'manifest.json'));
    assert.deepEqual(manifestProblems({ plugin: 'scaffold-test', uuid, manifest }), []);
    assert.equal(manifest.Version, `${(await json(path.join(dir, 'package.json'))).version}.0`);
    assert.doesNotMatch(await readFile(path.join(dir, 'src', 'index.ts'), 'utf8'), /__[A-Z]+__/);

    const config = await json(path.join(root, 'release-please-config.json'));
    assert.deepEqual(Object.keys(config.packages), ['plugins/scaffold-test', 'plugins/zeta']);
    assert.equal(config.packages['plugins/scaffold-test'].component, 'scaffold-test');
    assert.equal((await json(path.join(root, '.release-please-manifest.json')))['plugins/scaffold-test'], '0.1.0');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('refuses invalid names and existing plugins without changing anything', async () => {
  const root = await tempRepo();
  try {
    await assert.rejects(scaffold(root, 'Bad Name'), /lowercase/);
    await assert.rejects(scaffold(root, 'existing'), /already exists/);
    await assert.rejects(scaffold(root, '../escape'), /lowercase/);
    assert.equal(await readFile(path.join(root, '.release-please-manifest.json'), 'utf8'), '{"plugins/zeta":"1.0.0"}');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
