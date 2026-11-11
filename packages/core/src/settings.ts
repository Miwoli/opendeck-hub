// Settings helpers. Settings come from OpenDeck/PI as untrusted JSON, so every field is read through
// a validator with a default. Per-action settings arrive in willAppear/didReceiveSettings payloads;
// global settings live in ~/.config/opendeck/settings/<UUID>.sdPlugin.json.

import { type JsonObject, type JsonValue, isJsonObject } from './protocol.ts';

export function asObject(value: unknown): JsonObject {
  return isJsonObject(value) ? value : {};
}

export function readString(o: JsonObject, key: string, fallback: string): string {
  const v = o[key];
  return typeof v === 'string' ? v : fallback;
}

export function readTrimmed(o: JsonObject, key: string, fallback: string): string {
  const v = readString(o, key, '').trim();
  return v === '' ? fallback : v;
}

export function readNumber(o: JsonObject, key: string, fallback: number, range: { min?: number; max?: number } = {}): number {
  const v = o[key];
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : Number.NaN;
  if (!Number.isFinite(n)) return fallback;
  if (range.min !== undefined && n < range.min) return range.min;
  if (range.max !== undefined && n > range.max) return range.max;
  return n;
}

export function readBoolean(o: JsonObject, key: string, fallback: boolean): boolean {
  const v = o[key];
  if (typeof v === 'boolean') return v;
  if (v === 'true') return true;
  if (v === 'false') return false;
  return fallback;
}

export function readEnum<T extends string>(o: JsonObject, key: string, values: readonly T[], fallback: T): T {
  const v = o[key];
  return typeof v === 'string' && (values as readonly string[]).includes(v) ? (v as T) : fallback;
}

/** A settings schema is just a pure function from raw JSON to a typed, fully defaulted object. */
export type SettingsParser<T> = (raw: JsonObject) => T;

/** Keeps typed per-context settings in sync with willAppear/didReceiveSettings payloads. */
export class SettingsStore<T> {
  private readonly byContext = new Map<string, T>();
  private readonly parse: SettingsParser<T>;

  constructor(parse: SettingsParser<T>) {
    this.parse = parse;
  }

  update(context: string, raw: JsonObject): T {
    const parsed = this.parse(raw);
    this.byContext.set(context, parsed);
    return parsed;
  }

  get(context: string): T {
    return this.byContext.get(context) ?? this.parse({});
  }

  delete(context: string): void {
    this.byContext.delete(context);
  }
}

/** Shallow merge that drops undefined values, for building setSettings payloads. */
export function mergeSettings(base: JsonObject, patch: Record<string, JsonValue | undefined>): JsonObject {
  const out: JsonObject = { ...base };
  for (const [k, v] of Object.entries(patch)) if (v !== undefined) out[k] = v;
  return out;
}
