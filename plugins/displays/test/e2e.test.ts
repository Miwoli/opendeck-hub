// Built bundle against a fake OpenDeck (WebSocket) and a fake kscreen-doctor (no real screens are touched).

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { type WebSocket, WebSocketServer } from 'ws';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundle = path.join(root, 'com.miwoli.displays.sdPlugin', 'bin', 'plugin.cjs');
const dir = mkdtempSync(path.join(tmpdir(), 'displays-e2e-'));
after(() => rmSync(dir, { recursive: true, force: true }));
const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const ACTION = 'com.miwoli.displays.layout';

it('three layout tiles: state, switching, remembered extend', { skip: !existsSync(bundle) && 'run the build first', timeout: 20_000 }, async () => {
  const statePath = path.join(dir, 'state.json');
  const logPath = path.join(dir, 'calls.log');
  writeFileSync(statePath, JSON.stringify({ dp: true, hdmi: true, dpPriority: 1, hdmiPriority: 2 }));
  writeFileSync(logPath, '');

  const wss = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  await new Promise<void>((r) => wss.once('listening', () => r()));
  const images = new Map<string, string>();
  const toPi: unknown[] = [];
  let globalSettings: unknown = null;
  let deck: WebSocket | undefined;
  wss.on('connection', (ws) => {
    deck = ws;
    ws.on('message', (d) => {
      const m = JSON.parse(d.toString()) as { event: string; context?: string; payload?: { image?: string } & Record<string, unknown> };
      if (m.event === 'setImage' && m.context && m.payload?.image) images.set(m.context, Buffer.from(m.payload.image.split(',')[1] ?? '', 'base64').toString('utf8'));
      if (m.event === 'getGlobalSettings') ws.send(JSON.stringify({ event: 'didReceiveGlobalSettings', payload: { settings: globalSettings ?? {} } }));
      if (m.event === 'setGlobalSettings') globalSettings = m.payload;
      if (m.event === 'sendToPropertyInspector') toPi.push(m.payload);
    });
  });
  const send = (event: string, context: string, column: number, settings: object): void => {
    deck?.send(JSON.stringify({ event, action: ACTION, context, device: 'sd', payload: { settings, coordinates: { row: 1, column }, controller: 'Keypad', state: 0, isInMultiAction: false } }));
  };
  const status = (context: string): string | undefined => [...(images.get(context) ?? '').matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]).join(' / ');

  const child = spawn(process.execPath, [bundle, '-port', String((wss.address() as AddressInfo).port), '-pluginUUID', 'com.miwoli.displays.sdPlugin', '-registerEvent', 'registerPlugin', '-info', '{}'], {
    env: { ...process.env, OPENDECK_KSCREEN_DOCTOR: path.join(root, 'test', 'fake-kscreen-doctor.mjs'), FAKE_KSCREEN_STATE: statePath, FAKE_KSCREEN_LOG: logPath },
    stdio: 'ignore',
  });
  try {
    await wait(400);
    send('willAppear', 'e1', 2, { layout: 'single', output: 'DP-2' });
    send('willAppear', 'ext', 3, { layout: 'extend' });
    send('willAppear', 'e2', 4, { layout: 'single', output: 'HDMI-A-1' });
    send('willAppear', 'unset', 0, {});
    await wait(800);
    assert.equal(status('e1'), 'Screen 1 / Switch');
    assert.equal(status('ext'), 'Extend / Active');
    assert.equal(status('e2'), 'Screen 2 / Switch');
    assert.equal(status('unset'), 'Screen / set in PI');
    assert.ok(JSON.stringify(globalSettings).includes('"name":"DP-2","x":0,"y":631'), 'extended layout remembered in global settings');

    send('keyDown', 'e2', 4, { layout: 'single', output: 'HDMI-A-1' });
    await wait(2600);
    const calls = readFileSync(logPath, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as string[]);
    assert.ok(calls.some((c) => c.join(' ') === 'output.HDMI-A-1.enable output.HDMI-A-1.priority.1 output.DP-2.disable'));
    assert.equal(status('e2'), 'Screen 2 / Active');
    assert.equal(status('ext'), 'Extend / Switch');

    send('keyDown', 'ext', 3, { layout: 'extend' });
    await wait(2600);
    const last = readFileSync(logPath, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as string[]).filter((c) => c[0] !== '-j').at(-1);
    assert.deepEqual(last?.slice(0, 3), ['output.DP-2.enable', 'output.DP-2.position.0,631', 'output.DP-2.priority.1']);
    assert.equal(status('ext'), 'Extend / Active');

    send('propertyInspectorDidAppear', 'e1', 2, {});
    await wait(400);
    assert.ok(JSON.stringify(toPi.at(-1)).includes('"name":"HDMI-A-1"'), 'PI receives detected outputs');
  } finally {
    child.kill('SIGTERM');
    wss.close();
  }
});
