// kscreen-doctor (KDE): read outputs from `kscreen-doctor -j`, decide which layout is active and build the
// argument list that switches to a layout. Pure functions except readOutputs/applyLayout (execFile, no shell).
// Verified on a two-output KDE Wayland setup (outputs DP-2 and HDMI-A-1); JSON fields
// outputs[].{id,name,connected,enabled,pos{x,y},size{width,height},scale,priority,currentModeId,modes[{id,name}]}.
// Setting syntax from `kscreen-doctor --help`: output.<name>.enable|disable|position.X,Y|priority.N|mode.<WxH@R>|scale.N

import { type RunOptions, type RunResult, isObject, run } from '@miwoli/deck-core';

export interface Output {
  id: number;
  name: string;
  connected: boolean;
  enabled: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
  priority: number;
  /** e.g. "3440x1440@240", null when unknown */
  modeName: string | null;
}

export type Layout = { kind: 'single'; output: string } | { kind: 'extend' };

/** Geometry of the extended desktop, remembered while it is active so it can be restored later. */
export interface ExtendSnapshot {
  outputs: Array<{ name: string; x: number; y: number; priority: number; mode: string | null; scale: number }>;
}

const OUTPUT_NAME = /^[A-Za-z0-9_-]+$/;
const MODE_NAME = /^\d+x\d+@\d+(\.\d+)?$/;

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/** Validates kscreen-doctor JSON. Outputs with unexpected names are skipped (they are embedded in arguments). */
export function parseOutputs(json: unknown): Output[] {
  if (!isObject(json) || !Array.isArray(json['outputs'])) throw new Error('kscreen-doctor: unexpected JSON (no outputs[])');
  const result: Output[] = [];
  for (const raw of json['outputs']) {
    if (!isObject(raw) || typeof raw['name'] !== 'string' || !OUTPUT_NAME.test(raw['name'])) continue;
    const pos = isObject(raw['pos']) ? raw['pos'] : {};
    const size = isObject(raw['size']) ? raw['size'] : {};
    const modeId = raw['currentModeId'];
    let modeName: string | null = null;
    if (Array.isArray(raw['modes'])) {
      for (const m of raw['modes']) {
        if (isObject(m) && String(m['id']) === String(modeId) && typeof m['name'] === 'string' && MODE_NAME.test(m['name'])) modeName = m['name'];
      }
    }
    result.push({
      id: num(raw['id'], -1),
      name: raw['name'],
      connected: raw['connected'] === true,
      enabled: raw['enabled'] === true,
      x: num(pos['x'], 0),
      y: num(pos['y'], 0),
      width: num(size['width'], 0),
      height: num(size['height'], 0),
      scale: num(raw['scale'], 1),
      priority: num(raw['priority'], 0),
      modeName,
    });
  }
  return result;
}

export function connected(outputs: readonly Output[]): Output[] {
  return outputs.filter((o) => o.connected);
}

/** Left-to-right order of connected outputs; used for default labels ("Screen 1", "Screen 2"). */
export function leftToRight(outputs: readonly Output[]): Output[] {
  return [...connected(outputs)].sort((a, b) => a.x - b.x || a.priority - b.priority);
}

export function isActive(layout: Layout, outputs: readonly Output[]): boolean {
  const on = connected(outputs).filter((o) => o.enabled);
  if (layout.kind === 'single') return on.length === 1 && on[0]?.name === layout.output;
  return on.length >= 2 && on.length === connected(outputs).length;
}

export function snapshotIfExtended(outputs: readonly Output[]): ExtendSnapshot | null {
  const conn = connected(outputs);
  if (conn.length < 2 || !conn.every((o) => o.enabled)) return null;
  return { outputs: conn.map((o) => ({ name: o.name, x: o.x, y: o.y, priority: o.priority, mode: o.modeName, scale: o.scale })) };
}

export function parseSnapshot(raw: unknown): ExtendSnapshot | null {
  if (!isObject(raw) || !Array.isArray(raw['outputs'])) return null;
  const outputs: ExtendSnapshot['outputs'] = [];
  for (const o of raw['outputs']) {
    if (!isObject(o) || typeof o['name'] !== 'string' || !OUTPUT_NAME.test(o['name'])) continue;
    const mode = typeof o['mode'] === 'string' && MODE_NAME.test(o['mode']) ? o['mode'] : null;
    outputs.push({ name: o['name'], x: num(o['x'], 0), y: num(o['y'], 0), priority: num(o['priority'], 0), mode, scale: num(o['scale'], 1) });
  }
  return outputs.length >= 2 ? { outputs } : null;
}

/**
 * kscreen-doctor arguments for a layout. Throws when the layout cannot be applied (e.g. output unplugged),
 * so the caller can show an error instead of disabling the only working screen.
 */
export function layoutArgs(layout: Layout, outputs: readonly Output[], snapshot: ExtendSnapshot | null): string[] {
  const conn = connected(outputs);
  if (layout.kind === 'single') {
    const target = conn.find((o) => o.name === layout.output);
    if (!target) throw new Error(`output ${layout.output} is not connected`);
    const args = [`output.${target.name}.enable`, `output.${target.name}.priority.1`];
    for (const o of conn) if (o.name !== target.name && o.enabled) args.push(`output.${o.name}.disable`);
    return args;
  }
  if (conn.length < 2) throw new Error('extend needs at least two connected outputs');
  const args: string[] = [];
  // without a remembered layout, place outputs left to right by priority at their current size
  let nextX = 0;
  // order by the remembered priority when there is one (a disabled output reports priority 0)
  const rank = (o: Output): number => snapshot?.outputs.find((s) => s.name === o.name)?.priority || o.priority || 99;
  const byPriority = [...conn].sort((a, b) => rank(a) - rank(b));
  byPriority.forEach((o, i) => {
    const saved = snapshot?.outputs.find((s) => s.name === o.name);
    const x = saved ? saved.x : nextX;
    const y = saved ? saved.y : 0;
    nextX += Math.round(o.width / (o.scale || 1));
    args.push(`output.${o.name}.enable`, `output.${o.name}.position.${x},${y}`, `output.${o.name}.priority.${saved?.priority || i + 1}`);
    if (saved?.mode) args.push(`output.${o.name}.mode.${saved.mode}`);
  });
  return args;
}

export interface KscreenRunner {
  (file: string, args: readonly string[], options?: RunOptions): Promise<RunResult>;
}

/** Binary is overridable for tests (fake kscreen-doctor). */
export function kscreenBinary(env: NodeJS.ProcessEnv = process.env): string {
  return env['OPENDECK_KSCREEN_DOCTOR'] || 'kscreen-doctor';
}

export async function readOutputs(runner: KscreenRunner = run): Promise<Output[]> {
  const res = await runner(kscreenBinary(), ['-j'], { timeoutMs: 5000 });
  let json: unknown;
  try {
    json = JSON.parse(res.stdout);
  } catch {
    throw new Error('kscreen-doctor -j: invalid JSON');
  }
  return parseOutputs(json);
}

export async function applyLayout(args: readonly string[], runner: KscreenRunner = run): Promise<void> {
  await runner(kscreenBinary(), args, { timeoutMs: 15_000 });
}
