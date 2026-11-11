// com.miwoli.discord.headphones - toggles self-deafen in Discord.

import { type ActionHandler, tileImage } from '@miwoli/deck-core';
import { ACTIONS, type PluginContext } from '../context.ts';
import { headphonesTile } from '../tiles.ts';

export function drawHeadphones(ctx: PluginContext, context: string): void {
  ctx.client.setImage(context, tileImage(headphonesTile(ctx.bridge.state)));
}

export function headphonesAction(ctx: PluginContext): ActionHandler {
  return {
    uuid: ACTIONS.headphones,
    willAppear: (ev) => {
      drawHeadphones(ctx, ev.context);
      ctx.updateBridge();
    },
    willDisappear: () => ctx.updateBridge(),
    keyDown: (ev) => {
      if (!ctx.bridge.send('toggleDeafen')) ctx.client.showAlert(ev.context);
    },
  };
}
