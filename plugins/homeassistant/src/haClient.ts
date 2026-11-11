// Minimal Home Assistant WebSocket client (developers.home-assistant.io/docs/api/websocket), same flow as the
// verified ha-map client: auth_required -> {type:auth, access_token} -> auth_ok, then get_states once and
// subscribe_events(state_changed). call_service toggles the light. Runs only while start()ed (tiles visible).

import WebSocket from 'ws';
import { Emitter, type JsonObject, type Logger, isJsonObject, isObject, silentLogger } from '@miwoli/deck-core';

export interface EntityState {
  state: string;
  attributes: JsonObject;
}

export type HaStatus = 'offline' | 'connecting' | 'connected' | 'auth_error' | 'not_configured';

type Events = { status: HaStatus; entity: string };

export function websocketUrl(haUrl: string): string | null {
  try {
    const url = new URL(haUrl);
    if (url.protocol === 'http:') url.protocol = 'ws:';
    else if (url.protocol === 'https:') url.protocol = 'wss:';
    else if (url.protocol !== 'ws:' && url.protocol !== 'wss:') return null;
    url.pathname = `${url.pathname.replace(/\/+$/, '')}/api/websocket`;
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

export class HaClient extends Emitter<Events> {
  private ws: WebSocket | null = null;
  private running = false;
  private attempt = 0;
  private nextId = 1;
  private statesId = 0;
  private timer: NodeJS.Timeout | null = null;
  private heartbeat: NodeJS.Timeout | null = null;
  private current: HaStatus = 'offline';
  private config: { url: string; token: string } | null = null;
  readonly states = new Map<string, EntityState>();
  private readonly log: Logger;

  constructor(log: Logger = silentLogger) {
    super();
    this.log = log;
  }

  get status(): HaStatus {
    return this.current;
  }

  /** (Re)configures; reconnects when running and the config changed. */
  configure(haUrl: string, token: string): void {
    const url = websocketUrl(haUrl);
    const next = url && token ? { url, token } : null;
    if (JSON.stringify(next) === JSON.stringify(this.config)) return;
    this.config = next;
    if (this.running) {
      this.stop();
      this.start();
    } else if (!next) {
      this.setStatus('not_configured');
    }
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
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.timer = null;
    this.heartbeat = null;
    const ws = this.ws;
    this.ws = null;
    ws?.terminate();
    this.setStatus(this.config ? 'offline' : 'not_configured');
  }

  callService(domain: string, service: string, entityId: string): boolean {
    return this.send({ id: this.nextId++, type: 'call_service', domain, service, target: { entity_id: entityId } });
  }

  private send(msg: object): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || this.current !== 'connected') return false;
    this.ws.send(JSON.stringify(msg));
    return true;
  }

  private setStatus(status: HaStatus): void {
    if (status === this.current) return;
    this.current = status;
    this.emit('status', status);
  }

  private open(): void {
    if (!this.config) {
      this.setStatus('not_configured');
      return;
    }
    const { url, token } = this.config;
    this.setStatus('connecting');
    const ws = new WebSocket(url, { handshakeTimeout: 10_000 });
    this.ws = ws;
    ws.on('message', (data) => {
      let msg: unknown;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (!isObject(msg)) return;
      switch (msg['type']) {
        case 'auth_required':
          ws.send(JSON.stringify({ type: 'auth', access_token: token }));
          break;
        case 'auth_ok':
          this.attempt = 0;
          this.setStatus('connected');
          this.statesId = this.nextId++;
          this.send({ id: this.statesId, type: 'get_states' });
          this.send({ id: this.nextId++, type: 'subscribe_events', event_type: 'state_changed' });
          this.heartbeat = setInterval(() => this.send({ id: this.nextId++, type: 'ping' }), 30_000);
          break;
        case 'auth_invalid':
          this.log.error('Home Assistant rejected the token');
          this.setStatus('auth_error');
          this.running = false;
          ws.close();
          break;
        case 'result':
          if (msg['id'] === this.statesId && Array.isArray(msg['result'])) {
            for (const s of msg['result']) this.applyState(s);
          }
          break;
        case 'event': {
          const ev = msg['event'];
          const data = isObject(ev) ? ev['data'] : null;
          if (isObject(data)) {
            if (data['new_state'] === null && typeof data['entity_id'] === 'string') {
              this.states.delete(data['entity_id']);
              this.emit('entity', data['entity_id']);
            } else this.applyState(data['new_state']);
          }
          break;
        }
        default:
          break;
      }
    });
    ws.on('error', (err) => {
      if (this.attempt === 0) this.log.warn(`Home Assistant connection error: ${err.message}`);
    });
    ws.on('close', () => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.heartbeat) clearInterval(this.heartbeat);
      this.heartbeat = null;
      if (this.current !== 'auth_error') this.setStatus('offline');
      if (this.running) this.scheduleReconnect();
    });
  }

  private applyState(raw: unknown): void {
    if (!isObject(raw) || typeof raw['entity_id'] !== 'string' || typeof raw['state'] !== 'string') return;
    this.states.set(raw['entity_id'], { state: raw['state'], attributes: isJsonObject(raw['attributes']) ? raw['attributes'] : {} });
    this.emit('entity', raw['entity_id']);
  }

  private scheduleReconnect(): void {
    const delay = Math.min(60_000, 1000 * 2 ** Math.min(this.attempt, 6));
    this.attempt += 1;
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.running) this.open();
    }, delay);
  }
}
