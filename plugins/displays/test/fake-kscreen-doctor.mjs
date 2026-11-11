#!/usr/bin/env node
// Fake kscreen-doctor for tests: state in $FAKE_KSCREEN_STATE ({dp, hdmi, dpPriority, hdmiPriority}),
// every invocation appended to $FAKE_KSCREEN_LOG. Supports `-j` and output.<name>.enable|disable|priority.N.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';

const statePath = process.env.FAKE_KSCREEN_STATE;
const logPath = process.env.FAKE_KSCREEN_LOG;
const args = process.argv.slice(2);
if (logPath) appendFileSync(logPath, `${JSON.stringify(args)}\n`);
const state = JSON.parse(readFileSync(statePath, 'utf8'));
const key = { 'DP-2': 'dp', 'HDMI-A-1': 'hdmi' };

if (args[0] === '-j') {
  const out = (name, id, x, y, w, h, scale, mode) => ({
    id, name, connected: true, enabled: state[key[name]], pos: { x, y }, size: { width: w, height: h }, scale,
    priority: state[key[name]] ? state[`${key[name]}Priority`] : 0, currentModeId: mode.id, modes: [mode],
  });
  process.stdout.write(JSON.stringify({ outputs: [
    out('DP-2', 1, 0, 631, 3440, 1440, 1, { id: '2', name: '3440x1440@240' }),
    out('HDMI-A-1', 2, 3440, 0, 2560, 2880, 1.1, { id: '33', name: '2560x2880@60' }),
  ] }));
  process.exit(0);
}
for (const a of args) {
  const [, name, setting, value] = a.match(/^output\.([^.]+)\.([a-z]+)\.?(.*)$/) ?? [];
  if (!key[name]) { console.error(`unknown output ${name}`); process.exit(1); }
  if (setting === 'enable') state[key[name]] = true;
  if (setting === 'disable') state[key[name]] = false;
  if (setting === 'priority') state[`${key[name]}Priority`] = Number(value);
}
writeFileSync(statePath, JSON.stringify(state));
