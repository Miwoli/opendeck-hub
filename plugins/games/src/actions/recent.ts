// com.miwoli.games.recent - slot 1-5 of the recently played list (Steam + Lutris, newest first); press = launch.

import { type ActionHandler, readNumber, tileImage } from '@miwoli/deck-core';
import type { GamesContext } from '../context.ts';
import type { Game } from '../library.ts';
import { recentTile } from '../tiles.ts';

export const ACTION = 'com.miwoli.games.recent';
const POLL_MS = 60_000;

const slotOf = (settings: Parameters<typeof readNumber>[0], column: number): number =>
  // default: column + 1, so five instances on the bottom row need no configuration
  Math.round(readNumber(settings, 'slot', column >= 0 ? column + 1 : 1, { min: 1, max: 5 }));

export function recentAction(ctx: GamesContext): ActionHandler & { dispose(): void } {
  let timer: NodeJS.Timeout | null = null;

  async function drawAll(force = false): Promise<void> {
    let games: Game[];
    try {
      games = await ctx.games(force);
    } catch (err) {
      ctx.log.error('reading game libraries failed', err);
      games = [];
    }
    await Promise.all(
      ctx.client.visibleInstances(ACTION).map(async (v) => {
        const slot = slotOf(v.settings, v.coordinates.column);
        const game = games[slot - 1] ?? null;
        ctx.client.setImage(v.context, tileImage(recentTile(game, slot, await ctx.cover(game?.cover ?? null))));
      }),
    );
  }

  const schedule = (): void => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (ctx.client.visibleInstances(ACTION).length === 0) return;
    timer = setTimeout(() => void drawAll(true).finally(schedule), POLL_MS);
  };

  return {
    uuid: ACTION,
    willAppear: async () => {
      await drawAll();
      schedule();
    },
    didReceiveSettings: () => drawAll(),
    willDisappear: () => schedule(),
    keyDown: async (ev) => {
      const games = await ctx.games().catch((): Game[] => []);
      const game = games[slotOf(ev.payload.settings, ev.payload.coordinates.column) - 1];
      if (!game) {
        ctx.client.showAlert(ev.context);
        return;
      }
      try {
        await ctx.launch(game.source, [game.source === 'steam' ? `steam://rungameid/${game.id}` : `lutris:rungameid/${game.id}`]);
        ctx.client.showOk(ev.context);
      } catch (err) {
        ctx.log.error(`launching ${game.source}:${game.id} failed`, err);
        ctx.client.showAlert(ev.context);
      }
    },
    dispose() {
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}
