// End-to-end test of the built plugin (bin/plugin.cjs) against fakes:
//  - "OpenDeck" (WebSocket server: registration, global settings, willAppear...),
//  - Home Assistant (WebSocket server with auth, get_states, state_changed),
//  - tile server (HTTP, synthetic PNG).
// Checks, among other things: drawing the 14 map tiles, the person key (distance),
// reactions to Home Assistant events, the reply to the Property Inspector, the User-Agent
// of tile requests, and that the Home Assistant connection is closed when no
// key is visible (and resumed when one returns).
//
// Run: npm test   (or: node ../../scripts/build-plugin.mjs && node test/e2e.mjs)

import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import zlib from 'node:zlib';
import { WebSocketServer } from 'ws';

const BUNDLE = path.resolve('com.miwoli.ha-map.sdPlugin/bin/plugin.cjs');
const TOKEN = 'test-token';
const TEST_UA = 'OpenDeck-HAMap-test/1.0';
const TILE_ACTION = 'com.miwoli.ha-map.tile';
const PERSON_ACTION = 'com.miwoli.ha-map.person';

// --- helpers ---------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (const byte of buf) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function makePng(size, [r, g, b]) {
  const rowLen = size * 3 + 1;
  const raw = Buffer.alloc(rowLen * size);
  for (let y = 0; y < size; y++) {
    raw[y * rowLen] = 0;
    for (let x = 0; x < size; x++) {
      const o = y * rowLen + 1 + x * 3;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(label, predicate, timeoutMs = 10_000) {
  const start = Date.now();
  for (;;) {
    const value = predicate();
    if (value) return value;
    if (Date.now() - start > timeoutMs) throw new Error(`Timed out waiting for: ${label}`);
    await sleep(50);
  }
}

function decodeSvg(dataUri) {
  const prefix = 'data:image/svg+xml;base64,';
  if (!dataUri.startsWith(prefix)) throw new Error('setImage does not contain base64 SVG');
  return Buffer.from(dataUri.slice(prefix.length), 'base64').toString('utf8');
}

// Waits until the total number of tile images stops growing for `quietMs`.
async function settle(quietMs) {
  const total = () => tileContexts.reduce((n, t) => n + (images.get(t.context)?.length ?? 0), 0);
  let last = total();
  let since = Date.now();
  while (Date.now() - since < quietMs) {
    await sleep(100);
    const now = total();
    if (now !== last) {
      last = now;
      since = Date.now();
    }
  }
}

let failures = 0;
function check(label, ok, detail = '') {
  if (ok) {
    console.log(`  OK   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label} ${detail}`);
  }
}

// --- fake tile server ---------------------------------------------

const tileRequests = [];
const tileServer = http.createServer((req, res) => {
  tileRequests.push({ url: req.url, ua: req.headers['user-agent'] });
  const m = /^\/(\d+)\/(\d+)\/(\d+)\.png$/.exec(req.url ?? '');
  if (!m) {
    res.writeHead(404).end();
    return;
  }
  const shade = 120 + ((Number(m[2]) + Number(m[3])) % 4) * 30;
  res.writeHead(200, { 'content-type': 'image/png' });
  res.end(makePng(256, [shade, shade + 20, shade - 20]));
});
await new Promise((resolve) => tileServer.listen(0, '127.0.0.1', resolve));
const tilePort = tileServer.address().port;

// --- fake Home Assistant -------------------------------------------------

const HOME = { lat: 50.3209432, lon: 18.5843986 };
const states = [
  {
    entity_id: 'person.sam',
    state: 'home',
    attributes: { friendly_name: 'Sam', latitude: HOME.lat, longitude: HOME.lon, gps_accuracy: 11 },
  },
  {
    entity_id: 'person.alex',
    state: 'not_home',
    attributes: {
      friendly_name: 'Alex',
      latitude: 50.2979064,
      longitude: 18.6554433,
      gps_accuracy: 12,
      entity_picture: '/api/image/serve/abc/512x512',
    },
  },
  {
    // Avatar outside the Home Assistant server - the plugin must neither send the token there nor fetch the image.
    entity_id: 'person.guest',
    state: 'unknown',
    attributes: { friendly_name: 'Guest', entity_picture: `http://127.0.0.1:${tilePort}/avatar.png` },
  },
  {
    entity_id: 'zone.home',
    state: '0',
    attributes: { friendly_name: 'Home', latitude: HOME.lat, longitude: HOME.lon, radius: 100 },
  },
  { entity_id: 'light.kitchen', state: 'on', attributes: {} },
];

const haSockets = new Set();
let haAuthOk = 0;
let haSubscribeId = 0;
const avatarRequests = [];
const haHttp = http.createServer((req, res) => {
  avatarRequests.push({ url: req.url, auth: req.headers['authorization'] });
  if (req.url === '/api/image/serve/abc/512x512') {
    res.writeHead(200, { 'content-type': 'image/png' });
    res.end(makePng(64, [200, 60, 60]));
    return;
  }
  res.writeHead(404).end(); // the 256x256 variant does not exist - the plugin must fall back to the original URL
});
await new Promise((resolve) => haHttp.listen(0, '127.0.0.1', resolve));
const haServer = new WebSocketServer({ server: haHttp });
haServer.on('connection', (ws) => {
  haSockets.add(ws);
  ws.on('close', () => haSockets.delete(ws));
  ws.send(JSON.stringify({ type: 'auth_required', ha_version: '2026.10.0' }));
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.type === 'auth') {
      if (msg.access_token === TOKEN) {
        haAuthOk += 1;
        ws.send(JSON.stringify({ type: 'auth_ok', ha_version: '2026.10.0' }));
      } else {
        ws.send(JSON.stringify({ type: 'auth_invalid', message: 'invalid token' }));
      }
    } else if (msg.type === 'get_states') {
      ws.send(JSON.stringify({ id: msg.id, type: 'result', success: true, result: states }));
    } else if (msg.type === 'subscribe_events') {
      haSubscribeId = msg.id;
      ws.send(JSON.stringify({ id: msg.id, type: 'result', success: true, result: null }));
    } else if (msg.type === 'ping') {
      ws.send(JSON.stringify({ id: msg.id, type: 'pong' }));
    }
  });
});
const haPort = haHttp.address().port;

function haPushStateChanged(newState) {
  const index = states.findIndex((s) => s.entity_id === newState.entity_id);
  if (index >= 0) states[index] = newState;
  for (const ws of haSockets) {
    ws.send(
      JSON.stringify({
        id: haSubscribeId,
        type: 'event',
        event: { event_type: 'state_changed', data: { entity_id: newState.entity_id, new_state: newState } },
      }),
    );
  }
}

// --- fake OpenDeck -------------------------------------------------------

const images = new Map(); // context -> list of images (data URI)
const piReplies = [];
let registered = false;
let odSocket = null;
const odServer = new WebSocketServer({ port: 0, host: '127.0.0.1' });
await new Promise((resolve) => odServer.on('listening', resolve));
odServer.on('connection', (ws) => {
  odSocket = ws;
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.event === 'registerPlugin') registered = msg.uuid === 'com.miwoli.ha-map';
    else if (msg.event === 'getGlobalSettings') {
      ws.send(
        JSON.stringify({
          event: 'didReceiveGlobalSettings',
          payload: {
            settings: {
              haUrl: `http://127.0.0.1:${haPort}/`,
              token: TOKEN,
              tileUrl: `http://127.0.0.1:${tilePort}/{z}/{x}/{y}.png`,
              userAgent: TEST_UA,
              refreshSeconds: 5,
              maxZoom: 16,
            },
          },
        }),
      );
    } else if (msg.event === 'setImage') {
      const list = images.get(msg.context) ?? [];
      list.push(msg.payload.image);
      images.set(msg.context, list);
    } else if (msg.event === 'sendToPropertyInspector') {
      piReplies.push(msg);
    }
  });
});
const odPort = odServer.address().port;

function appear(event, action, context, column, row, settings = {}) {
  odSocket.send(
    JSON.stringify({
      event,
      action,
      context,
      device: 'dev1',
      payload: { settings, coordinates: { column, row }, controller: 'Keypad', state: 0, isInMultiAction: false },
    }),
  );
}

// 14 tiles: every key of the 5x3 grid except the bottom-right one (the back key).
const tileContexts = [];
for (let row = 0; row < 3; row++) {
  for (let column = 0; column < 5; column++) {
    if (column === 4 && row === 2) continue;
    tileContexts.push({ context: `tile-${column}-${row}`, column, row });
  }
}

// --- launching the plugin ----------------------------------------------------

const plugin = spawn(
  process.execPath,
  [BUNDLE, '-port', String(odPort), '-pluginUUID', 'com.miwoli.ha-map', '-registerEvent', 'registerPlugin', '-info', '{}'],
  { stdio: ['ignore', 'inherit', 'pipe'] },
);
plugin.stderr.on('data', (d) => process.stderr.write(`    [plugin] ${d}`));

async function cleanup() {
  plugin.kill('SIGTERM');
  odServer.close();
  haServer.close();
  tileServer.close();
  haHttp.close();
  for (const ws of haSockets) ws.terminate();
}

try {
  console.log('1. Plugin registration and global settings');
  await waitFor('plugin registration', () => registered && odSocket);
  check('plugin registered with OpenDeck', registered);

  console.log('2. Entering the map profile: 14 tiles + a person key');
  for (const t of tileContexts) appear('willAppear', TILE_ACTION, t.context, t.column, t.row);
  appear('willAppear', PERSON_ACTION, 'person-1', 0, 0, { entityId: 'person.alex', display: 'distance' });
  appear('willAppear', PERSON_ACTION, 'person-2', 1, 0, { entityId: 'person.sam', display: 'place' });
  appear('willAppear', PERSON_ACTION, 'person-3', 2, 0, {});

  await waitFor('images of all map tiles', () =>
    tileContexts.every((t) => (images.get(t.context) ?? []).some((img) => decodeSvg(img).includes('data:image/png;base64,'))),
  );
  check('all 14 tiles received an image with PNG tiles', true);
  check('HA: authentication succeeded', haAuthOk >= 1);

  const allSvgs = tileContexts.map((t) => decodeSvg(images.get(t.context).at(-1)));
  check('the map has a marker for Alex (A)', allSvgs.some((s) => s.includes('>A</text>')));
  check('the map has a marker for Sam (S)', allSvgs.some((s) => s.includes('>S</text>')));
  check('home marker drawn', allSvgs.some((s) => s.includes('M-7 0 L0 -7')));
  check('no OSM attribution with a custom tile template',
    allSvgs.every((s) => !s.includes('OpenStreetMap')));
  check('tile requests carry the custom User-Agent', tileRequests.length > 0 && tileRequests.every((r) => r.ua === TEST_UA),
    JSON.stringify(tileRequests.slice(0, 2)));
  check('at most 2 parallel downloads still fetch the tiles', tileRequests.length >= 2);

  await waitFor('Alex key with a distance', () => images.get('person-1') && /km/.test(decodeSvg(images.get('person-1').at(-1))));
  await waitFor('Sam key with a place', () => images.get('person-2') && decodeSvg(images.get('person-2').at(-1)).includes('>Home<'));
  await waitFor('key without a person', () => images.get('person-3'));
  const personSvg = decodeSvg(images.get('person-1').at(-1));
  check('Alex key shows the distance in km', /\d\.\d km/.test(personSvg), personSvg.match(/>[^<]*km</)?.[0] ?? '');
  check('Alex key: "away" presence dot (Nocturne)', personSvg.includes('r="3.6" fill="#8A90A2"'));
  const samSvg = decodeSvg(images.get('person-2').at(-1));
  check('Sam key (place mode) shows "Home"', samSvg.includes('>Home<'));
  await waitFor('Alex avatar', () => decodeSvg(images.get('person-1').at(-1)).includes('clip-path="url(#ac)"'));
  const avatarSvg = decodeSvg(images.get('person-1').at(-1));
  check('Alex key has an avatar (PNG in a circle)', avatarSvg.includes('data:image/png;base64,'));
  check('avatar: the 256x256 variant is tried first, then the 512x512 original',
    avatarRequests[0]?.url === '/api/image/serve/abc/256x256' && avatarRequests.some((r) => r.url === '/api/image/serve/abc/512x512'),
    JSON.stringify(avatarRequests));
  check('avatar fetched with the HA token', avatarRequests.every((r) => r.auth === `Bearer ${TOKEN}`));
  check('Sam key without a picture shows an initial', !decodeSvg(images.get('person-2').at(-1)).includes('clip-path'));
  check('an avatar URL outside the Home Assistant server is not fetched', !tileRequests.some((r) => r.url === '/avatar.png'));
  const emptySvg = decodeSvg(images.get('person-3').at(-1));
  check('a key without a selected person asks for a selection', emptySvg.includes('select in PI'));

  console.log('3. Home Assistant event: Alex comes home');
  const before = images.get('person-1').length;
  const tileImagesBefore = tileContexts.reduce((n, t) => n + images.get(t.context).length, 0);
  haPushStateChanged({
    entity_id: 'person.alex',
    state: 'home',
    attributes: {
      friendly_name: 'Alex',
      latitude: HOME.lat,
      longitude: HOME.lon,
      gps_accuracy: 8,
      entity_picture: '/api/image/serve/abc/512x512',
    },
  });
  await waitFor('Alex key shows Home', () => decodeSvg(images.get('person-1').at(-1)).includes('>Home<'));
  check('person key redrawn after a Home Assistant event', images.get('person-1').length > before);
  await waitFor('map redrawn after the event', () =>
    tileContexts.reduce((n, t) => n + images.get(t.context).length, 0) > tileImagesBefore, 8000);
  check('map redrawn after a Home Assistant event', true);

  console.log('4. A Home Assistant event for another entity causes no redraws');
  await settle(2600); // wait for the scheduled redraws to settle (the minimum render interval is 2 s)
  const stable = tileContexts.reduce((n, t) => n + images.get(t.context).length, 0);
  haPushStateChanged({ entity_id: 'light.kitchen', state: 'off', attributes: {} });
  await sleep(2500);
  check('no redraws after a light.* event', tileContexts.reduce((n, t) => n + images.get(t.context).length, 0) === stable);

  console.log('5. Leaving the map profile: Home Assistant must be disconnected');
  for (const t of tileContexts) appear('willDisappear', TILE_ACTION, t.context, t.column, t.row);
  for (const c of ['person-1', 'person-2', 'person-3']) appear('willDisappear', PERSON_ACTION, c, 0, 0);
  await waitFor('Home Assistant connection closed', () => haSockets.size === 0, 8000);
  check('Home Assistant connection closed when nothing is visible', haSockets.size === 0);

  console.log('6. Returning to the map profile: Home Assistant resumes, images are sent again');
  const countBefore = images.get('tile-0-0').length;
  for (const t of tileContexts) appear('willAppear', TILE_ACTION, t.context, t.column, t.row);
  await waitFor('Home Assistant reconnected', () => haSockets.size === 1, 8000);
  await waitFor('tile images again', () => images.get('tile-0-0').length > countBefore, 8000);
  check('Home Assistant reconnected, map redrawn after returning', true);
  console.log('7. The Property Inspector asks for the list of people');
  odSocket.send(
    JSON.stringify({ event: 'sendToPlugin', action: PERSON_ACTION, context: 'person-1', payload: { event: 'getPersons' } }),
  );
  const reply = await waitFor('reply for the PI', () => piReplies.at(-1));
  check('the PI receives 3 people', reply.payload.persons?.length === 3, JSON.stringify(reply.payload));
  check('the PI receives status ready', reply.payload.status === 'ready');
} catch (err) {
  failures += 1;
  console.log(`  FAIL ${err instanceof Error ? err.message : String(err)}`);
} finally {
  await cleanup();
}

if (failures > 0) {
  console.log(`\nFAILED: ${failures} error(s)`);
  process.exit(1);
}
console.log('\nALL TESTS PASSED');
process.exit(0);
