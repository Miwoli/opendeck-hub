// WebSocket connection to OpenDeck: parsing the plugin launch arguments
// (-port, -pluginUUID, -registerEvent, -info), sending the registration
// handshake and reconnecting with backoff after disconnects.

import { EventEmitter } from 'node:events';
import WebSocket, { type RawData } from 'ws';

export interface PluginArgs {
  port: string;
  pluginUUID: string;
  registerEvent: string;
  info: unknown;
}

export function parsePluginArgs(argv: string[]): PluginArgs {
  const get = (flag: string): string => {
    const i = argv.indexOf(flag);
    if (i === -1 || i + 1 >= argv.length) {
      throw new Error(`Missing required argument ${flag} on the plugin command line.`);
    }
    const value = argv[i + 1];
    if (value === undefined) {
      throw new Error(`Missing value for argument ${flag}.`);
    }
    return value;
  };

  const infoRaw = get('-info');
  let info: unknown = infoRaw;
  try {
    info = JSON.parse(infoRaw);
  } catch {
    // OpenDeck always sends valid JSON in -info; if parsing
    // fails we keep the raw string - the plugin does not
    // depend on it.
  }

  return {
    port: get('-port'),
    pluginUUID: get('-pluginUUID'),
    registerEvent: get('-registerEvent'),
    info,
  };
}

const MAX_RECONNECT_ATTEMPTS = 5;

export class PluginConnection extends EventEmitter {
  private ws: WebSocket | null = null;
  private closedByHost = false;
  private reconnectAttempt = 0;

  constructor(private readonly args: PluginArgs) {
    super();
  }

  connect(): void {
    const url = `ws://127.0.0.1:${this.args.port}`;
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.on('open', () => {
      this.reconnectAttempt = 0;
      this.sendRaw({ event: this.args.registerEvent, uuid: this.args.pluginUUID });
      this.emit('connected');
    });

    ws.on('message', (data: RawData) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(data.toString());
      } catch (err) {
        this.emit('protocolError', err);
        return;
      }
      this.emit('event', parsed);
    });

    ws.on('close', () => {
      this.emit('disconnected');
      if (this.closedByHost) return;
      this.scheduleReconnect();
    });

    ws.on('error', (err: Error) => {
      this.emit('socketError', err);
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) {
      this.emit('reconnectFailed');
      return;
    }
    const delayMs = Math.min(30_000, 500 * 2 ** this.reconnectAttempt);
    this.reconnectAttempt += 1;
    setTimeout(() => this.connect(), delayMs);
  }

  send(message: object): void {
    this.sendRaw(message);
  }

  private sendRaw(message: object): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(message));
  }

  shutdown(): void {
    this.closedByHost = true;
    this.ws?.close();
  }
}
