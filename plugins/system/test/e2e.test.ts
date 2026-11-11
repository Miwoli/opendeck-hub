// Built bundle against a fake OpenDeck; systemctl and spectacle are replaced by a logging fake.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { type WebSocket, WebSocketServer } from 'ws';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundle = path.join(root, 'com.miwoli.system.sdPlugin', 'bin', 'plugin.cjs');
const fake = path.join(root, 'test', 'fake-cmd.mjs');
const dir = mkdtempSync(path.join(tmpdir(), 'system-e2e-'));
after(() => rmSync(dir, { recursive: true, force: true }));
const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

it('power off hold/confirm, screenshot, clock', { skip: !existsSync(bundle) && 'run the build first', timeout: 25_000 }, async () => {
  const logPath = path.join(dir, 'calls.log');
  writeFileSync(logPath, '');
  const shots = path.join(dir, 'shots');

  const wss = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  await new Promise<void>((r) => wss.once('listening', () => r()));
  const images = new Map<string, string>();
  let deck: WebSocket | undefined;
  wss.on('connection', (ws) => {
    deck = ws;
    ws.on('message', (d) => {
      const m = JSON.parse(d.toString()) as { event: string; context?: string; payload?: { image?: string } };
      if (m.event === 'setImage' && m.context && m.payload?.image) images.set(m.context, Buffer.from(m.payload.image.split(',')[1] ?? '', 'base64').toString('utf8'));
    });
  });
  const send = (event: string, action: string, context: string, settings: object = {}): void => {
    deck?.send(JSON.stringify({ event, action: `com.miwoli.system.${action}`, context, device: 'sd', payload: { settings, coordinates: { row: 2, column: 3 }, controller: 'Keypad', state: 0, isInMultiAction: false } }));
  };
  const texts = (context: string): string => [...(images.get(context) ?? '').matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]).join(' / ');
  const calls = (): string[][] => readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as string[]);

  const child = spawn(process.execPath, [bundle, '-port', String((wss.address() as AddressInfo).port), '-pluginUUID', 'com.miwoli.system.sdPlugin', '-registerEvent', 'registerPlugin', '-info', '{}'], {
    env: { ...process.env, OPENDECK_SYSTEMCTL: fake, OPENDECK_SPECTACLE: fake, FAKE_CMD_LOG: logPath },
    stdio: 'ignore',
  });
  try {
    await wait(400);
    send('willAppear', 'poweroff', 'pw');
    send('willAppear', 'screenshot', 'shot', { mode: 'current', folder: shots });
    send('willAppear', 'clock', 'clk');
    await wait(300);
    assert.equal(texts('pw'), 'Power / hold 1 s');
    assert.equal(texts('shot'), 'Screenshot / Monitor');
    assert.match(texts('clk'), /^\d\d:\d\d \/ \S+ \/ \d\d\.\d\d\.\d{4}$/);

    // short press does nothing
    send('keyDown', 'poweroff', 'pw');
    await wait(300);
    send('keyUp', 'poweroff', 'pw');
    await wait(200);
    assert.equal(texts('pw'), 'Power / hold 1 s');
    // hold 1 s -> confirm -> press -> fake systemctl poweroff
    send('keyDown', 'poweroff', 'pw');
    await wait(600);
    assert.equal(texts('pw'), 'Power / hold…');
    await wait(500);
    send('keyUp', 'poweroff', 'pw');
    await wait(200);
    assert.equal(texts('pw'), 'Shut down? / press · 3');
    assert.equal(calls().length, 0, 'nothing executed before confirming');
    send('keyDown', 'poweroff', 'pw');
    send('keyUp', 'poweroff', 'pw');
    await wait(400);
    assert.deepEqual(calls()[0], ['poweroff']);
    assert.equal(texts('pw'), 'Power / hold 1 s');

    send('keyDown', 'screenshot', 'shot', { mode: 'current', folder: shots });
    await wait(600);
    const shot = calls().at(-1) ?? [];
    assert.deepEqual(shot.slice(0, 4), ['-b', '-n', '-m', '-o']);
    assert.equal(readdirSync(shots).length, 1);
    assert.equal(texts('shot'), 'Screenshot / Saved');
    await wait(2200);
    assert.equal(texts('shot'), 'Screenshot / Monitor');
  } finally {
    child.kill('SIGTERM');
    wss.close();
  }
});
