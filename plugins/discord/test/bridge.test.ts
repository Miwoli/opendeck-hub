import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { type Server, type Socket, createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { BridgeClient, type DiscordState, defaultSocketPath, parseStateLine } from '../src/bridge.ts';

const dir = mkdtempSync(path.join(tmpdir(), 'deckbridge-'));
after(() => rmSync(dir, { recursive: true, force: true }));
const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function fakeBridge(socketPath: string): Promise<{ server: Server; clients: Socket[]; received: string[] }> {
  const clients: Socket[] = [];
  const received: string[] = [];
  const server = createServer((c) => {
    clients.push(c);
    c.setEncoding('utf8');
    c.on('data', (d: string) => received.push(...d.split('\n').filter(Boolean)));
  });
  return new Promise((r) => server.listen(socketPath, () => r({ server, clients, received })));
}

const state = (patch: Partial<DiscordState> = {}): string =>
  `${JSON.stringify({ state: { inVoice: true, selfMute: false, selfDeaf: false, serverMute: false, serverDeaf: false, mode: 'VOICE_ACTIVITY', ptt: false, ...patch } })}\n`;

describe('parseStateLine', () => {
  it('validates and defaults', () => {
    assert.equal(parseStateLine('nope'), null);
    assert.equal(parseStateLine('{"x":1}'), null);
    assert.deepEqual(parseStateLine('{"state":{"selfMute":true,"mode":5}}'), {
      inVoice: false, selfMute: true, selfDeaf: false, serverMute: false, serverDeaf: false, mode: 'VOICE_ACTIVITY', ptt: false,
    });
  });
  it('default socket path lives in XDG_RUNTIME_DIR', () => {
    assert.equal(defaultSocketPath({ XDG_RUNTIME_DIR: '/run/user/1000' }), '/run/user/1000/opendeck-discord.sock');
  });
});

describe('BridgeClient', () => {
  it('is offline without a socket and connects once the bridge appears', async () => {
    const socketPath = path.join(dir, 'a.sock');
    const bridge = new BridgeClient({ socketPath, baseDelayMs: 20, maxDelayMs: 40 });
    const seen: Array<DiscordState | null> = [];
    bridge.on('state', (s) => seen.push(s));
    // read through a function: assert.equal narrows a getter to `null` for the rest of the test
    const current = (): DiscordState | null => bridge.state;
    bridge.start();
    await wait(60);
    assert.equal(current(), null);
    assert.equal(bridge.send('toggleMute'), false);

    const fake = await fakeBridge(socketPath);
    await wait(150);
    assert.ok(fake.received.includes('{"cmd":"getState"}'), 'asks for state on connect');
    fake.clients[0]?.write(state({ selfMute: true }));
    await wait(30);
    assert.equal(current()?.selfMute, true);
    assert.ok(bridge.send('toggleMute'));
    await wait(30);
    assert.ok(fake.received.includes('{"cmd":"toggleMute"}'));

    // Vesktop quits -> offline, then reconnects when it is back
    for (const c of fake.clients) c.destroy();
    await new Promise<void>((r) => fake.server.close(() => r()));
    await wait(30);
    assert.equal(current(), null);
    assert.equal(seen.at(-1), null);
    bridge.stop();
  });

  it('handles split and multiple lines in one chunk', async () => {
    const socketPath = path.join(dir, 'b.sock');
    const fake = await fakeBridge(socketPath);
    const bridge = new BridgeClient({ socketPath });
    bridge.start();
    await wait(50);
    const two = state({ selfDeaf: true }) + state({ selfDeaf: false, ptt: true });
    fake.clients[0]?.write(two.slice(0, 10));
    await wait(10);
    fake.clients[0]?.write(two.slice(10));
    await wait(30);
    assert.equal(bridge.state?.ptt, true);
    bridge.stop();
    await new Promise<void>((r) => fake.server.close(() => r()));
  });
});
