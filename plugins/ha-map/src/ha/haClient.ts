// Client of the Home Assistant WebSocket API (https://developers.home-assistant.io/
// docs/api/websocket): long-lived token auth, a one-off get_states
// + a state_changed subscription. The connection is kept only while
// the plugin needs it (start()/stop()); reconnect with backoff, a heartbeat
// (ping) detects dead connections.

import { EventEmitter } from 'node:events';
import WebSocket, { type RawData } from 'ws';
import { logError, logInfo } from '../logger.js';
import { asString, isRecord } from '../util.js';

export type HaStatus = 'stopped' | 'not_configured' | 'connecting' | 'ready' | 'auth_error' | 'offline';

export interface HaEntityState {
  entityId: string;
  state: string;
  attributes: Record<string, unknown>;
}

export interface HaStateChange {
  entityId: string;
  newState: HaEntityState | null;
}

export interface HaConnectionSettings {
  haUrl: string;
  token: string;
}

const TRACKED_PREFIXES = ['person.', 'zone.'];
const HEARTBEAT_MS = 20_000;
const DEAD_AFTER_MS = 70_000;

export function isTracked(entityId: string): boolean {
  return TRACKED_PREFIXES.some((prefix) => entityId.startsWith(prefix));
}

export function toWebSocketUrl(haUrl: string): string | null {
  try {
    const url = new URL(haUrl);
    if (url.protocol === 'http:') url.protocol = 'ws:';
    else if (url.protocol === 'https:') url.protocol = 'wss:';
    else return null;
    url.pathname = `${url.pathname.replace(/\/+$/, '')}/api/websocket`;
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

function toEntityState(value: unknown): HaEntityState | null {
  if (!isRecord(value)) return null;
  const entityId = asString(value['entity_id']);
  const state = asString(value['state']);
  if (!entityId || state === undefined) return null;
  return { entityId, state, attributes: isRecord(value['attributes']) ? value['attributes'] : {} };
}

function rawToString(data: RawData): string {
  if (Buffer.isBuffer(data)) return data.toString('utf8');
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
  return Buffer.from(data).toString('utf8');
}

/**
 * Events: 'status' (HaStatus), 'states' (HaEntityState[] - a full
 * snapshot of person.* and zone.* entities), 'stateChanged' (HaStateChange).
 */
export class HaClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private wanted = false;
  private currentStatus: HaStatus = 'stopped';
  private nextId = 1;
  private subscribeId = 0;
  private readonly statesRequestIds = new Set<number>();
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private lastMessageAt = 0;
  private activeKey = '';

  constructor(private readonly getSettings: () => HaConnectionSettings) {
    super();
  }

  get status(): HaStatus {
    return this.currentStatus;
  }

  start(): void {
    if (this.wanted) return;
    this.wanted = true;
    this.reconnectAttempt = 0;
    logInfo('HA: connection started (map/person keys active).');
    this.connect();
  }

  stop(): void {
    if (!this.wanted && this.currentStatus === 'stopped') return;
    this.wanted = false;
    this.teardown();
    this.setStatus('stopped');
    logInfo('HA: connection stopped (nothing active).');
  }

  /** Call after the settings (URL/token) change; reconnects only if something changed. */
  reconfigure(): void {
    if (!this.wanted) return;
    const retryable = this.currentStatus === 'auth_error' || this.currentStatus === 'not_configured';
    if (this.settingsKey() === this.activeKey && !retryable) return;
    this.teardown();
    this.reconnectAttempt = 0;
    this.connect();
  }

  /** Fetches a fresh entity snapshot (when the connection is ready). */
  requestSync(): void {
    if (this.currentStatus !== 'ready') return;
    this.requestStates();
  }

  private settingsKey(): string {
    const s = this.getSettings();
    return `${s.haUrl}\n${s.token}`;
  }

  private setStatus(status: HaStatus): void {
    if (this.currentStatus === status) return;
    this.currentStatus = status;
    this.emit('status', status);
  }

  private connect(): void {
    this.clearReconnect();
    this.activeKey = this.settingsKey();
    const settings = this.getSettings();
    const url = toWebSocketUrl(settings.haUrl);
    if (!url || settings.token.length === 0) {
      this.setStatus('not_configured');
      return;
    }

    this.setStatus('connecting');
    let ws: WebSocket;
    try {
      ws = new WebSocket(url, { handshakeTimeout: 8000 });
    } catch (err) {
      logError('HA: cannot open WebSocket:', err instanceof Error ? err.message : String(err));
      this.setStatus('offline');
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;
    this.lastMessageAt = Date.now();

    ws.on('message', (data: RawData) => this.onMessage(ws, data));
    ws.on('error', (err: Error) => {
      if (this.ws === ws) logError('HA WebSocket:', err.message);
    });
    ws.on('close', () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.stopHeartbeat();
      if (!this.wanted) return;
      if (this.currentStatus !== 'auth_error') {
        this.setStatus('offline');
        this.scheduleReconnect();
      }
    });
  }

  private teardown(): void {
    this.clearReconnect();
    this.stopHeartbeat();
    const ws = this.ws;
    this.ws = null;
    this.statesRequestIds.clear();
    if (ws) {
      try {
        ws.close();
      } catch {
        ws.terminate();
      }
    }
  }

  private scheduleReconnect(): void {
    this.clearReconnect();
    const delayMs = Math.min(30_000, 1000 * 2 ** this.reconnectAttempt);
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.wanted) this.connect();
    }, delayMs);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private startHeartbeat(ws: WebSocket): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (Date.now() - this.lastMessageAt > DEAD_AFTER_MS) {
        logError('HA: no response - dropping the connection.');
        ws.terminate();
        return;
      }
      this.send({ id: this.nextId++, type: 'ping' });
    }, HEARTBEAT_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  private send(message: Record<string, unknown>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(message));
  }

  private requestStates(): void {
    const id = this.nextId++;
    this.statesRequestIds.add(id);
    this.send({ id, type: 'get_states' });
  }

  private onMessage(ws: WebSocket, data: RawData): void {
    if (this.ws !== ws) return;
    this.lastMessageAt = Date.now();
    const text = rawToString(data);

    // Quickly discard state_changed events of entities other than person/zone
    // without parsing the JSON (Home Assistant sends a lot of them).
    if (text.includes('"type":"event"') && !text.includes('person.') && !text.includes('zone.')) return;

    let msg: unknown;
    try {
      msg = JSON.parse(text);
    } catch {
      return;
    }
    if (!isRecord(msg)) return;

    switch (asString(msg['type'])) {
      case 'auth_required':
        this.send({ type: 'auth', access_token: this.getSettings().token });
        break;
      case 'auth_ok':
        this.reconnectAttempt = 0;
        this.setStatus('ready');
        this.subscribeId = this.nextId++;
        this.send({ id: this.subscribeId, type: 'subscribe_events', event_type: 'state_changed' });
        this.requestStates();
        this.startHeartbeat(ws);
        break;
      case 'auth_invalid':
        logError('HA: invalid access token.');
        this.setStatus('auth_error');
        ws.close();
        break;
      case 'result': {
        const id = msg['id'];
        if (typeof id !== 'number') break;
        if (this.statesRequestIds.delete(id)) {
          if (msg['success'] === true && Array.isArray(msg['result'])) {
            const states: HaEntityState[] = [];
            for (const raw of msg['result']) {
              const state = toEntityState(raw);
              if (state && isTracked(state.entityId)) states.push(state);
            }
            this.emit('states', states);
          } else {
            logError('HA: get_states failed.');
          }
        } else if (id === this.subscribeId && msg['success'] !== true) {
          logError('HA: state_changed subscription failed.');
        }
        break;
      }
      case 'event': {
        if (msg['id'] !== this.subscribeId) break;
        const event = msg['event'];
        if (!isRecord(event) || !isRecord(event['data'])) break;
        const entityId = asString(event['data']['entity_id']);
        if (!entityId || !isTracked(entityId)) break;
        const rawNew = event['data']['new_state'];
        const newState = rawNew === null || rawNew === undefined ? null : toEntityState(rawNew);
        if (rawNew !== null && rawNew !== undefined && !newState) break;
        const change: HaStateChange = { entityId, newState };
        this.emit('stateChanged', change);
        break;
      }
      default:
        break;
    }
  }
}
