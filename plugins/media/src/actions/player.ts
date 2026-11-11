// com.miwoli.media.player - now playing tile (state shared between pages).
// Gestures (keyDown -> keyUp only): short press = play/pause; double tap and long press (>= 500 ms) are configurable
// (switch player / next / previous / nothing; defaults: double tap = switch, long press = next).
// A double tap needs the first tap to wait DOUBLE_TAP_MS, so play/pause is delayed only when the double tap would
// do something (e.g. "switch" with a single active player stays instant).
// Which player automatic tiles show is shared (PlayerFocus): the one picked by "switch", else the last one that started.
// MPRIS is polled only while a tile is visible. Titles are never logged (privacy).

import {
  type ActionHandler,
  type JsonObject,
  type Logger,
  type OpenActionClient,
  SettingsStore,
  isObject,
  readBoolean,
  readEnum,
  readString,
  tileImage,
} from '@miwoli/deck-core';
import { CoverCache } from '../cover.ts';
import {
  type PlayerCommand,
  type PlayerState,
  type Runner,
  PlayerFocus,
  choosePlayer,
  control,
  nextPlayer,
  playerLabel,
  preferredPlayer,
  readPlayers,
} from '../mpris.ts';
import { mediaTile } from '../tiles.ts';

export const ACTION = 'com.miwoli.media.player';
const POLL_MS = 1500;
const LONG_PRESS_MS = 500;
const DOUBLE_TAP_MS = 300;
/** How long the status line names the player after a switch. */
const SOURCE_FLASH_MS = 2000;

const GESTURES = ['switch', 'next', 'previous', 'none'] as const;
export type Gesture = (typeof GESTURES)[number];

export interface PlayerSettings {
  /** bus name suffix, e.g. "spotify"; empty = automatic */
  preferred: string;
  longPress: Gesture;
  doubleTap: Gesture;
}

export function parsePlayerSettings(raw: JsonObject): PlayerSettings {
  return {
    preferred: readString(raw, 'preferred', '').trim(),
    longPress: readEnum(raw, 'longPress', GESTURES, 'next'),
    doubleTap: readEnum(raw, 'doubleTap', GESTURES, 'switch'),
  };
}

export interface PlayerDeps {
  client: OpenActionClient;
  log: Logger;
  runner?: Runner;
  coverCacheDir?: string;
}

interface TapState {
  pressedAt: number;
  /** pending single tap waiting for a possible second one */
  single: NodeJS.Timeout | null;
  /** this press is the second tap of a double tap */
  second: boolean;
}

export function playerAction({ client, log, runner, coverCacheDir }: PlayerDeps): ActionHandler & { dispose(): void } {
  const settings = new SettingsStore(parsePlayerSettings);
  const covers = new CoverCache();
  const focus = new PlayerFocus();
  const taps = new Map<string, TapState>();
  let players: PlayerState[] = [];
  let allowRemoteArt = false;
  let pollTimer: NodeJS.Timeout | null = null;
  let lastSummary = '';
  let sourceFlash: { bus: string; until: number } | null = null;
  let flashTimer: NodeJS.Timeout | null = null;

  client.on('globalSettings', (g) => {
    allowRemoteArt = readBoolean(g, 'allowRemoteArt', false);
  });

  function shown(context: string): PlayerState | null {
    return choosePlayer(players, settings.get(context).preferred, focus.current);
  }

  /** A tile with a running preferred player is pinned to it: "switch" does nothing there. */
  function switchTarget(context: string): PlayerState | null {
    if (preferredPlayer(players, settings.get(context).preferred)) return null;
    return nextPlayer(players, shown(context));
  }

  async function draw(context: string): Promise<void> {
    const player = shown(context);
    const cover = player?.artUrl
      ? await covers.get(player.artUrl, { allowRemote: allowRemoteArt, ...(coverCacheDir ? { cacheDir: coverCacheDir } : {}) })
      : null;
    const showSource = sourceFlash !== null && sourceFlash.bus === player?.bus && Date.now() < sourceFlash.until;
    if (client.isVisible(context)) client.setImage(context, tileImage(mediaTile(player, cover, { players, showSource })));
  }

  const drawAll = (): Promise<unknown> => Promise.all(client.visibleInstances(ACTION).map((v) => draw(v.context)));

  async function refresh(): Promise<void> {
    try {
      players = await readPlayers(runner);
    } catch (err) {
      log.error('reading MPRIS players failed', err);
      players = [];
    }
    focus.observe(players);
    // log only which players exist and their status, never titles
    const summary = players.map((p) => `${playerLabel(p.bus)}:${p.status}`).join(', ');
    if (summary !== lastSummary) log.info(`players: ${summary || 'none'}`);
    lastSummary = summary;
    await drawAll();
  }

  function schedulePoll(): void {
    if (pollTimer) return;
    if (client.visibleInstances(ACTION).length === 0) return;
    pollTimer = setTimeout(() => {
      pollTimer = null;
      void refresh().finally(schedulePoll);
    }, POLL_MS);
  }

  async function send(context: string, command: PlayerCommand): Promise<void> {
    const player = shown(context);
    if (!player) {
      client.showAlert(context);
      return;
    }
    try {
      await control(player.bus, command, runner);
    } catch (err) {
      log.error(`${command} failed`, err);
      client.showAlert(context);
    }
    setTimeout(() => void refresh(), 300);
  }

  async function switchPlayer(context: string): Promise<void> {
    const target = switchTarget(context);
    if (!target) {
      client.showAlert(context);
      return;
    }
    focus.set(target.bus);
    log.info(`switched to ${playerLabel(target.bus)}`);
    sourceFlash = { bus: target.bus, until: Date.now() + SOURCE_FLASH_MS };
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(() => {
      flashTimer = null;
      sourceFlash = null;
      void drawAll();
    }, SOURCE_FLASH_MS);
    await drawAll();
  }

  function perform(context: string, gesture: Gesture): Promise<void> | undefined {
    if (gesture === 'switch') return switchPlayer(context);
    if (gesture === 'next') return send(context, 'Next');
    if (gesture === 'previous') return send(context, 'Previous');
    return undefined;
  }

  /** Whether a double tap would do anything now (otherwise the single tap fires without waiting). */
  function doubleTapMatters(context: string): boolean {
    const gesture = settings.get(context).doubleTap;
    if (gesture === 'none') return false;
    if (gesture === 'switch') return switchTarget(context) !== null;
    return shown(context) !== null;
  }

  function clearTap(context: string): void {
    const tap = taps.get(context);
    if (tap?.single) clearTimeout(tap.single);
    taps.delete(context);
  }

  function sendPlayersToPi(context: string): void {
    client.sendToPropertyInspector(context, {
      event: 'players',
      players: players.map((p) => ({ id: p.bus.slice('org.mpris.MediaPlayer2.'.length).split('.')[0] ?? '', label: playerLabel(p.bus), status: p.status })),
      allowRemoteArt,
    });
  }

  return {
    uuid: ACTION,
    willAppear: async (ev) => {
      settings.update(ev.context, ev.payload.settings);
      allowRemoteArt = readBoolean(await client.getGlobalSettings().catch((): JsonObject => ({})), 'allowRemoteArt', false);
      await refresh();
      schedulePoll();
    },
    willDisappear: (ev) => {
      settings.delete(ev.context);
      clearTap(ev.context);
      if (client.visibleInstances(ACTION).length === 0 && pollTimer) {
        clearTimeout(pollTimer);
        pollTimer = null;
      }
    },
    didReceiveSettings: async (ev) => {
      settings.update(ev.context, ev.payload.settings);
      await draw(ev.context);
    },
    propertyInspectorDidAppear: (ev) => sendPlayersToPi(ev.context),
    sendToPlugin: async (ev) => {
      if (isObject(ev.payload) && ev.payload['event'] === 'getPlayers') {
        await refresh();
        sendPlayersToPi(ev.context);
      }
    },
    keyDown: (ev) => {
      const prev = taps.get(ev.context);
      const second = prev?.single != null;
      if (prev?.single) clearTimeout(prev.single);
      taps.set(ev.context, { pressedAt: Date.now(), single: null, second });
    },
    keyUp: async (ev) => {
      const tap = taps.get(ev.context);
      if (!tap || tap.single) return;
      const { longPress, doubleTap } = settings.get(ev.context);
      if (Date.now() - tap.pressedAt >= LONG_PRESS_MS) {
        taps.delete(ev.context);
        return perform(ev.context, longPress);
      }
      if (tap.second) {
        taps.delete(ev.context);
        return perform(ev.context, doubleTap);
      }
      if (!doubleTapMatters(ev.context)) {
        taps.delete(ev.context);
        return send(ev.context, 'PlayPause');
      }
      tap.single = setTimeout(() => {
        taps.delete(ev.context);
        void send(ev.context, 'PlayPause');
      }, DOUBLE_TAP_MS);
    },
    dispose() {
      if (pollTimer) clearTimeout(pollTimer);
      if (flashTimer) clearTimeout(flashTimer);
      pollTimer = null;
      flashTimer = null;
      for (const context of [...taps.keys()]) clearTap(context);
    },
  };
}
