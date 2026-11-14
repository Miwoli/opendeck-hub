// OpenActionClient against a fake OpenDeck WebSocket server.

import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, it } from 'node:test';
import { type WebSocket, WebSocketServer } from 'ws';
import { parsePluginArgs } from '../src/args.ts';
import { type ActionHandler, OpenActionClient } from '../src/client.ts';
import { type InstanceEvent, isObject, parseInboundEvent } from '../src/protocol.ts';

interface FakeDeck {
  port: number;
  received: Array<Record<string, unknown>>;
  sockets: WebSocket[];
  send(msg: object): void;
  next(predicate: (m: Record<string, unknown>) => boolean, timeoutMs?: number): Promise<Record<string, unknown>>;
  close(): Promise<void>;
}

async function fakeDeck(port = 0): Promise<FakeDeck> {
  const wss = new WebSocketServer({ port, host: '127.0.0.1' });
  await new Promise<void>((r) => wss.once('listening', () => r()));
  const received: Array<Record<string, unknown>> = [];
  const sockets: WebSocket[] = [];
  const waiters: Array<{ p: (m: Record<string, unknown>) => boolean; r: (m: Record<string, unknown>) => void }> = [];
  wss.on('connection', (ws) => {
    sockets.push(ws);
    ws.on('message', (data) => {
      const msg: unknown = JSON.parse(data.toString());
      if (!isObject(msg)) return;
      received.push(msg);
      for (const w of [...waiters]) {
        if (w.p(msg)) {
          waiters.splice(waiters.indexOf(w), 1);
          w.r(msg);
        }
      }
    });
  });
  return {
    port: (wss.address() as AddressInfo).port,
    received,
    sockets,
    send: (msg) => {
      for (const s of sockets) if (s.readyState === s.OPEN) s.send(JSON.stringify(msg));
    },
    next: (p, timeoutMs = 2000) => {
      const found = received.find(p);
      if (found) return Promise.resolve(found);
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('timeout waiting for message')), timeoutMs);
        waiters.push({ p, r: (m) => (clearTimeout(t), resolve(m)) });
      });
    },
    close: () =>
      new Promise((r) => {
        for (const s of sockets) s.terminate();
        wss.close(() => r());
      }),
  };
}

const UUID = 'com.miwoli.test.sdPlugin';
const ACTION = 'com.miwoli.test.action';

function instance(event: string, context: string, extra: Record<string, unknown> = {}): object {
  return {
    event,
    action: ACTION,
    context,
    device: 'sd-1',
    payload: { settings: { a: 1 }, coordinates: { row: 1, column: 2 }, controller: 'Keypad', state: 0, isInMultiAction: false },
    ...extra,
  };
}

const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const c of cleanups.splice(0).reverse()) await c();
});

async function setup(options: ConstructorParameters<typeof OpenActionClient>[1] = {}): Promise<{ deck: FakeDeck; client: OpenActionClient }> {
  const deck = await fakeDeck();
  const client = new OpenActionClient(
    parsePluginArgs(['-port', String(deck.port), '-pluginUUID', UUID, '-registerEvent', 'registerPlugin', '-info', '{}']),
    options,
  );
  cleanups.push(() => deck.close());
  cleanups.push(() => client.close());
  return { deck, client };
}

describe('parsePluginArgs', () => {
  it('parses OpenDeck launch arguments', () => {
    const a = parsePluginArgs(['-port', '57116', '-pluginUUID', UUID, '-registerEvent', 'registerPlugin', '-info', '{"x":1}']);
    assert.equal(a.port, 57116);
    assert.equal(a.pluginUUID, UUID);
    assert.deepEqual(a.info, { x: 1 });
  });
  it('rejects missing or invalid arguments', () => {
    assert.throws(() => parsePluginArgs(['-port', '1']));
    assert.throws(() => parsePluginArgs(['-port', 'x', '-pluginUUID', 'u', '-registerEvent', 'r', '-info', '{}']));
  });
  it('tolerates invalid -info JSON', () => {
    assert.deepEqual(parsePluginArgs(['-port', '1', '-pluginUUID', 'u', '-registerEvent', 'r', '-info', 'nope']).info, {});
  });
});

describe('parseInboundEvent', () => {
  it('accepts instance events and defaults missing payload fields', () => {
    const ev = parseInboundEvent({ event: 'keyDown', action: 'a', context: 'c', device: 'd', payload: { settings: null } });
    assert.ok(ev && ev.event === 'keyDown');
    assert.deepEqual((ev as InstanceEvent).payload.settings, {});
    assert.deepEqual((ev as InstanceEvent).payload.coordinates, { row: -1, column: -1 });
  });
  it('rejects malformed or unknown events', () => {
    assert.equal(parseInboundEvent(null), null);
    assert.equal(parseInboundEvent({ event: 'keyDown', context: 'c' }), null);
    assert.equal(parseInboundEvent({ event: 'dialRotate', action: 'a', context: 'c', payload: {} }), null);
    assert.equal(parseInboundEvent({ event: 'sendToPlugin', action: 'a', context: 'c', payload: () => 1 }), null);
  });
});

describe('OpenActionClient', () => {
  it('registers with the plugin UUID on connect', async () => {
    const { deck, client } = await setup();
    client.connect();
    const reg = await deck.next((m) => m['event'] === 'registerPlugin');
    assert.equal(reg['uuid'], UUID);
  });

  it('routes events by action UUID and tracks visible contexts with coordinates', async () => {
    const { deck, client } = await setup();
    const seen: string[] = [];
    const handler: ActionHandler = {
      uuid: ACTION,
      willAppear: (ev) => void seen.push(`appear:${ev.context}:${ev.payload.coordinates.row},${ev.payload.coordinates.column}`),
      keyDown: (ev) => void seen.push(`down:${ev.context}`),
      willDisappear: (ev) => void seen.push(`gone:${ev.context}`),
    };
    client.register(handler, { uuid: 'other', keyDown: () => void seen.push('WRONG') });
    client.connect();
    await deck.next((m) => m['event'] === 'registerPlugin');
    deck.send(instance('willAppear', 'ctx1'));
    deck.send(instance('keyDown', 'ctx1'));
    await new Promise((r) => setTimeout(r, 50));
    assert.deepEqual(client.visibleInstances(ACTION).map((v) => v.context), ['ctx1']);
    deck.send(instance('willDisappear', 'ctx1'));
    await new Promise((r) => setTimeout(r, 50));
    assert.deepEqual(seen, ['appear:ctx1:1,2', 'down:ctx1', 'gone:ctx1']);
    assert.equal(client.visibleInstances().length, 0);
  });

  it('isolates handler exceptions', async () => {
    const { deck, client } = await setup();
    let after = false;
    client.register({
      uuid: ACTION,
      willAppear: () => {
        throw new Error('handler bug');
      },
      keyDown: () => {
        after = true;
      },
    });
    client.connect();
    await deck.next((m) => m['event'] === 'registerPlugin');
    deck.send(instance('willAppear', 'c'));
    deck.send(instance('keyDown', 'c'));
    await new Promise((r) => setTimeout(r, 50));
    assert.ok(after);
  });

  it('deduplicates identical images and coalesces bursts to the latest', async () => {
    const { deck, client } = await setup({ imageMinIntervalMs: 80 });
    client.connect();
    await deck.next((m) => m['event'] === 'registerPlugin');
    client.setImage('c', 'data:A');
    client.setImage('c', 'data:B');
    client.setImage('c', 'data:C');
    await new Promise((r) => setTimeout(r, 150));
    client.setImage('c', 'data:C');
    await new Promise((r) => setTimeout(r, 120));
    const images = deck.received.filter((m) => m['event'] === 'setImage').map((m) => (m['payload'] as { image: string }).image);
    assert.deepEqual(images, ['data:A', 'data:C']);
  });

  it('re-sends an identical image after the context disappeared and appeared again (tile replaced at the same key)', async () => {
    const { deck, client } = await setup({ imageMinIntervalMs: 0 });
    client.register({ uuid: ACTION, willAppear: (ev) => client.setImage(ev.context, 'data:SAME') });
    client.connect();
    await deck.next((m) => m['event'] === 'registerPlugin');
    deck.send(instance('willAppear', 'k12'));
    await new Promise((r) => setTimeout(r, 50));
    client.setImage('k12', 'data:SAME');
    deck.send(instance('willDisappear', 'k12'));
    deck.send(instance('willAppear', 'k12'));
    await new Promise((r) => setTimeout(r, 80));
    const images = deck.received.filter((m) => m['event'] === 'setImage');
    assert.equal(images.length, 2, 'once per appearance, deduplicated within it');
  });

  it('sends global settings with the plugin UUID as context and resolves getGlobalSettings', async () => {
    const { deck, client } = await setup();
    client.connect();
    await deck.next((m) => m['event'] === 'registerPlugin');
    const pending = client.getGlobalSettings();
    const req = await deck.next((m) => m['event'] === 'getGlobalSettings');
    assert.equal(req['context'], UUID);
    deck.send({ event: 'didReceiveGlobalSettings', payload: { settings: { token: 'x' } } });
    assert.deepEqual(await pending, { token: 'x' });
    client.setGlobalSettings({ token: 'y' });
    const set = await deck.next((m) => m['event'] === 'setGlobalSettings');
    assert.equal(set['context'], UUID);
    assert.deepEqual(await client.getGlobalSettings(), { token: 'y' });
  });

  it('reconnects with backoff after the socket drops and registers again', async () => {
    const { deck, client } = await setup({ reconnect: { baseMs: 20, maxMs: 40 } });
    let connects = 0;
    client.on('connected', () => {
      connects += 1;
    });
    client.connect();
    await deck.next((m) => m['event'] === 'registerPlugin');
    for (const s of deck.sockets) s.terminate();
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(connects, 2);
    assert.equal(deck.received.filter((m) => m['event'] === 'registerPlugin').length, 2);
  });

  it('gives up after maxAttempts', async () => {
    const { deck, client } = await setup({ reconnect: { baseMs: 5, maxMs: 10, maxAttempts: 2 } });
    let gaveUp = false;
    client.on('gaveUp', () => {
      gaveUp = true;
    });
    client.connect();
    await deck.next((m) => m['event'] === 'registerPlugin');
    await deck.close();
    await new Promise((r) => setTimeout(r, 300));
    assert.ok(gaveUp);
  });
});

describe('log redaction', () => {
  it('masks URL credentials in log lines, including error messages', async () => {
    const { createLogger, redactUrlCredentials } = await import('../src/log.ts');
    assert.equal(redactUrlCredentials('GET https://user:pw@ha.local:8123/x and http://plain.host/y'), 'GET https://***@ha.local:8123/x and http://plain.host/y');
    const lines: string[] = [];
    const orig = console.error;
    console.error = (l: string) => void lines.push(l);
    try {
      createLogger('t').error('fetch failed', new TypeError('URL includes credentials: https://u:secret@h/p'));
    } finally {
      console.error = orig;
    }
    assert.ok(lines[0] && !lines[0].includes('secret') && lines[0].includes('https://***@h/p'));
  });
});
