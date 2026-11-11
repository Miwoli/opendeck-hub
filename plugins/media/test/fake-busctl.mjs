#!/usr/bin/env node
// Fake busctl for tests. $FAKE_MPRIS: JSON {players: [{bus, status, title, artist, artUrl, trackType}]}; calls logged to $FAKE_MPRIS_LOG.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
const args = process.argv.slice(2);
appendFileSync(process.env.FAKE_MPRIS_LOG, `${JSON.stringify(args)}\n`);
const state = JSON.parse(readFileSync(process.env.FAKE_MPRIS, 'utf8'));
const rest = args.filter((a) => !a.startsWith('--'));
if (rest[0] === 'list') {
  process.stdout.write(JSON.stringify([{ name: ':1.5', pid: 1 }, ...state.players.map((p) => ({ name: p.bus, pid: 2 })), { name: 'org.kde.KWin', pid: 3 }]));
} else if (rest[0] === 'get-property') {
  const p = state.players.find((x) => x.bus === rest[1]);
  if (!p) { console.error('The name is not activatable'); process.exit(1); }
  process.stdout.write(`${JSON.stringify({ type: 's', data: p.status })}\n${JSON.stringify({ type: 'a{sv}', data: {
    'mpris:trackid': { type: p.trackType ?? 'o', data: '/x' }, 'xesam:title': { type: 's', data: p.title },
    'xesam:artist': { type: 'as', data: [p.artist] }, 'mpris:artUrl': { type: 's', data: p.artUrl } } })}\n`);
} else if (rest[0] === 'call') {
  const p = state.players.find((x) => x.bus === rest[1]);
  if (rest[4] === 'PlayPause') p.status = p.status === 'Playing' ? 'Paused' : 'Playing';
  if (rest[4] === 'Next') p.title = `${p.title}+`;
  writeFileSync(process.env.FAKE_MPRIS, JSON.stringify(state));
}
