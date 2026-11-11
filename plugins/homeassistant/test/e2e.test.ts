// Built bundle against a fake OpenDeck and a fake Home Assistant WebSocket API.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { type WebSocket, WebSocketServer } from 'ws';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundle = path.join(root, 'com.miwoli.homeassistant.sdPlugin', 'bin', 'plugin.cjs');
const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const SENSOR = 'sensor.office_temperature';
const LIGHT = 'switch.office_light';

it('temperature from HA, live updates, toggle, bad token', { skip: !existsSync(bundle) && 'run the build first', timeout: 20_000 }, async () => {
  // fake HA
  const ha = new WebSocketServer({ port: 0, host: '127.0.0.1', path: '/api/websocket' });
  await new Promise<void>((r) => ha.once('listening', () => r()));
  const services: Array<Record<string, unknown>> = [];
  let haSocket: WebSocket | undefined;
  let validToken = 'good';
  ha.on('connection', (ws) => {
    haSocket = ws;
    ws.send(JSON.stringify({ type: 'auth_required' }));
    ws.on('message', (d) => {
      const m = JSON.parse(d.toString()) as Record<string, unknown>;
      if (m['type'] === 'auth') {
        ws.send(JSON.stringify({ type: m['access_token'] === validToken ? 'auth_ok' : 'auth_invalid' }));
      } else if (m['type'] === 'get_states') {
        ws.send(JSON.stringify({ id: m['id'], type: 'result', success: true, result: [
          { entity_id: SENSOR, state: '18.9', attributes: { unit_of_measurement: '°C' } },
          { entity_id: LIGHT, state: 'on', attributes: {} },
        ] }));
      } else if (m['type'] === 'call_service') {
        services.push(m);
      } else if (m['type'] === 'subscribe_events') {
        ws.send(JSON.stringify({ id: m['id'], type: 'result', success: true, result: null }));
      }
    });
  });
  const haUrl = `http://127.0.0.1:${(ha.address() as AddressInfo).port}`;

  // fake OpenDeck
  const wss = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  await new Promise<void>((r) => wss.once('listening', () => r()));
  const images = new Map<string, string>();
  let globalSettings: Record<string, unknown> = { haUrl, token: 'good' };
  let deck: WebSocket | undefined;
  wss.on('connection', (ws) => {
    deck = ws;
    ws.on('message', (d) => {
      const m = JSON.parse(d.toString()) as { event: string; context?: string; payload?: Record<string, unknown> & { image?: string } };
      if (m.event === 'setImage' && m.context && m.payload?.image) images.set(m.context, Buffer.from(m.payload.image.split(',')[1] ?? '', 'base64').toString('utf8'));
      if (m.event === 'getGlobalSettings') ws.send(JSON.stringify({ event: 'didReceiveGlobalSettings', payload: { settings: globalSettings } }));
    });
  });
  const settings = { sensor: SENSOR, toggle: LIGHT };
  const send = (event: string): void => {
    deck?.send(JSON.stringify({ event, action: 'com.miwoli.homeassistant.temperature', context: 't', device: 'sd', payload: { settings, coordinates: { row: 2, column: 1 }, controller: 'Keypad', state: 0, isInMultiAction: false } }));
  };
  const texts = (): string => [...(images.get('t') ?? '').matchAll(/<text[^>]*>(.*?)<\/text>/g)].map((m) => (m[1] ?? '').replace(/<[^>]+>/g, '')).join(' / ');

  const child = spawn(process.execPath, [bundle, '-port', String((wss.address() as AddressInfo).port), '-pluginUUID', 'com.miwoli.homeassistant.sdPlugin', '-registerEvent', 'registerPlugin', '-info', '{}'], { stdio: 'ignore' });
  try {
    await wait(400);
    send('willAppear');
    await wait(800);
    assert.equal(texts(), '18.9°C / Office / light on');

    haSocket?.send(JSON.stringify({ type: 'event', event: { event_type: 'state_changed', data: { entity_id: SENSOR, new_state: { entity_id: SENSOR, state: '22.4', attributes: { unit_of_measurement: '°C' } } } } }));
    haSocket?.send(JSON.stringify({ type: 'event', event: { event_type: 'state_changed', data: { entity_id: LIGHT, new_state: { entity_id: LIGHT, state: 'off', attributes: {} } } } }));
    await wait(400);
    assert.equal(texts(), '22.4°C / Office / light off');

    send('keyDown');
    await wait(300);
    assert.deepEqual({ ...services[0], id: 0 }, { id: 0, type: 'call_service', domain: 'homeassistant', service: 'toggle', target: { entity_id: LIGHT } });

    // HA restarts -> offline tile, then the plugin reconnects by itself
    haSocket?.terminate();
    await wait(300);
    assert.equal(texts(), '-- / Office / Offline');
    await wait(1500);
    assert.equal(texts(), '18.9°C / Office / light on');

    // token revoked
    validToken = 'other';
    globalSettings = { haUrl, token: 'good2' };
    deck?.send(JSON.stringify({ event: 'didReceiveGlobalSettings', payload: { settings: globalSettings } }));
    await wait(800);
    assert.equal(texts(), '! / Office / bad token');
  } finally {
    child.kill('SIGTERM');
    wss.close();
    ha.close();
  }
});
