import assert from 'node:assert/strict';
import { test } from 'node:test';
import { versionProblems } from '../lib/version.mjs';

const ok = { plugin: 'games', pkgVersion: '0.2.0', manifestVersion: '0.2.0.0' };

test('consistent versions pass, with and without tag', () => {
  assert.deepEqual(versionProblems(ok), []);
  assert.deepEqual(versionProblems({ ...ok, tag: 'games-v0.2.0' }), []);
});

test('manifest, tag and non-semver mismatches are reported', () => {
  assert.equal(versionProblems({ ...ok, manifestVersion: '0.1.0.0' }).length, 1);
  assert.equal(versionProblems({ ...ok, tag: 'games-v0.3.0' }).length, 1);
  assert.equal(versionProblems({ ...ok, tag: 'media-v0.2.0' }).length, 1);
  assert.ok(versionProblems({ ...ok, pkgVersion: '0.2' }).length >= 1);
});
