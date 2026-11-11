// com.miwoli.discord.ptt - mic open only while the key is held (keyDown -> pttDown, keyUp -> pttUp).
// Discord stays in Voice Activity mode; the userplugin unmutes on press and re-mutes on release only if it
// was the one that unmuted.

import { type ActionHandler, tileImage } from '@miwoli/deck-core';
import { ACTIONS, type PluginContext } from '../context.ts';
import { pttTile } from '../tiles.ts';

const held = new Set<string>();

export function drawPtt(ctx: PluginContext, context: string): void {
  ctx.client.setImage(context, tileImage(pttTile(ctx.bridge.state, held.size > 0)));
}

export function pttAction(ctx: PluginContext): ActionHandler {
  const release = (context: string): void => {
    if (!held.delete(context)) return;
    ctx.bridge.send('pttUp');
    ctx.render(ACTIONS.ptt);
  };
  return {
    uuid: ACTIONS.ptt,
    willAppear: (ev) => {
      drawPtt(ctx, ev.context);
      ctx.updateBridge();
    },
    willDisappear: (ev) => {
      // a profile switch while holding must not leave the mic open
      release(ev.context);
      ctx.updateBridge();
    },
    keyDown: (ev) => {
      const state = ctx.bridge.state;
      if (!state || state.mode === 'PUSH_TO_TALK' || !ctx.bridge.send('pttDown')) {
        ctx.client.showAlert(ev.context);
        return;
      }
      held.add(ev.context);
      ctx.render(ACTIONS.ptt);
    },
    keyUp: (ev) => release(ev.context),
  };
}
