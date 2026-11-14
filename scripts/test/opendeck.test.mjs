import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { backup, pluginTargets, repoPlugins, selectPlugins } from '../lib/opendeck.mjs';

async function withTemp(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), 'opendeck-'));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('detects native and Flatpak plugin directories, override wins', () =>
  withTemp(async (home) => {
    await assert.rejects(pluginTargets({ home, override: '' }), /not found/);
    const native = path.join(home, '.config', 'opendeck', 'plugins');
    const flatpak = path.join(home, '.var', 'app', 'me.example.OpenDeck', 'config', 'opendeck', 'plugins');
    await mkdir(path.join(home, '.var', 'app', 'org.other.App', 'config', 'opendeck', 'plugins'), { recursive: true });
    await mkdir(flatpak, { recursive: true });
    assert.deepEqual(await pluginTargets({ home, override: '' }), [flatpak]);
    await mkdir(native, { recursive: true });
    assert.deepEqual(await pluginTargets({ home, override: '' }), [native, flatpak]);
    assert.deepEqual(await pluginTargets({ home, override: home }), [home]);
    await assert.rejects(pluginTargets({ home, override: path.join(home, 'missing') }), /does not exist/);
  }));

test('lists repo plugins and filters them by name', () =>
  withTemp(async (root) => {
    for (const name of ['beta', 'alpha']) {
      await mkdir(path.join(root, 'plugins', name, `com.miwoli.${name}.sdPlugin`), { recursive: true });
      await writeFile(path.join(root, 'plugins', name, 'package.json'), '{"version":"1.0.0"}');
    }
    await mkdir(path.join(root, 'plugins', 'no-sdplugin'));
    const plugins = await repoPlugins(root);
    assert.deepEqual(plugins.map((p) => p.dirName), ['com.miwoli.alpha.sdPlugin', 'com.miwoli.beta.sdPlugin']);
    assert.equal(selectPlugins(plugins, []).length, 2);
    assert.deepEqual(selectPlugins(plugins, ['beta']).map((p) => p.name), ['beta']);
    assert.throws(() => selectPlugins(plugins, ['beta', 'nope']), /Unknown plugin\(s\): nope/);
  }));

test('backup moves the old copy instead of deleting it', () =>
  withTemp(async (home) => {
    const dest = path.join(home, 'plugins', 'com.miwoli.x.sdPlugin');
    await mkdir(dest, { recursive: true });
    await writeFile(path.join(dest, 'manifest.json'), '{}');
    const saved = await backup(dest, 'com.miwoli.x.sdPlugin', 'stamp', home);
    assert.equal(saved, path.join(home, '.cache', 'opendeck-hub', 'backup', 'com.miwoli.x.sdPlugin-stamp'));
    assert.deepEqual(await readdir(saved), ['manifest.json']);
    await assert.rejects(readdir(dest));
  }));

test('the same plugin in two targets gets two separate backups', () =>
  withTemp(async (home) => {
    const name = 'com.miwoli.x.sdPlugin';
    const saved = [];
    for (const which of ['native', 'flatpak']) {
      const dest = path.join(home, which, name);
      await mkdir(dest, { recursive: true });
      await writeFile(path.join(dest, `${which}.txt`), which);
      saved.push(await backup(dest, name, 'stamp', home));
    }
    assert.notEqual(saved[0], saved[1]);
    assert.deepEqual(await readdir(saved[0]), ['native.txt']);
    assert.deepEqual(await readdir(saved[1]), ['flatpak.txt']);
  }));

test('a failed move (not EXDEV) keeps the original', { skip: process.getuid?.() === 0 && 'root ignores permissions' }, () =>
  withTemp(async (home) => {
    const dest = path.join(home, 'plugins', 'com.miwoli.x.sdPlugin');
    await mkdir(dest, { recursive: true });
    await writeFile(path.join(dest, 'manifest.json'), '{}');
    const backupRoot = path.join(home, '.cache', 'opendeck-hub', 'backup');
    await mkdir(backupRoot, { recursive: true });
    await chmod(backupRoot, 0o500);
    try {
      await assert.rejects(backup(dest, 'com.miwoli.x.sdPlugin', 'stamp', home), { code: 'EACCES' });
    } finally {
      await chmod(backupRoot, 0o700);
    }
    assert.deepEqual(await readdir(dest), ['manifest.json']);
  }));
