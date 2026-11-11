import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  SettingsStore,
  asObject,
  mergeSettings,
  readBoolean,
  readEnum,
  readNumber,
  readString,
  readTrimmed,
} from '../src/settings.ts';

describe('settings validators', () => {
  const raw = asObject({ s: 'x', blank: '  ', n: 5, ns: '7', b: true, bs: 'false', e: 'b', bad: { nested: true } });

  it('asObject rejects non-objects', () => {
    assert.deepEqual(asObject(null), {});
    assert.deepEqual(asObject([1]), {});
    assert.deepEqual(asObject('x'), {});
  });

  it('reads typed values with defaults', () => {
    assert.equal(readString(raw, 's', 'd'), 'x');
    assert.equal(readString(raw, 'n', 'd'), 'd');
    assert.equal(readTrimmed(raw, 'blank', 'd'), 'd');
    assert.equal(readNumber(raw, 'n', 0), 5);
    assert.equal(readNumber(raw, 'ns', 0), 7);
    assert.equal(readNumber(raw, 's', 3), 3);
    assert.equal(readNumber(raw, 'n', 0, { max: 4 }), 4);
    assert.equal(readNumber(raw, 'n', 0, { min: 10 }), 10);
    assert.equal(readBoolean(raw, 'b', false), true);
    assert.equal(readBoolean(raw, 'bs', true), false);
    assert.equal(readBoolean(raw, 's', true), true);
    assert.equal(readEnum(raw, 'e', ['a', 'b'] as const, 'a'), 'b');
    assert.equal(readEnum(raw, 's', ['a', 'b'] as const, 'a'), 'a');
  });

  it('SettingsStore parses per context and falls back to defaults', () => {
    const store = new SettingsStore((o) => ({ interval: readNumber(o, 'interval', 300, { min: 30 }) }));
    assert.deepEqual(store.update('c1', { interval: 10 }), { interval: 30 });
    assert.deepEqual(store.get('c1'), { interval: 30 });
    assert.deepEqual(store.get('unknown'), { interval: 300 });
    store.delete('c1');
    assert.deepEqual(store.get('c1'), { interval: 300 });
  });

  it('mergeSettings drops undefined', () => {
    assert.deepEqual(mergeSettings({ a: 1, b: 2 }, { b: undefined, c: 'x' }), { a: 1, b: 2, c: 'x' });
  });
});

describe('image helpers', async () => {
  const { imageDataUri, sniffMime } = await import('../src/image.ts');
  it('accepts PNG/JPEG only', () => {
    assert.equal(sniffMime(Buffer.from('89504e47', 'hex')), 'image/png');
    assert.match(imageDataUri(Buffer.from([0xff, 0xd8, 0xff, 0xdb])) ?? '', /^data:image\/jpeg;base64,/);
    assert.equal(imageDataUri(Buffer.from('<svg/>')), null);
  });
});
