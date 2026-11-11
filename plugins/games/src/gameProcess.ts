// Finds the running game and closes it. Markers (well known, NOT yet verified live - no game ran
// during development):
//   Steam starts every game under `reaper SteamLaunch AppId=<appid> -- ...` (the reaper is a subreaper);
//   Lutris starts games under its `lutris-wrapper` process.
// Only descendants of such a marker process are signalled, so nothing outside the game can be hit.

import { readFileSync, readdirSync } from 'node:fs';
import nodePath from 'node:path';

export interface RunningGame {
  source: 'steam' | 'lutris';
  /** marker process (reaper / lutris-wrapper) */
  pid: number;
  appid: string | null;
  /** all descendant pids, children first in tree order */
  descendants: number[];
}

interface Proc {
  pid: number;
  ppid: number;
  cmdline: string;
}

export function readProcs(procRoot = '/proc'): Proc[] {
  const procs: Proc[] = [];
  let entries: string[];
  try {
    entries = readdirSync(procRoot);
  } catch {
    return procs;
  }
  for (const e of entries) {
    if (!/^\d+$/.test(e)) continue;
    try {
      const stat = readFileSync(nodePath.join(procRoot, e, 'stat'), 'utf8');
      // "pid (comm) state ppid ..." - comm may contain spaces/parens, so split after the last ')'
      const after = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
      const ppid = Number(after[1]);
      const cmdline = readFileSync(nodePath.join(procRoot, e, 'cmdline'), 'utf8').split('\0').join(' ').trim();
      procs.push({ pid: Number(e), ppid, cmdline });
    } catch {
      // process exited while scanning
    }
  }
  return procs;
}

export function findRunningGame(procs: readonly Proc[]): RunningGame | null {
  const byParent = new Map<number, Proc[]>();
  for (const p of procs) byParent.set(p.ppid, [...(byParent.get(p.ppid) ?? []), p]);
  const descendants = (pid: number): number[] => {
    const out: number[] = [];
    const queue = [pid];
    while (queue.length) {
      const cur = queue.shift();
      if (cur === undefined) break;
      for (const c of byParent.get(cur) ?? []) {
        out.push(c.pid);
        queue.push(c.pid);
      }
    }
    return out;
  };
  for (const p of procs) {
    const steam = /\bSteamLaunch\b.*\bAppId=(\d+)/.exec(p.cmdline);
    if (steam && /(^|\/)reaper\b/.test(p.cmdline.split(' ')[0] ?? '')) {
      const d = descendants(p.pid);
      if (d.length) return { source: 'steam', pid: p.pid, appid: steam[1] ?? null, descendants: d };
    }
  }
  for (const p of procs) {
    if (/(^|\/|\s)lutris-wrapper\b/.test(p.cmdline)) {
      const d = descendants(p.pid);
      if (d.length) return { source: 'lutris', pid: p.pid, appid: null, descendants: d };
    }
  }
  return null;
}

export type Killer = (pid: number, signal: NodeJS.Signals) => void;

const defaultKiller: Killer = (pid, signal) => {
  try {
    process.kill(pid, signal);
  } catch {
    // already gone
  }
};

/** SIGTERM to every descendant (deepest first); whatever is still alive after `graceMs` gets SIGKILL. */
export async function closeGame(game: RunningGame, opts: { kill?: Killer; graceMs?: number; procRoot?: string } = {}): Promise<void> {
  const kill = opts.kill ?? defaultKiller;
  const targets = [...game.descendants].reverse();
  for (const pid of targets) kill(pid, 'SIGTERM');
  await new Promise((r) => setTimeout(r, opts.graceMs ?? 5000));
  const alive = new Set(readProcs(opts.procRoot).map((p) => p.pid));
  for (const pid of targets) if (alive.has(pid)) kill(pid, 'SIGKILL');
}
