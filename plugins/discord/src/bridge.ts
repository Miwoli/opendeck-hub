// Client for the DeckBridge Vencord userplugin (vencord-userplugin/deckBridge/native.ts).
// Unix socket, one JSON object per line: we send {"cmd": ...}, Vesktop pushes {"state": {...}} on every change.
// The socket only exists while Vesktop runs with DeckBridge enabled, so a missing socket is the normal
// "offline" state, retried with backoff while any tile is visible.

import { connect, type Socket } from 'node:net';
import path from 'node:path';
import { Emitter, type Logger, isObject, silentLogger } from '@miwoli/deck-core';

export type BridgeCommand = 'toggleMute' | 'toggleDeafen' | 'pttDown' | 'pttUp' | 'getState';

export interface DiscordState {
  inVoice: boolean;
  selfMute: boolean;
  selfDeaf: boolean;
  serverMute: boolean;
  serverDeaf: boolean;
  /** Discord input mode: "VOICE_ACTIVITY" or "PUSH_TO_TALK" (MediaEngineStore.getMode()). */
  mode: string;
  /** PTT currently holding the mic open (set by the userplugin). */
  ptt: boolean;
}

export function defaultSocketPath(env: NodeJS.ProcessEnv = process.env): string {
  const dir = env['XDG_RUNTIME_DIR'] || `/tmp/opendeck-${process.getuid?.() ?? 'user'}`;
  return path.join(dir, 'opendeck-discord.sock');
}

/** Validates a line from the socket. Unknown or malformed messages return null. */
export function parseStateLine(line: string): DiscordState | null {
  let msg: unknown;
  try {
    msg = JSON.parse(line);
  } catch {
    return null;
  }
  if (!isObject(msg) || !isObject(msg['state'])) return null;
  const s = msg['state'];
  const bool = (k: string): boolean => s[k] === true;
  return {
    inVoice: bool('inVoice'),
    selfMute: bool('selfMute'),
    selfDeaf: bool('selfDeaf'),
    serverMute: bool('serverMute'),
    serverDeaf: bool('serverDeaf'),
    mode: typeof s['mode'] === 'string' ? s['mode'] : 'VOICE_ACTIVITY',
    ptt: bool('ptt'),
  };
}

export interface BridgeOptions {
  socketPath?: string;
  logger?: Logger;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

type BridgeEvents = { state: DiscordState | null };

export class BridgeClient extends Emitter<BridgeEvents> {
  private socket: Socket | null = null;
  private running = false;
  private attempt = 0;
  private timer: NodeJS.Timeout | null = null;
  private current: DiscordState | null = null;
  private readonly socketPath: string;
  private readonly log: Logger;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;

  constructor(options: BridgeOptions = {}) {
    super();
    this.socketPath = options.socketPath ?? defaultSocketPath();
    this.log = options.logger ?? silentLogger;
    this.baseDelayMs = options.baseDelayMs ?? 1000;
    this.maxDelayMs = options.maxDelayMs ?? 15_000;
  }

  /** null = Vesktop/DeckBridge not reachable. */
  get state(): DiscordState | null {
    return this.current;
  }

  get active(): boolean {
    return this.running;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.attempt = 0;
    this.open();
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.socket?.destroy();
    this.socket = null;
    this.setState(null);
  }

  send(cmd: BridgeCommand): boolean {
    if (!this.socket || this.socket.destroyed || this.socket.connecting) return false;
    this.socket.write(`${JSON.stringify({ cmd })}\n`);
    return true;
  }

  private open(): void {
    const socket = connect(this.socketPath);
    this.socket = socket;
    let buffer = '';
    socket.setEncoding('utf8');
    socket.on('connect', () => {
      this.attempt = 0;
      this.log.info(`bridge connected (${this.socketPath})`);
      this.send('getState');
    });
    socket.on('data', (chunk: string) => {
      buffer += chunk;
      let nl = buffer.indexOf('\n');
      while (nl >= 0) {
        const state = parseStateLine(buffer.slice(0, nl));
        buffer = buffer.slice(nl + 1);
        if (state) this.setState(state);
        nl = buffer.indexOf('\n');
      }
      if (buffer.length > 64 * 1024) buffer = '';
    });
    socket.on('error', (err: NodeJS.ErrnoException) => {
      // ENOENT/ECONNREFUSED = Vesktop not running or DeckBridge disabled: expected, log only the first time
      if (this.attempt === 0) this.log.warn(`bridge unavailable: ${err.code ?? err.message}`);
    });
    socket.on('close', () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.setState(null);
      if (this.running) this.scheduleReconnect();
    });
  }

  private scheduleReconnect(): void {
    const delay = Math.min(this.maxDelayMs, this.baseDelayMs * 2 ** Math.min(this.attempt, 10));
    this.attempt += 1;
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.running) this.open();
    }, delay);
  }

  private setState(state: DiscordState | null): void {
    const same = JSON.stringify(state) === JSON.stringify(this.current);
    this.current = state;
    if (!same) this.emit('state', state);
  }
}
