// com.miwoli.games.launcher - opens the Steam or Lutris library (setting "platform").

import { type ActionHandler, readEnum, tileImage } from '@miwoli/deck-core';
import type { GamesContext } from '../context.ts';
import type { Source } from '../library.ts';
import { launcherTile } from '../tiles.ts';

export const ACTION = 'com.miwoli.games.launcher';

const platformOf = (settings: Parameters<typeof readEnum>[0]): Source => readEnum(settings, 'platform', ['steam', 'lutris'] as const, 'steam');

export function launcherAction(ctx: GamesContext): ActionHandler {
  return {
    uuid: ACTION,
    willAppear: (ev) => ctx.client.setImage(ev.context, tileImage(launcherTile(platformOf(ev.payload.settings)))),
    didReceiveSettings: (ev) => ctx.client.setImage(ev.context, tileImage(launcherTile(platformOf(ev.payload.settings)))),
    keyDown: async (ev) => {
      const platform = platformOf(ev.payload.settings);
      try {
        // steam://open/games shows the library in the running client (or starts Steam); plain `lutris` opens its window
        await ctx.launch(platform, platform === 'steam' ? ['steam://open/games'] : []);
      } catch (err) {
        ctx.log.error(`opening ${platform} failed`, err);
        ctx.client.showAlert(ev.context);
      }
    },
  };
}
