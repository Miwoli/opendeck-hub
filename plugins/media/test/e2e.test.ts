// Built bundle against a fake OpenDeck and a fake busctl.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { type WebSocket, WebSocketServer } from 'ws';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundle = path.join(root, 'com.miwoli.media.sdPlugin', 'bin', 'plugin.cjs');
const dir = mkdtempSync(path.join(tmpdir(), 'media-e2e-'));
after(() => rmSync(dir, { recursive: true, force: true }));
const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const ACTION = 'com.miwoli.media.player';

it('now playing, play/pause, long press next, privacy of logs', { skip: !existsSync(bundle) && 'run the build first', timeout: 20_000 }, async () => {
  const art = path.join(dir, 'art.png');
  writeFileSync(art, Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'));
  const statePath = path.join(dir, 'mpris.json');
  const logPath = path.join(dir, 'calls.log');
  writeFileSync(logPath, '');
  writeFileSync(statePath, JSON.stringify({ players: [
    { bus: 'org.mpris.MediaPlayer2.firefox.instance_1_9', status: 'Playing', title: 'Secret', artist: 'Someone', artUrl: pathToFileURL(art).href },
    { bus: 'org.mpris.MediaPlayer2.spotify', status: 'Paused', title: 'Other', artist: 'X', artUrl: 'https://i.scdn.co/image/zzz', trackType: 's' },
  ] }));

  const wss = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  await new Promise<void>((r) => wss.once('listening', () => r()));
  const images = new Map<string, string>();
  let deck: WebSocket | undefined;
  wss.on('connection', (ws) => {
    deck = ws;
    ws.on('message', (d) => {
      const m = JSON.parse(d.toString()) as { event: string; context?: string; payload?: { image?: string } };
      if (m.event === 'setImage' && m.context && m.payload?.image) images.set(m.context, Buffer.from(m.payload.image.split(',')[1] ?? '', 'base64').toString('utf8'));
      if (m.event === 'getGlobalSettings') ws.send(JSON.stringify({ event: 'didReceiveGlobalSettings', payload: { settings: {} } }));
    });
  });
  const send = (event: string, context: string, settings: object = {}): void => {
    deck?.send(JSON.stringify({ event, action: ACTION, context, device: 'sd', payload: { settings, coordinates: { row: 1, column: 1 }, controller: 'Keypad', state: 0, isInMultiAction: false } }));
  };
  const texts = (context: string): string => [...(images.get(context) ?? '').matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]).join(' / ');

  let stdout = '';
  const child = spawn(process.execPath, [bundle, '-port', String((wss.address() as AddressInfo).port), '-pluginUUID', 'com.miwoli.media.sdPlugin', '-registerEvent', 'registerPlugin', '-info', '{}'], {
    env: { ...process.env, OPENDECK_BUSCTL: path.join(root, 'test', 'fake-busctl.mjs'), FAKE_MPRIS: statePath, FAKE_MPRIS_LOG: logPath, XDG_CACHE_HOME: dir },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
  try {
    await wait(400);
    send('willAppear', 'auto');
    send('willAppear', 'spot', { preferred: 'spotify', longPress: 'next' });
    await wait(900);
    assert.equal(texts('auto'), 'Secret / Someone', 'automatic = the playing player');
    assert.ok(images.get('auto')?.includes('xlink:href="data:image/png;base64,'), 'local cover embedded');
    assert.equal(texts('spot'), 'Other / Paused', 'preferred player even when paused');
    assert.ok(!images.get('spot')?.includes('data:image/png'), 'no remote cover without consent');

    send('keyDown', 'spot');
    send('keyUp', 'spot');
    await wait(900);
    assert.ok(readFileSync(logPath, 'utf8').includes('"call","org.mpris.MediaPlayer2.spotify","/org/mpris/MediaPlayer2","org.mpris.MediaPlayer2.Player","PlayPause"'));
    assert.equal(texts('spot'), 'Other / X', 'now playing after play/pause');

    send('keyDown', 'spot');
    await wait(600);
    send('keyUp', 'spot');
    await wait(900);
    assert.ok(readFileSync(logPath, 'utf8').includes('"Next"'), 'long press = next');
    assert.equal(texts('spot'), 'Other+ / X');

    // automatic tile: double tap switches to the other active player, single tap then waits for a possible second one
    assert.equal(texts('auto'), 'Other+ / X', 'automatic tile follows Spotify, which started playing last');
    assert.ok(images.get('auto')?.includes(`fill="#FFB547"`), 'pips: two active players');
    send('keyDown', 'auto');
    send('keyUp', 'auto');
    await wait(80);
    send('keyDown', 'auto');
    send('keyUp', 'auto');
    await wait(300);
    assert.equal(texts('auto'), 'Secret / Firefox', 'switched, status names the player');
    assert.ok(stdout.includes('switched to Firefox'));
    const calls = (): string[] => readFileSync(logPath, 'utf8').split('\n').filter((l) => l.includes('"call"'));
    const before = calls().length;
    send('keyDown', 'auto');
    send('keyUp', 'auto');
    await wait(100);
    assert.equal(calls().length, before, 'single tap delayed while a double tap is possible');
    await wait(900);
    assert.ok(calls()[before]?.includes('"org.mpris.MediaPlayer2.firefox.instance_1_9","/org/mpris/MediaPlayer2","org.mpris.MediaPlayer2.Player","PlayPause"'));

    assert.ok(!stdout.includes('Secret') && !stdout.includes('Other'), 'titles never logged');
    assert.ok(stdout.includes('players: Firefox:Playing, Spotify'), 'log has players and status only');
  } finally {
    child.kill('SIGTERM');
    wss.close();
  }
});
