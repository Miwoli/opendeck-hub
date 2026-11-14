// com.miwoli.__NAME__.hello - sample action: shows how many times the key was pressed. Replace with your own.

import { type ActionHandler, type OpenActionClient, type ValueTileSpec, tileImage } from '@miwoli/deck-core';

export const ACTION = 'com.miwoli.__NAME__.hello';

export function helloTile(presses: number): ValueTileSpec {
  return { template: 'value', value: String(presses), name: '__TITLE__', status: presses === 1 ? 'press' : 'presses' };
}

export function helloAction({ client }: { client: OpenActionClient }): ActionHandler {
  const presses = new Map<string, number>();
  const draw = (context: string): void => client.setImage(context, tileImage(helloTile(presses.get(context) ?? 0)));

  return {
    uuid: ACTION,
    willAppear: (ev) => draw(ev.context),
    willDisappear: (ev) => {
      presses.delete(ev.context);
    },
    keyDown: (ev) => {
      presses.set(ev.context, (presses.get(ev.context) ?? 0) + 1);
      draw(ev.context);
    },
  };
}
