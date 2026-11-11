// Built bundle against a fake OpenDeck, synthetic libraries, a fake steam binary and a fake /proc.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { type WebSocket, WebSocketServer } from 'ws';
import { makeLibraries, makeProc } from './fixtures.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundle = path.join(root, 'com.miwoli.games.sdPlugin', 'bin', 'plugin.cjs');
const dir = mkdtempSync(path.join(tmpdir(), 'games-e2e-'));
after(() => rmSync(dir, { recursive: true, force: true }));
const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

it('recent slots, launch, library, game mode, close game state', { skip: !existsSync(bundle) && 'run the build first', timeout: 20_000 }, async () => {
  const paths = await makeLibraries(path.join(dir, 'lib'));
  const proc = makeProc(path.join(dir, 'proc-empty'), [{ pid: 10, ppid: 1, cmd: ['steam'] }]);
  const logPath = path.join(dir, 'launch.log');
  writeFileSync(logPath, '');

  const wss = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  await new Promise<void>((r) => wss.once('listening', () => r()));
  const images = new Map<string, string>();
  const alerts: string[] = [];
  let globalSettings: Record<string, unknown> = {};
  let deck: WebSocket | undefined;
  wss.on('connection', (ws) => {
    deck = ws;
    ws.on('message', (d) => {
      const m = JSON.parse(d.toString()) as { event: string; context?: string; payload?: Record<string, unknown> & { image?: string } };
      if (m.event === 'setImage' && m.context && m.payload?.image) images.set(m.context, Buffer.from(m.payload.image.split(',')[1] ?? '', 'base64').toString('utf8'));
      if (m.event === 'showAlert' && m.context) alerts.push(m.context);
      if (m.event === 'getGlobalSettings') ws.send(JSON.stringify({ event: 'didReceiveGlobalSettings', payload: { settings: globalSettings } }));
      if (m.event === 'setGlobalSettings' && m.payload) globalSettings = m.payload;
    });
  });
  const send = (event: string, action: string, context: string, column: number, settings: object = {}): void => {
    deck?.send(JSON.stringify({ event, action: `com.miwoli.games.${action}`, context, device: 'sd', payload: { settings, coordinates: { row: 2, column }, controller: 'Keypad', state: 0, isInMultiAction: false } }));
  };
  const texts = (context: string): string => [...(images.get(context) ?? '').matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]).join(' / ');
  const launches = (): string[][] => readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as string[]);

  const child = spawn(process.execPath, [bundle, '-port', String((wss.address() as AddressInfo).port), '-pluginUUID', 'com.miwoli.games.sdPlugin', '-registerEvent', 'registerPlugin', '-info', '{}'], {
    env: {
      ...process.env,
      OPENDECK_STEAM_ROOT: paths.steamRoot, OPENDECK_LUTRIS_DIR: paths.lutrisDir, OPENDECK_PROC_ROOT: proc,
      OPENDECK_STEAM_BIN: path.join(root, 'test', 'fake-launcher.mjs'), OPENDECK_LUTRIS_BIN: path.join(root, 'test', 'fake-launcher.mjs'),
      FAKE_LAUNCH_LOG: logPath,
    },
    stdio: 'ignore',
  });
  try {
    await wait(500);
    for (let c = 0; c < 5; c++) send('willAppear', 'recent', `r${c}`, c);
    send('willAppear', 'launcher', 'steam', 2, { platform: 'steam' });
    send('willAppear', 'gamemode', 'gm', 3);
    send('willAppear', 'closegame', 'close', 4);
    await wait(900);
    assert.match(texts('r0'), /^Beta &quot;Quot…? \/ Steam$/, 'newest game in slot 1 (long name ellipsized)');
    assert.ok(images.get('r0')?.includes('xlink:href="data:image/jpeg;base64,'), 'cover embedded');
    assert.equal(texts('r1'), 'Witcher X / Lutris');
    assert.equal(texts('r4'), 'Gamma / Steam');
    assert.equal(texts('steam'), 'Steam / Library');
    assert.equal(texts('gm'), 'Game mode / Off');
    assert.equal(texts('close'), 'Close game / no game');

    send('keyDown', 'recent', 'r0', 0);
    send('keyDown', 'recent', 'r1', 1);
    send('keyDown', 'launcher', 'steam', 2, { platform: 'steam' });
    await wait(600);
    assert.deepEqual(launches().map((a) => a.join(' ')).sort(), ['lutris:rungameid/2', 'steam://open/games', 'steam://rungameid/200']);

    send('keyDown', 'gamemode', 'gm', 3);
    await wait(300);
    assert.equal(texts('gm'), 'Game mode / On');
    assert.equal(globalSettings['gameMode'], true);

    send('keyDown', 'closegame', 'close', 4);
    await wait(200);
    assert.ok(alerts.includes('close'), 'nothing to close -> alert');
  } finally {
    child.kill('SIGTERM');
    wss.close();
  }
});
