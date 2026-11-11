// com.miwoli.system.screenshot - `spectacle -b -n <-f|-m|-a> -o <file>` (background, no notification).
// Default folder = Spectacle's own default: <XDG_PICTURES_DIR>/Screenshots. Success = exit 0 and the file exists,
// shown as the Mint "Saved" state for 2 s.

import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  type ActionHandler,
  type IconTileSpec,
  type JsonObject,
  type Logger,
  type OpenActionClient,
  SettingsStore,
  readEnum,
  readTrimmed,
  run,
  tileImage,
} from '@miwoli/deck-core';
import { picturesDir } from '../userDirs.ts';

export const ACTION = 'com.miwoli.system.screenshot';
const FEEDBACK_MS = 2000;
const MODES = { fullscreen: { flag: '-f', label: 'Screen' }, current: { flag: '-m', label: 'Monitor' }, window: { flag: '-a', label: 'Window' } } as const;
type Mode = keyof typeof MODES;

export interface ScreenshotSettings {
  mode: Mode;
  folder: string;
}

export function parseScreenshotSettings(raw: JsonObject): ScreenshotSettings {
  return {
    mode: readEnum(raw, 'mode', ['fullscreen', 'current', 'window'] as const, 'fullscreen'),
    folder: readTrimmed(raw, 'folder', path.join(picturesDir(), 'Screenshots')),
  };
}

export function screenshotFile(folder: string, now = new Date()): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}_${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
  return path.join(folder, `Screenshot_${stamp}.png`);
}

export function screenshotTile(settings: ScreenshotSettings, phase: 'idle' | 'busy' | 'saved' | 'error'): IconTileSpec {
  if (phase === 'saved') return { template: 'icon', tone: 'success', glyph: 'check', name: 'Screenshot', status: 'Saved' };
  if (phase === 'error') return { template: 'icon', tone: 'alert', glyph: 'screenshot', name: 'Screenshot', status: 'error' };
  return { template: 'icon', glyph: 'screenshot', name: 'Screenshot', status: phase === 'busy' ? '…' : MODES[settings.mode].label };
}

export function spectacleBinary(env: NodeJS.ProcessEnv = process.env): string {
  return env['OPENDECK_SPECTACLE'] || 'spectacle';
}

export function screenshotAction({ client, log }: { client: OpenActionClient; log: Logger }): ActionHandler & { dispose(): void } {
  const settings = new SettingsStore(parseScreenshotSettings);
  const timers = new Map<string, NodeJS.Timeout>();
  const busy = new Set<string>();

  const draw = (context: string, phase: Parameters<typeof screenshotTile>[1]): void => {
    if (client.isVisible(context)) client.setImage(context, tileImage(screenshotTile(settings.get(context), phase)));
  };
  const resetLater = (context: string, ms: number): void => {
    const old = timers.get(context);
    if (old) clearTimeout(old);
    timers.set(context, setTimeout(() => {
      timers.delete(context);
      draw(context, 'idle');
    }, ms));
  };

  return {
    uuid: ACTION,
    willAppear: (ev) => {
      settings.update(ev.context, ev.payload.settings);
      draw(ev.context, 'idle');
    },
    didReceiveSettings: (ev) => {
      settings.update(ev.context, ev.payload.settings);
      draw(ev.context, 'idle');
    },
    willDisappear: (ev) => {
      const t = timers.get(ev.context);
      if (t) clearTimeout(t);
      timers.delete(ev.context);
      settings.delete(ev.context);
    },
    keyDown: async (ev) => {
      if (busy.has(ev.context)) return;
      busy.add(ev.context);
      const s = settings.get(ev.context);
      const file = screenshotFile(s.folder);
      draw(ev.context, 'busy');
      try {
        await mkdir(s.folder, { recursive: true });
        await run(spectacleBinary(), ['-b', '-n', MODES[s.mode].flag, '-o', file], { timeoutMs: 15_000 });
        await stat(file);
        log.info(`screenshot saved: ${file}`);
        draw(ev.context, 'saved');
        resetLater(ev.context, FEEDBACK_MS);
      } catch (err) {
        log.error('screenshot failed', err);
        client.showAlert(ev.context);
        draw(ev.context, 'error');
        resetLater(ev.context, FEEDBACK_MS + 1000);
      } finally {
        busy.delete(ev.context);
      }
    },
    dispose() {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    },
  };
}
