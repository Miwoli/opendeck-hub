// Usage -> Nocturne Value tile: "34%", bar with thresholds (Mint <70, Ember 70-90, Alert >90),
// name, reset time; errors as the Alert "!" tile ("Session · Expired").

import { type TileSpec, errorTile, usageTile } from '@miwoli/deck-core';
import type { UsageErrorKind, UsageWindow } from './claudeUsageClient.ts';
import { formatRelative, formatWeekday } from './format.ts';

export type LimitKey = 'five_hour' | 'seven_day';

export function limitTile(name: string, limit: LimitKey, win: UsageWindow | undefined, now = new Date()): TileSpec {
  if (!win) return errorTile({ name, status: 'no data' });
  const reset = limit === 'five_hour' ? formatRelative(win.resets_at, now) : formatWeekday(win.resets_at, now);
  return usageTile({ percent: win.utilization, name, status: win.utilization > 90 ? `limit · ${reset}` : reset });
}

export function limitErrorTile(name: string, kind: UsageErrorKind | 'no_key'): TileSpec {
  const status = kind === 'no_key' ? 'set key' : kind === 'auth' ? 'Expired' : kind === 'network' ? 'No network' : 'API error';
  return errorTile({ name, status });
}
