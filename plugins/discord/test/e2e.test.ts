// Built bundle against a fake OpenDeck (WebSocket) and a fake DeckBridge (Unix socket).

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Socket } from 'node:net';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundle = path.join(root, 'com.miwoli.discord.sdPlugin', 'bin', 'plugin.cjs');
const dir = mkdtempSync(path.join(tmpdir(), 'discord-e2e-'));
after(() => rmSync(dir, { recursive: true, force: true }));
const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function decode(image: string): string {
  return Buffer.from(image.split(',')[1] ?? '', 'base64').toString('utf8');
}

it('mic/headphones/ptt end to end', { skip: !existsSync(bundle) && 'run the build first' }, async () => {
  // fake DeckBridge
  const commands: string[] = [];
  let bridgeClient: Socket | undefined;
  const bridge = createServer((c) => {
    bridgeClient = c;
    c.setEncoding('utf8');
    c.on('data', (d: string) => commands.push(...d.split('\n').filter(Boolean).map((l) => (JSON.parse(l) as { cmd: string }).cmd)));
  });
  await new Promise<void>((r) => bridge.listen(path.join(dir, 'opendeck-discord.sock'), () => r()));
  const pushState = (patch: object): void => {
    bridgeClient?.write(`${JSON.stringify({ state: { inVoice: true, selfMute: false, selfDeaf: false, serverMute: false, serverDeaf: false, mode: 'VOICE_ACTIVITY', ptt: false, ...patch } })}\n`);
  };

  // fake OpenDeck
  const wss = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  await new Promise<void>((r) => wss.once('listening', () => r()));
  const images = new Map<string, string>();
  const alerts: string[] = [];
  let deck: import('ws').WebSocket | undefined;
  wss.on('connection', (ws) => {
    deck = ws;
    ws.on('message', (d) => {
      const m = JSON.parse(d.toString()) as { event: string; context?: string; payload?: { image?: string } };
      if (m.event === 'setImage' && m.context && m.payload?.image) images.set(m.context, decode(m.payload.image));
      if (m.event === 'showAlert' && m.context) alerts.push(m.context);
    });
  });
  const send = (event: string, action: string, context: string, column: number): void => {
    deck?.send(JSON.stringify({ event, action, context, device: 'sd', payload: { settings: {}, coordinates: { row: 0, column }, controller: 'Keypad', state: 0, isInMultiAction: false } }));
  };

  const child = spawn(process.execPath, [bundle, '-port', String((wss.address() as AddressInfo).port), '-pluginUUID', 'com.miwoli.discord.sdPlugin', '-registerEvent', 'registerPlugin', '-info', '{}'], {
    env: { ...process.env, XDG_RUNTIME_DIR: dir },
    stdio: 'ignore',
  });
  try {
    await wait(400);
    send('willAppear', 'com.miwoli.discord.mic', 'mic', 0);
    send('willAppear', 'com.miwoli.discord.headphones', 'hp', 1);
    send('willAppear', 'com.miwoli.discord.ptt', 'ptt', 2);
    await wait(300);
    assert.ok(commands.includes('getState'), 'bridge started when tiles appeared');
    assert.ok(images.get('mic')?.includes('>offline<'), 'offline until the first state');

    pushState({});
    await wait(200);
    assert.ok(images.get('mic')?.includes('>On<'));
    assert.ok(images.get('hp')?.includes('>On<'));
    assert.ok(images.get('ptt')?.includes('>Hold<'));

    send('keyDown', 'com.miwoli.discord.mic', 'mic', 0);
    send('keyDown', 'com.miwoli.discord.headphones', 'hp', 1);
    await wait(100);
    assert.deepEqual(commands.filter((c) => c !== 'getState'), ['toggleMute', 'toggleDeafen']);
    pushState({ selfMute: true, selfDeaf: true });
    await wait(200);
    assert.ok(images.get('mic')?.includes('>Muted<'));
    assert.ok(images.get('hp')?.includes('>Muted<'));

    pushState({ selfMute: true });
    await wait(150);
    send('keyDown', 'com.miwoli.discord.ptt', 'ptt', 2);
    await wait(200);
    assert.ok(images.get('ptt')?.includes('>Talking<'), 'instant feedback while held');
    send('keyUp', 'com.miwoli.discord.ptt', 'ptt', 2);
    await wait(200);
    assert.deepEqual(commands.slice(-2), ['pttDown', 'pttUp']);
    assert.ok(images.get('ptt')?.includes('>Hold<'));

    pushState({ mode: 'PUSH_TO_TALK' });
    await wait(150);
    send('keyDown', 'com.miwoli.discord.ptt', 'ptt', 2);
    await wait(100);
    assert.ok(alerts.includes('ptt'), 'PTT refused in Discord PTT mode');
    assert.ok(images.get('ptt')?.includes('>set VAD<'));

    // Vesktop closes -> offline tiles, key press -> alert
    bridgeClient?.destroy();
    await new Promise<void>((r) => bridge.close(() => r()));
    await wait(200);
    assert.ok(images.get('hp')?.includes('>offline<'));
    send('keyDown', 'com.miwoli.discord.mic', 'mic', 0);
    await wait(100);
    assert.ok(alerts.includes('mic'));
  } finally {
    child.kill('SIGTERM');
    wss.close();
  }
});
