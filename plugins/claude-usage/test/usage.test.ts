import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { renderTile } from '@miwoli/deck-core';
import { formatRelative, formatWeekday } from '../src/format.ts';
import { normalizeGlobalSettings } from '../src/globalSettings.ts';
import { limitErrorTile, limitTile } from '../src/tiles.ts';

const now = new Date(2026, 9, 31, 16, 0, 0);
const texts = (svg: string): string[] => [...svg.matchAll(/<text[^>]*>(.*?)<\/text>/g)].map((m) => m[1] ?? '');

describe('format', () => {
  it('session: relative time', () => {
    assert.equal(formatRelative(new Date(2026, 9, 31, 18, 10).toISOString(), now), 'in 2h 10m');
    assert.equal(formatRelative(new Date(2026, 9, 31, 16, 40).toISOString(), now), 'in 40m');
    assert.equal(formatRelative(new Date(2026, 9, 31, 15, 0).toISOString(), now), 'soon');
    assert.equal(formatRelative(null, now), '—');
    assert.equal(formatRelative('garbage', now), '—');
  });
  it('week: weekday and time (design: "Sun 22:00")', () => {
    assert.equal(formatWeekday(new Date(2026, 10, 1, 22, 0).toISOString(), now), 'Sun 22:00');
    assert.equal(formatWeekday(new Date(2026, 9, 31, 22, 5).toISOString(), now), 'today 22:05');
  });
});

describe('tiles', () => {
  it('usage tile with thresholds and limit prefix above 90 %', () => {
    const s = renderTile(limitTile('Session', 'five_hour', { utilization: 34, resets_at: new Date(2026, 9, 31, 18, 10).toISOString() }, now));
    assert.deepEqual(texts(s), ['34%', 'Session', 'in 2h 10m']);
    const hi = renderTile(limitTile('Session', 'five_hour', { utilization: 94, resets_at: new Date(2026, 9, 31, 16, 40).toISOString() }, now));
    assert.deepEqual(texts(hi), ['94%', 'Session', 'limit · in 40m']);
    assert.ok(hi.includes('#331E24'), 'alert tile');
    assert.deepEqual(texts(renderTile(limitTile('Week', 'seven_day', { utilization: 7, resets_at: new Date(2026, 10, 1, 22).toISOString() }, now))), ['7%', 'Week', 'Sun 22:00']);
  });
  it('errors use the "!" alert tile', () => {
    assert.deepEqual(texts(renderTile(limitErrorTile('Session', 'auth'))), ['!', 'Session', 'Expired']);
    assert.equal(texts(renderTile(limitErrorTile('Session', 'no_key')))[2], 'set key');
    assert.equal(texts(renderTile(limitErrorTile('Session', 'network')))[2], 'No network');
    assert.equal(texts(renderTile(limitTile('Session', 'five_hour', undefined)))[2], 'no data');
  });
});

describe('global settings', () => {
  it('validates and defaults', () => {
    assert.deepEqual(normalizeGlobalSettings({ sessionKey: ' sk-ant-x ', refreshIntervalMinutes: 0 }), { sessionKey: 'sk-ant-x', orgId: '', refreshIntervalMinutes: 1 });
    assert.deepEqual(normalizeGlobalSettings({}), { sessionKey: '', orgId: '', refreshIntervalMinutes: 5 });
  });
});
