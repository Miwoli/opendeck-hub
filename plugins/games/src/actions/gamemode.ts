// com.miwoli.games.gamemode - toggle with state only (CONCEPT.md: what "Game mode" does is decided later).
// The state lives in global settings so it survives restarts and is shared by every instance.

import { type ActionHandler, type JsonObject, readBoolean, tileImage } from '@miwoli/deck-core';
import type { GamesContext } from '../context.ts';
import { gameModeTile } from '../tiles.ts';

export const ACTION = 'com.miwoli.games.gamemode';

export function gameModeAction(ctx: GamesContext): ActionHandler {
  let on = false;
  const drawAll = (): void => {
    for (const v of ctx.client.visibleInstances(ACTION)) ctx.client.setImage(v.context, tileImage(gameModeTile(on)));
  };
  ctx.client.on('globalSettings', (g) => {
    on = readBoolean(g, 'gameMode', false);
    drawAll();
  });
  return {
    uuid: ACTION,
    willAppear: async (ev) => {
      on = readBoolean(await ctx.client.getGlobalSettings().catch((): JsonObject => ({})), 'gameMode', false);
      ctx.client.setImage(ev.context, tileImage(gameModeTile(on)));
    },
    keyDown: async () => {
      on = !on;
      const global = await ctx.client.getGlobalSettings().catch((): JsonObject => ({}));
      ctx.client.setGlobalSettings({ ...global, gameMode: on });
      ctx.log.info(`game mode ${on ? 'on' : 'off'}`);
      drawAll();
    },
  };
}
