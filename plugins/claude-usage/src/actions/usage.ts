// com.miwoli.claude-usage.session / .weekly - one module for both: they differ only in the response field
// (five_hour / seven_day) and the name. Short press = refresh (20 s cache), long press >= 500 ms = forced refresh.
// The first fetch waits for global settings (fixes the startup race that logged "no sessionKey" while the key
// was configured). Polling only while a tile is visible.

import { type ActionHandler, type JsonObject, type Logger, type OpenActionClient, tileImage } from '@miwoli/deck-core';
import { UsageError } from '../claudeUsageClient.ts';
import { type PluginGlobalSettings, normalizeGlobalSettings } from '../globalSettings.ts';
import { type LimitKey, limitErrorTile, limitTile } from '../tiles.ts';
import type { UsageService } from '../usageService.ts';

const LONG_PRESS_MS = 500;

export interface UsageActionOptions {
  uuid: string;
  limit: LimitKey;
  name: string;
}

export interface UsageDeps {
  client: OpenActionClient;
  log: Logger;
  service: UsageService;
  settings: () => Promise<PluginGlobalSettings>;
}

export function usageAction(opts: UsageActionOptions, deps: UsageDeps): ActionHandler & { refreshAll(force: boolean): Promise<void>; dispose(): void } {
  const { client, log, service } = deps;
  const pressedAt = new Map<string, number>();
  let timer: NodeJS.Timeout | null = null;
  let intervalMin = 0;

  const visible = (): string[] => client.visibleInstances(opts.uuid).map((v) => v.context);

  function schedule(minutes: number): void {
    if (visible().length === 0) {
      if (timer) clearInterval(timer);
      timer = null;
      return;
    }
    if (timer && minutes === intervalMin) return;
    if (timer) clearInterval(timer);
    intervalMin = minutes;
    timer = setInterval(() => void refreshAll(false), minutes * 60_000);
  }

  async function refreshAll(force: boolean): Promise<void> {
    if (visible().length === 0) return;
    const s = await deps.settings();
    let image: string;
    if (!s.sessionKey) {
      image = tileImage(limitErrorTile(opts.name, 'no_key'));
    } else {
      try {
        const data = await service.getUsage({ sessionKey: s.sessionKey, orgId: s.orgId || undefined }, force);
        image = tileImage(limitTile(opts.name, opts.limit, data[opts.limit]));
      } catch (err) {
        const e = err instanceof UsageError ? err : new UsageError('unexpected', String(err));
        log.error(`${opts.limit}: ${e.kind} ${e.message}`);
        image = tileImage(limitErrorTile(opts.name, e.kind));
      }
    }
    for (const c of visible()) client.setImage(c, image);
    schedule(s.refreshIntervalMinutes);
  }

  return {
    uuid: opts.uuid,
    willAppear: () => refreshAll(false),
    willDisappear: (ev) => {
      pressedAt.delete(ev.context);
      schedule(intervalMin);
    },
    keyDown: (ev) => {
      pressedAt.set(ev.context, Date.now());
    },
    keyUp: async (ev) => {
      const start = pressedAt.get(ev.context);
      pressedAt.delete(ev.context);
      await refreshAll(start !== undefined && Date.now() - start >= LONG_PRESS_MS);
    },
    refreshAll,
    dispose() {
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
}

/** getGlobalSettings() resolves with the cached value or waits for didReceiveGlobalSettings. */
export function settingsLoader(client: OpenActionClient): () => Promise<PluginGlobalSettings> {
  return async () => normalizeGlobalSettings(await client.getGlobalSettings().catch((): JsonObject => ({})));
}
