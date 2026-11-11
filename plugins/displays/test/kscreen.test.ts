import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isActive, layoutArgs, leftToRight, parseOutputs, parseSnapshot, readOutputs, snapshotIfExtended } from '../src/kscreen.ts';
import { defaultLabel, layoutTile } from '../src/tiles.ts';
import { parseLayoutSettings } from '../src/actions/layout.ts';
import { kscreenJson } from './fixture.ts';

const both = parseOutputs(kscreenJson({ dp: true, hdmi: true }));
const dpOnly = parseOutputs(kscreenJson({ dp: true, hdmi: false }));
const hdmiOnly = parseOutputs(kscreenJson({ dp: false, hdmi: true, hdmiPriority: 1 }));

describe('parseOutputs', () => {
  it('reads the real JSON shape and the current mode name', () => {
    assert.equal(both.length, 2, 'unsafe output names are skipped');
    assert.deepEqual(both[0], { id: 1, name: 'DP-2', connected: true, enabled: true, x: 0, y: 631, width: 3440, height: 1440, scale: 1, priority: 1, modeName: '3440x1440@240' });
    assert.equal(both[1]?.modeName, '2560x2880@60');
  });
  it('rejects unexpected JSON', () => {
    assert.throws(() => parseOutputs({}), /no outputs/);
    assert.throws(() => parseOutputs(null));
  });
  it('readOutputs runs `kscreen-doctor -j` and parses stdout', async () => {
    const calls: string[][] = [];
    const out = await readOutputs(async (file, args) => {
      calls.push([file, ...args]);
      return { stdout: JSON.stringify(kscreenJson({ dp: true, hdmi: false })), stderr: '', code: 0 };
    });
    assert.deepEqual(calls, [['kscreen-doctor', '-j']]);
    assert.equal(out.filter((o) => o.enabled).length, 1);
  });
});

describe('layouts', () => {
  it('detects the active layout', () => {
    assert.ok(isActive({ kind: 'extend' }, both));
    assert.ok(!isActive({ kind: 'single', output: 'DP-2' }, both));
    assert.ok(isActive({ kind: 'single', output: 'DP-2' }, dpOnly));
    assert.ok(isActive({ kind: 'single', output: 'HDMI-A-1' }, hdmiOnly));
    assert.ok(!isActive({ kind: 'extend' }, dpOnly));
  });

  it('single: enable target, make it primary, disable the others', () => {
    assert.deepEqual(layoutArgs({ kind: 'single', output: 'HDMI-A-1' }, both, null), [
      'output.HDMI-A-1.enable', 'output.HDMI-A-1.priority.1', 'output.DP-2.disable',
    ]);
    assert.deepEqual(layoutArgs({ kind: 'single', output: 'DP-2' }, dpOnly, null), ['output.DP-2.enable', 'output.DP-2.priority.1']);
  });

  it('single on an unplugged output throws instead of disabling the working screen', () => {
    const unplugged = parseOutputs(kscreenJson({ dp: true, hdmi: false, hdmiConnected: false }));
    assert.throws(() => layoutArgs({ kind: 'single', output: 'HDMI-A-1' }, unplugged, null), /not connected/);
    assert.throws(() => layoutArgs({ kind: 'extend' }, unplugged, null), /two connected/);
  });

  it('extend restores the remembered geometry, priorities and modes', () => {
    const snap = snapshotIfExtended(both);
    assert.ok(snap);
    assert.deepEqual(snapshotIfExtended(dpOnly), null);
    assert.deepEqual(layoutArgs({ kind: 'extend' }, hdmiOnly, snap), [
      'output.DP-2.enable', 'output.DP-2.position.0,631', 'output.DP-2.priority.1', 'output.DP-2.mode.3440x1440@240',
      'output.HDMI-A-1.enable', 'output.HDMI-A-1.position.3440,0', 'output.HDMI-A-1.priority.2', 'output.HDMI-A-1.mode.2560x2880@60',
    ]);
    assert.deepEqual(parseSnapshot(JSON.parse(JSON.stringify(snap))), snap, 'survives global settings round trip');
  });

  it('extend without a snapshot places outputs left to right by priority', () => {
    assert.deepEqual(layoutArgs({ kind: 'extend' }, hdmiOnly, null), [
      'output.HDMI-A-1.enable', 'output.HDMI-A-1.position.0,0', 'output.HDMI-A-1.priority.1',
      'output.DP-2.enable', 'output.DP-2.position.2327,0', 'output.DP-2.priority.2',
    ]);
  });

  it('parseSnapshot drops invalid entries', () => {
    assert.equal(parseSnapshot({ outputs: [{ name: 'a b' }, { name: 'DP-2' }] }), null);
    assert.equal(parseSnapshot('x'), null);
  });
});

describe('settings and tiles', () => {
  it('parses PI settings', () => {
    assert.deepEqual(parseLayoutSettings({ layout: 'single', output: 'DP-2', label: '' }), { layout: { kind: 'single', output: 'DP-2' }, label: '' });
    assert.deepEqual(parseLayoutSettings({ layout: 'extend' }).layout, { kind: 'extend' });
    assert.equal(parseLayoutSettings({ layout: 'single' }).layout, null, 'single needs an output');
    assert.equal(parseLayoutSettings({ layout: 'mirror' }).layout, null);
  });

  it('default labels follow the left-to-right order', () => {
    assert.deepEqual(leftToRight(both).map((o) => o.name), ['DP-2', 'HDMI-A-1']);
    assert.equal(defaultLabel({ kind: 'single', output: 'DP-2' }, both), 'Screen 1');
    assert.equal(defaultLabel({ kind: 'single', output: 'HDMI-A-1' }, both), 'Screen 2');
    assert.equal(defaultLabel({ kind: 'extend' }, both), 'Extend');
  });

  it('tile states', () => {
    const s = (layout: Parameters<typeof layoutTile>[0]['layout'], label = ''): Parameters<typeof layoutTile>[0] => ({ layout, label });
    assert.deepEqual([layoutTile(s({ kind: 'extend' }), both, 'idle').tone, layoutTile(s({ kind: 'extend' }), both, 'idle').status], ['on', 'Active']);
    assert.equal(layoutTile(s({ kind: 'extend' }), both, 'idle').glyph, 'monitorsExtend');
    assert.deepEqual([layoutTile(s({ kind: 'single', output: 'DP-2' }), both, 'idle').name, layoutTile(s({ kind: 'single', output: 'DP-2' }), both, 'idle').status], ['Screen 1', 'Switch']);
    assert.equal(layoutTile(s({ kind: 'single', output: 'DP-2' }, 'Monitor'), both, 'idle').name, 'Monitor');
    assert.equal(layoutTile(s(null), both, 'idle').status, 'set in PI');
    assert.equal(layoutTile(s({ kind: 'single', output: 'DP-2' }), null, 'idle').status, 'offline');
    assert.equal(layoutTile(s({ kind: 'single', output: 'DP-2' }), both, 'switching').status, 'switching…');
    assert.equal(layoutTile(s({ kind: 'single', output: 'DP-2' }), both, 'error').tone, 'alert');
    const unplugged = parseOutputs(kscreenJson({ dp: true, hdmi: false, hdmiConnected: false }));
    assert.equal(layoutTile(s({ kind: 'single', output: 'HDMI-A-1' }), unplugged, 'idle').status, 'none');
  });
});
