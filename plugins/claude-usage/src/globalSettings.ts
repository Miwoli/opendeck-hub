// Global settings shared by both actions (PI pi/global.html): sessionKey, cached orgId, refresh interval.

import { type JsonObject, readNumber, readTrimmed } from '@miwoli/deck-core';

export interface PluginGlobalSettings {
  sessionKey: string;
  orgId: string;
  refreshIntervalMinutes: number;
}

export const DEFAULT_REFRESH_INTERVAL_MINUTES = 5;

export function normalizeGlobalSettings(raw: JsonObject): PluginGlobalSettings {
  return {
    sessionKey: readTrimmed(raw, 'sessionKey', ''),
    orgId: readTrimmed(raw, 'orgId', ''),
    refreshIntervalMinutes: readNumber(raw, 'refreshIntervalMinutes', DEFAULT_REFRESH_INTERVAL_MINUTES, { min: 1, max: 120 }),
  };
}
