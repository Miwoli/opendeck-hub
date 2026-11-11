// com.miwoli.discord.mic - toggles self-mute in Discord.

import { type ActionHandler, tileImage } from '@miwoli/deck-core';
import { ACTIONS, type PluginContext } from '../context.ts';
import { micTile } from '../tiles.ts';

export function drawMic(ctx: PluginContext, context: string): void {
  ctx.client.setImage(context, tileImage(micTile(ctx.bridge.state)));
}

export function micAction(ctx: PluginContext): ActionHandler {
  return {
    uuid: ACTIONS.mic,
    willAppear: (ev) => {
      drawMic(ctx, ev.context);
      ctx.updateBridge();
    },
    willDisappear: () => ctx.updateBridge(),
    keyDown: (ev) => {
      if (!ctx.bridge.send('toggleMute')) ctx.client.showAlert(ev.context);
    },
  };
}
