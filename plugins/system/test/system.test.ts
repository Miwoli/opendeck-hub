import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { clockTile } from '../src/actions/clock.ts';
import { poweroffCommand } from '../src/actions/poweroff.ts';
import { parseScreenshotSettings, screenshotFile, screenshotTile } from '../src/actions/screenshot.ts';
import { parseUserDirs } from '../src/userDirs.ts';

describe('system units', () => {
  it('clock tile: HH:MM, Polish weekday, dd.mm.yyyy (design: Saturday 31.10.2026)', () => {
    const t = clockTile(new Date(2026, 9, 31, 16, 22));
    assert.deepEqual([t.value, t.name, t.status, t.valueSize, t.valueY], ['16:22', 'Saturday', '31.10.2026', 26, 33]);
    assert.equal(clockTile(new Date(2026, 0, 5, 7, 3)).value, '07:03');
    assert.equal(clockTile(new Date(2026, 0, 5, 7, 3)).name, 'Monday');
  });

  it('user-dirs parsing', () => {
    const dirs = parseUserDirs('# comment\nXDG_PICTURES_DIR="$HOME/Pictures"\nXDG_MUSIC_DIR="/data/m"\n', '/home/u');
    assert.equal(dirs['XDG_PICTURES_DIR'], '/home/u/Pictures');
    assert.equal(dirs['XDG_MUSIC_DIR'], '/data/m');
  });

  it('screenshot settings, file name and tiles', () => {
    const s = parseScreenshotSettings({ mode: 'window', folder: '/tmp/z' });
    assert.deepEqual(s, { mode: 'window', folder: '/tmp/z' });
    assert.ok(parseScreenshotSettings({}).folder.endsWith('Screenshots'));
    assert.equal(screenshotFile('/tmp/z', new Date(2026, 9, 31, 16, 22, 5)), '/tmp/z/Screenshot_20261031_162205.png');
    assert.equal(screenshotTile(s, 'idle').status, 'Window');
    assert.deepEqual([screenshotTile(s, 'saved').tone, screenshotTile(s, 'saved').status], ['success', 'Saved']);
    assert.equal(screenshotTile(s, 'error').tone, 'alert');
  });

  it('poweroff command is systemctl poweroff unless overridden', () => {
    assert.deepEqual(poweroffCommand({}), ['systemctl', ['poweroff']]);
    assert.deepEqual(poweroffCommand({ OPENDECK_SYSTEMCTL: '/x/fake' }), ['/x/fake', ['poweroff']]);
  });
});
