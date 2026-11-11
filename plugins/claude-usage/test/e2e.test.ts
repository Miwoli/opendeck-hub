// Built bundle against a fake OpenDeck and a fake claude.ai (OPENDECK_CLAUDE_API_BASE).

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { type WebSocket, WebSocketServer } from 'ws';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundle = path.join(root, 'com.miwoli.claude-usage.sdPlugin', 'bin', 'plugin.cjs');
const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

it('startup race, both keys from one fetch, orgId saved, expired session, forced refresh', { skip: !existsSync(bundle) && 'run the build first', timeout: 20_000 }, async () => {
  let usageCalls = 0;
  let status = 200;
  let utilization = 34;
  const api = createServer((req, res) => {
    if (req.headers.cookie !== 'sessionKey=sk-ant-test') status = 401;
    if (req.url === '/api/organizations') {
      res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify([{ uuid: 'org-1' }]));
    } else if (req.url === '/api/organizations/org-1/usage') {
      usageCalls += 1;
      const reset = new Date(Date.now() + 130 * 60_000).toISOString();
      res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify({ five_hour: { utilization, resets_at: reset }, seven_day: { utilization: 7, resets_at: reset } }));
    } else res.writeHead(404).end();
  });
  await new Promise<void>((r) => api.listen(0, '127.0.0.1', () => r()));

  const wss = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  await new Promise<void>((r) => wss.once('listening', () => r()));
  const images = new Map<string, string>();
  let global: Record<string, unknown> = { sessionKey: 'sk-ant-test', refreshIntervalMinutes: 5 };
  let deck: WebSocket | undefined;
  wss.on('connection', (ws) => {
    deck = ws;
    ws.on('message', (d) => {
      const m = JSON.parse(d.toString()) as { event: string; context?: string; payload?: Record<string, unknown> & { image?: string } };
      if (m.event === 'setImage' && m.context && m.payload?.image) images.set(m.context, Buffer.from(m.payload.image.split(',')[1] ?? '', 'base64').toString('utf8'));
      // reply late on purpose: willAppear arrives before the global settings (the old startup race)
      if (m.event === 'getGlobalSettings') setTimeout(() => ws.send(JSON.stringify({ event: 'didReceiveGlobalSettings', payload: { settings: global } })), 300);
      if (m.event === 'setGlobalSettings' && m.payload) global = m.payload;
    });
  });
  const send = (event: string, action: string, context: string): void => {
    deck?.send(JSON.stringify({ event, action: `com.miwoli.claude-usage.${action}`, context, device: 'sd', payload: { settings: {}, coordinates: { row: 0, column: 3 }, controller: 'Keypad', state: 0, isInMultiAction: false } }));
  };
  const texts = (c: string): string => [...(images.get(c) ?? '').matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]).join(' / ');

  let stdout = '';
  const child = spawn(process.execPath, [bundle, '-port', String((wss.address() as AddressInfo).port), '-pluginUUID', 'com.miwoli.claude-usage.sdPlugin', '-registerEvent', 'registerPlugin', '-info', '{}'], {
    env: { ...process.env, OPENDECK_CLAUDE_API_BASE: `http://127.0.0.1:${(api.address() as AddressInfo).port}` },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
  child.stderr.on('data', (d: Buffer) => (stdout += d.toString()));
  try {
    await wait(300);
    send('willAppear', 'session', 's');
    send('willAppear', 'weekly', 'w');
    await wait(1200);
    assert.ok(!/sessionKey|set key/.test(stdout + texts('s')), 'no "missing key" error at startup');
    assert.match(texts('s'), /^34% \/ Session \/ in 2h 1[09]m$/);
    assert.match(texts('w'), /^7% \/ Week \/ (today|[A-Za-z]{3}) \d\d:\d\d$/);
    assert.equal(usageCalls, 1, 'one request serves both keys');
    assert.equal(global['orgId'], 'org-1', 'orgId saved to global settings');

    utilization = 95;
    send('keyDown', 'session', 's');
    send('keyUp', 'session', 's');
    await wait(300);
    assert.equal(usageCalls, 1, 'short press uses the 20 s cache');
    send('keyDown', 'session', 's');
    await wait(600);
    send('keyUp', 'session', 's');
    await wait(500);
    assert.equal(usageCalls, 2, 'long press forces a fetch');
    assert.match(texts('s'), /^95% \/ Session \/ limit · in/);

    status = 401;
    send('keyDown', 'weekly', 'w');
    await wait(600);
    send('keyUp', 'weekly', 'w');
    await wait(600);
    assert.equal(texts('w'), '! / Week / Expired');
  } finally {
    child.kill('SIGTERM');
    wss.close();
    api.close();
  }
});
