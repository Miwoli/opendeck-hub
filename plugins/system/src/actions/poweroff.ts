// com.miwoli.system.poweroff - hold 1 s (keyDown -> keyUp), then press again within 3 s to run `systemctl poweroff`.
// Tile states: hold 1 s -> hold… (progress) -> Shut down? press · 3.

import { type ActionHandler, HoldToConfirm, type Logger, type OpenActionClient, holdTile, run, tileImage } from '@miwoli/deck-core';

export const ACTION = 'com.miwoli.system.poweroff';
const TILE = { glyph: 'power', name: 'Power', idleStatus: 'hold 1 s', confirmName: 'Shut down?' } as const;

/** Overridable for tests so they never power the machine off. */
export function poweroffCommand(env: NodeJS.ProcessEnv = process.env): [string, string[]] {
  return [env['OPENDECK_SYSTEMCTL'] || 'systemctl', ['poweroff']];
}

export function poweroffAction({ client, log }: { client: OpenActionClient; log: Logger }): ActionHandler & { dispose(): void } {
  const holds = new Map<string, HoldToConfirm>();

  const holdFor = (context: string): HoldToConfirm => {
    let hold = holds.get(context);
    if (!hold) {
      hold = new HoldToConfirm({
        onChange: (view) => client.setImage(context, tileImage(holdTile(view, TILE))),
        onConfirm: async () => {
          const [file, args] = poweroffCommand();
          log.info(`power off confirmed: ${file} ${args.join(' ')}`);
          await run(file, args, { timeoutMs: 10_000 });
        },
        onError: (err) => {
          log.error('power off failed', err);
          client.showAlert(context);
        },
      });
      holds.set(context, hold);
    }
    return hold;
  };

  return {
    uuid: ACTION,
    willAppear: (ev) => client.setImage(ev.context, tileImage(holdTile(holdFor(ev.context).state, TILE))),
    willDisappear: (ev) => {
      holds.get(ev.context)?.cancel();
      holds.delete(ev.context);
    },
    keyDown: (ev) => holdFor(ev.context).keyDown(),
    keyUp: (ev) => holdFor(ev.context).keyUp(),
    dispose() {
      for (const h of holds.values()) h.cancel();
      holds.clear();
    },
  };
}
