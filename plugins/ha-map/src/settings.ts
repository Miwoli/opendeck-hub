// Plugin settings. Global (shared by all actions, stored
// by OpenDeck in ~/.config/opendeck/settings/<UUID>.sdPlugin.json - the
// Home Assistant token is stored there in plain text, see the README) and per action (person).

import { asNumber, asString, clamp, isRecord } from './util.js';

export const DEFAULT_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
// The OSM tile policy requires a User-Agent that identifies the application. You can add
// your contact details in the Property Inspector.
export const DEFAULT_USER_AGENT = 'OpenDeck-HAMap/0.1 (personal Home Assistant plugin for OpenDeck)';

export interface GlobalSettings {
  haUrl: string;
  token: string;
  tileUrl: string;
  userAgent: string;
  refreshSeconds: number;
  maxZoom: number;
}

function normalizeUrl(value: string | undefined): string {
  const trimmed = (value ?? '').trim().replace(/\/+$/, '');
  return /^https?:\/\/\S+$/i.test(trimmed) ? trimmed : '';
}

function validTileUrl(value: string | undefined): string | null {
  const trimmed = (value ?? '').trim();
  if (!/^https?:\/\/\S+$/i.test(trimmed)) return null;
  if (!trimmed.includes('{z}') || !trimmed.includes('{x}') || !trimmed.includes('{y}')) return null;
  return trimmed;
}

export function normalizeGlobalSettings(raw: unknown): GlobalSettings {
  const obj = isRecord(raw) ? raw : {};
  const userAgent = (asString(obj['userAgent']) ?? '').trim();
  return {
    haUrl: normalizeUrl(asString(obj['haUrl'])),
    token: (asString(obj['token']) ?? '').trim(),
    tileUrl: validTileUrl(asString(obj['tileUrl'])) ?? DEFAULT_TILE_URL,
    userAgent: userAgent.length > 0 ? userAgent : DEFAULT_USER_AGENT,
    refreshSeconds: clamp(Math.round(asNumber(obj['refreshSeconds']) ?? 20), 5, 600),
    maxZoom: clamp(Math.round(asNumber(obj['maxZoom']) ?? 16), 8, 18),
  };
}

export type PersonDisplay = 'distance' | 'place';

export interface PersonSettings {
  entityId: string;
  display: PersonDisplay;
  showAvatar: boolean;
}

export function normalizePersonSettings(raw: unknown): PersonSettings {
  const obj = isRecord(raw) ? raw : {};
  const entityId = (asString(obj['entityId']) ?? '').trim().toLowerCase();
  return {
    entityId: /^person\.[a-z0-9_]+$/.test(entityId) ? entityId : '',
    display: obj['display'] === 'place' ? 'place' : 'distance',
    showAvatar: obj['showAvatar'] !== false,
  };
}
