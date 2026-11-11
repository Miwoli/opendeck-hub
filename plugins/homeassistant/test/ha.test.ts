import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { parseTemperatureSettings, readHaMapSettings } from '../src/actions/temperature.ts';
import { websocketUrl } from '../src/haClient.ts';
import { formatValue, temperatureTile } from '../src/tiles.ts';

const dir = mkdtempSync(path.join(tmpdir(), 'ha-test-'));
after(() => rmSync(dir, { recursive: true, force: true }));
const s = parseTemperatureSettings({ sensor: 'sensor.office_temperature', toggle: 'switch.office_light' });

describe('homeassistant units', () => {
  it('websocket URL from the HA address', () => {
    assert.equal(websocketUrl('http://homeassistant.local:8123'), 'ws://homeassistant.local:8123/api/websocket');
    assert.equal(websocketUrl('https://ha.example/base/'), 'wss://ha.example/base/api/websocket');
    assert.equal(websocketUrl('ftp://x'), null);
    assert.equal(websocketUrl('not a url'), null);
  });

  it('settings validate entity ids and default the bar range', () => {
    assert.deepEqual(s, { sensor: 'sensor.office_temperature', toggle: 'switch.office_light', label: '', min: 10, max: 30 });
    assert.equal(parseTemperatureSettings({ sensor: 'bad id; x' }).sensor, '');
  });

  it('tile: value with comma and unit, light state, offline/unconfigured/auth error', () => {
    assert.equal(formatValue(18.94), '18.9');
    const on = temperatureTile(s, 'connected', { state: '18.9', attributes: { unit_of_measurement: '°C' } }, { state: 'on', attributes: {} });
    assert.deepEqual([on.value, on.unit, on.name, on.status, on.statusTone], ['18.9', '°C', 'Office', 'light on', 'warn']);
    assert.ok(on.bar && Math.abs(on.bar.fraction - 0.445) < 0.001);
    assert.equal(temperatureTile(s, 'connected', { state: '21', attributes: {} }, { state: 'off', attributes: {} }).status, 'light off');
    assert.equal(temperatureTile(s, 'offline', undefined, undefined).tone, 'offline');
    assert.equal(temperatureTile(s, 'connected', { state: 'unavailable', attributes: {} }, undefined).status, 'no data');
    assert.equal(temperatureTile({ ...s, sensor: '' }, 'connected', undefined, undefined).status, 'set in PI');
    assert.equal(temperatureTile(s, 'auth_error', undefined, undefined).status, 'bad token');
    assert.equal(temperatureTile({ ...s, label: 'Salon' }, 'offline', undefined, undefined).name, 'Salon');
  });

  it('reads HA Map settings only when complete', async () => {
    const f = path.join(dir, 'ha-map.json');
    writeFileSync(f, JSON.stringify({ haUrl: 'http://homeassistant.local:8123', token: 't', maxZoom: 16 }));
    assert.deepEqual(await readHaMapSettings(f), { haUrl: 'http://homeassistant.local:8123', token: 't' });
    writeFileSync(f, JSON.stringify({ haUrl: 'x' }));
    assert.equal(await readHaMapSettings(f), null);
    assert.equal(await readHaMapSettings(path.join(dir, 'missing.json')), null);
  });
});

describe('PI entity choices', async () => {
  const { entityChoices } = await import('../src/actions/temperature.ts');
  it('only temperature sensors and toggleable entities, sorted by friendly name', () => {
    const states = new Map([
      ['sensor.b_temp', { state: '20', attributes: { device_class: 'temperature', friendly_name: 'Biuro' } }],
      ['sensor.a_temp', { state: '20', attributes: { unit_of_measurement: '°C', friendly_name: 'Aneks' } }],
      ['sensor.humidity', { state: '40', attributes: { device_class: 'humidity', unit_of_measurement: '%' } }],
      ['switch.cave', { state: 'on', attributes: { friendly_name: 'Office light' } }],
      ['light.l', { state: 'off', attributes: {} }],
      ['automation.x', { state: 'on', attributes: {} }],
    ]);
    const c = entityChoices(states);
    assert.deepEqual(c.temperature, [{ id: 'sensor.a_temp', name: 'Aneks' }, { id: 'sensor.b_temp', name: 'Biuro' }]);
    assert.deepEqual(c.toggles.map((t) => t.id), ['light.l', 'switch.cave']);
  });
});
