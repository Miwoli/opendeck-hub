// Typed OpenAction WebSocket client: registration, reconnect with exponential backoff,
// routing by action UUID, visible-context tracking and deduplicated/throttled setImage.

import { createHash } from 'node:crypto';
import WebSocket from 'ws';
import type { PluginArgs } from './args.ts';
import { Emitter } from './emitter.ts';
import { type Logger, silentLogger } from './log.ts';
import {
  type Coordinates,
  type InboundEvent,
  type InstanceEvent,
  type JsonObject,
  type JsonValue,
  type OutboundMessage,
  type PropertyInspectorEvent,
  type SendToPluginEvent,
  parseInboundEvent,
} from './protocol.ts';

type MaybePromise = void | Promise<void>;

/** One module per action implements this; unknown hooks are simply not defined. */
export interface ActionHandler {
  readonly uuid: string;
  willAppear?(ev: InstanceEvent): MaybePromise;
  willDisappear?(ev: InstanceEvent): MaybePromise;
  keyDown?(ev: InstanceEvent): MaybePromise;
  keyUp?(ev: InstanceEvent): MaybePromise;
  didReceiveSettings?(ev: InstanceEvent): MaybePromise;
  propertyInspectorDidAppear?(ev: PropertyInspectorEvent): MaybePromise;
  propertyInspectorDidDisappear?(ev: PropertyInspectorEvent): MaybePromise;
  sendToPlugin?(ev: SendToPluginEvent): MaybePromise;
}

export interface VisibleInstance {
  action: string;
  context: string;
  device: string;
  coordinates: Coordinates;
  settings: JsonObject;
}

export interface ClientOptions {
  host?: string;
  logger?: Logger;
  reconnect?: { baseMs?: number; maxMs?: number; maxAttempts?: number };
  /** Minimum gap between two setImage calls for one context; later calls are coalesced. */
  imageMinIntervalMs?: number;
}

type ClientEvents = {
  connected: undefined;
  disconnected: undefined;
  gaveUp: undefined;
  globalSettings: JsonObject;
  event: InboundEvent;
};

interface ImageSlot {
  lastHash: string | null;
  lastSentAt: number;
  pending: string | null;
  timer: NodeJS.Timeout | null;
}

export function hashImage(image: string): string {
  return createHash('sha1').update(image).digest('hex');
}

export class OpenActionClient extends Emitter<ClientEvents> {
  private ws: WebSocket | null = null;
  private closing = false;
  private attempt = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private readonly actions = new Map<string, ActionHandler>();
  private readonly visible = new Map<string, VisibleInstance>();
  private readonly images = new Map<string, ImageSlot>();
  private globalSettings: JsonObject | null = null;
  private globalWaiters: Array<(s: JsonObject) => void> = [];
  private readonly log: Logger;
  private readonly host: string;
  private readonly baseMs: number;
  private readonly maxMs: number;
  private readonly maxAttempts: number;
  private readonly imageMinIntervalMs: number;

  private readonly args: PluginArgs;

  constructor(args: PluginArgs, options: ClientOptions = {}) {
    super();
    this.args = args;
    this.log = options.logger ?? silentLogger;
    this.host = options.host ?? '127.0.0.1';
    this.baseMs = options.reconnect?.baseMs ?? 500;
    this.maxMs = options.reconnect?.maxMs ?? 30_000;
    this.maxAttempts = options.reconnect?.maxAttempts ?? 10;
    this.imageMinIntervalMs = options.imageMinIntervalMs ?? 100;
  }

  get pluginUUID(): string {
    return this.args.pluginUUID;
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  register(...handlers: ActionHandler[]): this {
    for (const h of handlers) this.actions.set(h.uuid, h);
    return this;
  }

  connect(): void {
    this.closing = false;
    const ws = new WebSocket(`ws://${this.host}:${this.args.port}`);
    this.ws = ws;

    ws.on('open', () => {
      this.attempt = 0;
      this.sendRaw({ event: this.args.registerEvent, uuid: this.args.pluginUUID });
      this.log.info('connected to OpenDeck');
      this.emit('connected', undefined);
    });
    ws.on('message', (data) => this.handleMessage(data.toString()));
    ws.on('error', (err) => this.log.error('websocket error', err));
    ws.on('close', () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.resetImageSlots();
      this.emit('disconnected', undefined);
      if (!this.closing) this.scheduleReconnect();
    });
  }

  close(): void {
    this.closing = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.resetImageSlots();
    this.ws?.close();
  }

  private scheduleReconnect(): void {
    if (this.attempt >= this.maxAttempts) {
      this.log.error(`giving up after ${this.attempt} reconnect attempts`);
      this.emit('gaveUp', undefined);
      return;
    }
    const delay = Math.min(this.maxMs, this.baseMs * 2 ** this.attempt);
    this.attempt += 1;
    this.log.warn(`disconnected, reconnecting in ${delay} ms (attempt ${this.attempt})`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private handleMessage(text: string): void {
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch (err) {
      this.log.error('invalid JSON from OpenDeck', err);
      return;
    }
    const ev = parseInboundEvent(raw);
    if (!ev) return;
    this.track(ev);
    this.emit('event', ev);
    this.dispatch(ev);
  }

  private track(ev: InboundEvent): void {
    switch (ev.event) {
      case 'willAppear':
      case 'didReceiveSettings':
      case 'keyDown':
      case 'keyUp':
        if (ev.event === 'willAppear') this.dropImageSlot(ev.context);
        if (ev.event === 'willAppear' || this.visible.has(ev.context)) {
          this.visible.set(ev.context, {
            action: ev.action,
            context: ev.context,
            device: ev.device,
            coordinates: ev.payload.coordinates,
            settings: ev.payload.settings,
          });
        }
        break;
      case 'willDisappear':
        this.visible.delete(ev.context);
        this.dropImageSlot(ev.context);
        break;
      case 'didReceiveGlobalSettings': {
        this.globalSettings = ev.payload.settings;
        const waiters = this.globalWaiters;
        this.globalWaiters = [];
        for (const w of waiters) w(ev.payload.settings);
        this.emit('globalSettings', ev.payload.settings);
        break;
      }
      default:
        break;
    }
  }

  private dispatch(ev: InboundEvent): void {
    if (!('action' in ev)) return;
    const handler = this.actions.get(ev.action);
    if (!handler) return;
    const run = (fn: () => MaybePromise): void => {
      try {
        const result = fn();
        if (result instanceof Promise) result.catch((err: unknown) => this.log.error(`${ev.event} handler failed`, err));
      } catch (err) {
        this.log.error(`${ev.event} handler failed`, err);
      }
    };
    switch (ev.event) {
      case 'willAppear':
        return run(() => handler.willAppear?.(ev));
      case 'willDisappear':
        return run(() => handler.willDisappear?.(ev));
      case 'keyDown':
        return run(() => handler.keyDown?.(ev));
      case 'keyUp':
        return run(() => handler.keyUp?.(ev));
      case 'didReceiveSettings':
        return run(() => handler.didReceiveSettings?.(ev));
      case 'propertyInspectorDidAppear':
        return run(() => handler.propertyInspectorDidAppear?.(ev));
      case 'propertyInspectorDidDisappear':
        return run(() => handler.propertyInspectorDidDisappear?.(ev));
      case 'sendToPlugin':
        return run(() => handler.sendToPlugin?.(ev));
    }
  }

  /** Visible instances, optionally filtered by action UUID. Run background work only when non-empty. */
  visibleInstances(action?: string): VisibleInstance[] {
    const all = [...this.visible.values()];
    return action === undefined ? all : all.filter((v) => v.action === action);
  }

  isVisible(context: string): boolean {
    return this.visible.has(context);
  }

  // ---- outbound -------------------------------------------------------------------------------

  send(message: OutboundMessage): boolean {
    return this.sendRaw(message);
  }

  private sendRaw(message: object): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(message));
    return true;
  }

  /**
   * setImage with dedup by hash and per-context throttling. Every setImage makes OpenDeck write
   * the profile to disk, so identical images are skipped and bursts collapse to the latest one.
   */
  setImage(context: string, image: string): void {
    const slot = this.images.get(context) ?? { lastHash: null, lastSentAt: 0, pending: null, timer: null };
    this.images.set(context, slot);
    const wait = slot.lastSentAt + this.imageMinIntervalMs - Date.now();
    if (wait > 0) {
      slot.pending = image;
      slot.timer ??= setTimeout(() => {
        slot.timer = null;
        const next = slot.pending;
        slot.pending = null;
        if (next !== null) this.flushImage(context, slot, next);
      }, wait);
      return;
    }
    slot.pending = null;
    this.flushImage(context, slot, image);
  }

  private flushImage(context: string, slot: ImageSlot, image: string): void {
    const hash = hashImage(image);
    if (hash === slot.lastHash) return;
    if (this.send({ event: 'setImage', context, payload: { image } })) {
      slot.lastHash = hash;
      slot.lastSentAt = Date.now();
    }
  }

  /**
   * Forget everything about a context's image. The context is only the key position ("…Keypad.12.0"): a tile
   * removed and re-added there starts with the manifest default image, so a remembered hash would wrongly skip
   * the first setImage (observed as a recent-games tile stuck on its placeholder image).
   */
  private dropImageSlot(context: string): void {
    const slot = this.images.get(context);
    if (slot?.timer) clearTimeout(slot.timer);
    this.images.delete(context);
  }

  private resetImageSlots(): void {
    for (const slot of this.images.values()) if (slot.timer) clearTimeout(slot.timer);
    this.images.clear();
  }

  setTitle(context: string, title: string): void {
    this.send({ event: 'setTitle', context, payload: { title } });
  }

  setState(context: string, state: number): void {
    this.send({ event: 'setState', context, payload: { state } });
  }

  setSettings(context: string, settings: JsonObject): void {
    const v = this.visible.get(context);
    if (v) v.settings = settings;
    this.send({ event: 'setSettings', context, payload: settings });
  }

  getSettings(context: string): void {
    this.send({ event: 'getSettings', context });
  }

  setGlobalSettings(settings: JsonObject): void {
    this.globalSettings = settings;
    this.send({ event: 'setGlobalSettings', context: this.args.pluginUUID, payload: settings });
  }

  /** Last known global settings, or a fresh request answered by didReceiveGlobalSettings. */
  getGlobalSettings(options: { refresh?: boolean; timeoutMs?: number } = {}): Promise<JsonObject> {
    if (this.globalSettings && !options.refresh) return Promise.resolve(this.globalSettings);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.globalWaiters = this.globalWaiters.filter((w) => w !== waiter);
        reject(new Error('getGlobalSettings timed out'));
      }, options.timeoutMs ?? 5000);
      const waiter = (s: JsonObject): void => {
        clearTimeout(timer);
        resolve(s);
      };
      this.globalWaiters.push(waiter);
      this.send({ event: 'getGlobalSettings', context: this.args.pluginUUID });
    });
  }

  showAlert(context: string): void {
    this.send({ event: 'showAlert', context });
  }

  showOk(context: string): void {
    this.send({ event: 'showOk', context });
  }

  sendToPropertyInspector(context: string, payload: JsonValue): void {
    this.send({ event: 'sendToPropertyInspector', context, payload });
  }

  openUrl(url: string): void {
    this.send({ event: 'openUrl', payload: { url } });
  }

  logMessage(message: string): void {
    this.send({ event: 'logMessage', payload: { message } });
  }
}
