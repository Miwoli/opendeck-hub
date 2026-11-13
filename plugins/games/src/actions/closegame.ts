// com.miwoli.games.closegame - hold 1 s + confirm (like Power), then SIGTERM/SIGKILL the running game's process
// tree (Steam reaper / lutris-wrapper descendants only). Shows "no game" when nothing is running.

import { type ActionHandler, HoldToConfirm, tileImage } from '@miwoli/deck-core';
import type { GamesContext } from '../context.ts';
import { closeGame, findRunningGame, readProcs } from '../gameProcess.ts';
import type { Game } from '../library.ts';
import { closeGameTile } from '../tiles.ts';

export const ACTION = 'com.miwoli.games.closegame';
const POLL_MS = 5000;

export function closeGameAction(ctx: GamesContext, procRoot = process.env['OPENDECK_PROC_ROOT'] || '/proc'): ActionHandler & { dispose(): void } {
  const holds = new Map<string, HoldToConfirm>();
  let running = false;
  let game: Game | null = null;
  let cover: string | null = null;
  let timer: NodeJS.Timeout | null = null;

  const draw = (context: string): void => {
    const view = holds.get(context)?.state ?? { phase: 'idle' as const };
    ctx.client.setImage(context, tileImage(closeGameTile(view, running, game, cover)));
  };
  let checking = false;
  const check = async (): Promise<void> => {
    if (checking) return;
    checking = true;
    try {
      const found = findRunningGame(readProcs(procRoot));
      running = found !== null;
      // Lutris processes carry no game id, so only Steam games resolve to a cover.
      const next = found?.source === 'steam' ? ((await ctx.games().catch((): Game[] => [])).find((g) => g.source === 'steam' && g.id === found.appid) ?? null) : null;
      if (next?.id !== game?.id) cover = await ctx.cover(next?.cover ?? null);
      game = next;
    } finally {
      checking = false;
    }
    for (const v of ctx.client.visibleInstances(ACTION)) draw(v.context);
  };
  const schedule = (): void => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (ctx.client.visibleInstances(ACTION).length === 0) return;
    timer = setTimeout(() => void check().finally(schedule), POLL_MS);
  };

  const holdFor = (context: string): HoldToConfirm => {
    let hold = holds.get(context);
    if (!hold) {
      hold = new HoldToConfirm({
        onChange: () => draw(context),
        onConfirm: async () => {
          const game = findRunningGame(readProcs(procRoot));
          if (!game) {
            ctx.client.showAlert(context);
            return;
          }
          ctx.log.info(`closing ${game.source} game (marker pid ${game.pid}, appid ${game.appid ?? '-'}, ${game.descendants.length} processes)`);
          await closeGame(game, { procRoot });
          await check();
        },
        onError: (err) => {
          ctx.log.error('closing game failed', err);
          ctx.client.showAlert(context);
        },
      });
      holds.set(context, hold);
    }
    return hold;
  };

  return {
    uuid: ACTION,
    willAppear: async (ev) => {
      holdFor(ev.context);
      await check();
      schedule();
    },
    willDisappear: (ev) => {
      holds.get(ev.context)?.cancel();
      holds.delete(ev.context);
      schedule();
    },
    keyDown: (ev) => {
      const hold = holdFor(ev.context);
      if (!running && hold.state.phase === 'idle') {
        ctx.client.showAlert(ev.context);
        return;
      }
      hold.keyDown();
    },
    keyUp: (ev) => holdFor(ev.context).keyUp(),
    dispose() {
      for (const h of holds.values()) h.cancel();
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}
