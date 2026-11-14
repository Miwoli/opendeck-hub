import assert from 'node:assert/strict';
import { test } from 'node:test';
import { manifestProblems } from '../lib/manifest.mjs';

const plugin = 'games';
const uuid = 'com.miwoli.games';
const valid = () => ({
  Name: 'Games',
  Author: 'Miwoli',
  Version: '0.2.0.0',
  Icon: 'images/icon',
  OS: [{ Platform: 'linux' }],
  CodePathLin: 'bin/plugin.cjs',
  Actions: [{ Name: 'Launcher', UUID: 'com.miwoli.games.launcher', Controllers: ['Keypad'], States: [{}] }],
});
const check = (manifest, u = uuid) => manifestProblems({ plugin, uuid: u, manifest });

test('a valid manifest has no problems', () => {
  assert.deepEqual(check(valid()), []);
});

test('missing or empty required fields are reported', () => {
  for (const key of ['Name', 'Author', 'Version', 'Icon']) {
    const m = valid();
    delete m[key];
    assert.equal(check(m).length, 1, key);
    assert.equal(check({ ...valid(), [key]: '' }).length, 1, `${key} empty`);
  }
  const noActions = valid();
  delete noActions.Actions;
  assert.equal(check(noActions).length, 1);
});

test('OS must be exactly linux', () => {
  const m = valid();
  delete m.OS;
  assert.equal(check(m).length, 1);
  assert.equal(check({ ...valid(), OS: [{ Platform: 'windows' }] }).length, 1);
  assert.equal(check({ ...valid(), OS: [{ Platform: 'linux' }, { Platform: 'mac' }] }).length, 1);
});

test('forbidden fields are reported', () => {
  for (const key of ['Description', 'SDKVersion', 'Software', 'UserTitleEnabled']) {
    assert.equal(check({ ...valid(), [key]: 'x' }).length, 1, key);
  }
});

test('every action must use Keypad only', () => {
  const m = valid();
  m.Actions[0].Controllers = ['Keypad', 'Encoder'];
  assert.equal(check(m).length, 1);
  delete m.Actions[0].Controllers;
  assert.equal(check(m).length, 1);
});

test('plugin and action UUIDs must follow com.miwoli.<plugin>[.<action>]', () => {
  assert.equal(check(valid(), 'com.miwoli.other').length, 1);
  assert.equal(check(valid(), 'com.miwoli.games.sdPlugin').length, 1);
  const m = valid();
  m.Actions[0].UUID = 'com.miwoli.other.launcher';
  assert.equal(check(m).length, 1);
  m.Actions[0].UUID = 'com.miwoli.games.';
  assert.equal(check(m).length, 1);
});

test('all problems are collected, not just the first', () => {
  const m = { ...valid(), Description: 'x', OS: [] };
  m.Actions[0].Controllers = ['Encoder'];
  assert.equal(check(m).length, 3);
});

test('a non-object manifest is rejected', () => {
  assert.equal(check([]).length, 1);
  assert.equal(check(null).length, 1);
});
