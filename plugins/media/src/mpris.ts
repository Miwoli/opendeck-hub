// MPRIS over the user D-Bus via `busctl --user --json=short` (systemd; no npm dependency, no playerctl).
// Verified with: Spotify (org.mpris.MediaPlayer2.spotify, artUrl https://i.scdn.co/...),
// Zen (org.mpris.MediaPlayer2.firefox.instance_*, artUrl file://...), Haruna. `get-property` with two properties
// prints one JSON object per line: {"type":"s","data":"Playing"} and {"type":"a{sv}","data":{...}}.
// Privacy: titles/URLs can be personal - callers must not log them.

import { type RunOptions, type RunResult, isObject, run } from '@miwoli/deck-core';

export type PlaybackStatus = 'Playing' | 'Paused' | 'Stopped';

export interface PlayerState {
  /** bus name, e.g. org.mpris.MediaPlayer2.spotify */
  bus: string;
  status: PlaybackStatus;
  title: string;
  artist: string;
  artUrl: string;
}

export type Runner = (file: string, args: readonly string[], options?: RunOptions) => Promise<RunResult>;

const PREFIX = 'org.mpris.MediaPlayer2.';
const BUS_NAME = /^org\.mpris\.MediaPlayer2\.[A-Za-z0-9_.-]+$/;
const OBJECT = '/org/mpris/MediaPlayer2';
const IFACE = 'org.mpris.MediaPlayer2.Player';

export function busctlBinary(env: NodeJS.ProcessEnv = process.env): string {
  return env['OPENDECK_BUSCTL'] || 'busctl';
}

export function parseList(stdout: string): string[] {
  let json: unknown;
  try {
    json = JSON.parse(stdout);
  } catch {
    return [];
  }
  if (!Array.isArray(json)) return [];
  const names: string[] = [];
  for (const e of json) if (isObject(e) && typeof e['name'] === 'string' && BUS_NAME.test(e['name'])) names.push(e['name']);
  return names;
}

function variantString(v: unknown): string {
  if (!isObject(v)) return '';
  const d = v['data'];
  if (typeof d === 'string') return d;
  if (Array.isArray(d)) return d.filter((x): x is string => typeof x === 'string').join(', ');
  return '';
}

/** Parses the two JSON lines of `get-property ... PlaybackStatus Metadata`. */
export function parseProperties(bus: string, stdout: string): PlayerState | null {
  const lines = stdout.split('\n').filter((l) => l.trim() !== '');
  if (lines.length < 2) return null;
  let status: unknown;
  let meta: unknown;
  try {
    status = JSON.parse(lines[0] ?? '');
    meta = JSON.parse(lines[1] ?? '');
  } catch {
    return null;
  }
  const s = isObject(status) ? status['data'] : null;
  if (s !== 'Playing' && s !== 'Paused' && s !== 'Stopped') return null;
  const data = isObject(meta) && isObject(meta['data']) ? meta['data'] : {};
  return {
    bus,
    status: s,
    title: variantString(data['xesam:title']),
    artist: variantString(data['xesam:artist']),
    artUrl: variantString(data['mpris:artUrl']),
  };
}

/** Players that can be switched to: not Stopped, in a stable (bus name) order. */
export function activePlayers(players: readonly PlayerState[]): PlayerState[] {
  return players.filter((p) => p.status !== 'Stopped').sort((a, b) => (a.bus < b.bus ? -1 : a.bus > b.bus ? 1 : 0));
}

/** The player matching the tile's preferred bus name suffix, if it is running. */
export function preferredPlayer(players: readonly PlayerState[], preferred: string): PlayerState | null {
  const pref = preferred.trim().toLowerCase();
  if (!pref) return null;
  return players.find((x) => x.bus.slice(PREFIX.length).toLowerCase().startsWith(pref)) ?? null;
}

/** Preferred player (matched against the bus name suffix) > focused (if active) > first Playing > first Paused > first. */
export function choosePlayer(players: readonly PlayerState[], preferred: string, focus: string | null = null): PlayerState | null {
  const pref = preferredPlayer(players, preferred);
  if (pref) return pref;
  const focused = focus ? players.find((p) => p.bus === focus && p.status !== 'Stopped') : undefined;
  if (focused) return focused;
  return players.find((p) => p.status === 'Playing') ?? players.find((p) => p.status === 'Paused') ?? players[0] ?? null;
}

/** Next active player after `current` (wrapping), or null when there is nothing else to switch to. */
export function nextPlayer(players: readonly PlayerState[], current: PlayerState | null): PlayerState | null {
  const active = activePlayers(players);
  const i = current ? active.findIndex((p) => p.bus === current.bus) : -1;
  const next = active[(i + 1) % active.length] ?? null;
  return next && next.bus !== current?.bus ? next : null;
}

/**
 * Which player the automatic tiles follow when several are active (e.g. Spotify + YouTube in the browser):
 * the one picked with the switch gesture, or the one that most recently started playing. Cleared when it stops or quits.
 */
export class PlayerFocus {
  private bus: string | null = null;
  private wasPlaying = new Set<string>();

  get current(): string | null {
    return this.bus;
  }

  set(bus: string): void {
    this.bus = bus;
  }

  /** Call with every fresh player list. */
  observe(players: readonly PlayerState[]): void {
    const playing = players.filter((p) => p.status === 'Playing').map((p) => p.bus);
    const started = playing.filter((b) => !this.wasPlaying.has(b));
    if (started.length > 0) this.bus = started[started.length - 1] ?? null;
    this.wasPlaying = new Set(playing);
    if (this.bus && !players.some((p) => p.bus === this.bus && p.status !== 'Stopped')) this.bus = null;
  }
}

export async function readPlayers(runner: Runner = run): Promise<PlayerState[]> {
  const bin = busctlBinary();
  const list = await runner(bin, ['--user', '--json=short', 'list'], { timeoutMs: 3000 });
  const states = await Promise.all(
    parseList(list.stdout).map(async (bus) => {
      try {
        const res = await runner(bin, ['--user', '--json=short', 'get-property', bus, OBJECT, IFACE, 'PlaybackStatus', 'Metadata'], { timeoutMs: 3000 });
        return parseProperties(bus, res.stdout);
      } catch {
        // players without the Player interface or that just quit
        return null;
      }
    }),
  );
  return states.filter((s): s is PlayerState => s !== null);
}

export type PlayerCommand = 'PlayPause' | 'Next' | 'Previous';

export async function control(bus: string, command: PlayerCommand, runner: Runner = run): Promise<void> {
  if (!BUS_NAME.test(bus)) throw new Error('invalid MPRIS bus name');
  await runner(busctlBinary(), ['--user', 'call', bus, OBJECT, IFACE, command], { timeoutMs: 3000 });
}

export function playerLabel(bus: string): string {
  const id = bus.slice(PREFIX.length).split('.')[0] ?? bus;
  return id.charAt(0).toUpperCase() + id.slice(1);
}
