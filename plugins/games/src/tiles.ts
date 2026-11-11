// Games page tiles: Steam / Lutris (Iris nav), recent 1-5 (Cover), Game mode (Ember when on),
// Close game (danger, hold 1 s + confirm).

import { type CoverTileSpec, type HoldView, type IconTileSpec, holdTile } from '@miwoli/deck-core';
import type { Game, Source } from './library.ts';

export const SOURCE_LABEL: Record<Source, string> = { steam: 'Steam', lutris: 'Lutris' };

export function launcherTile(platform: Source): IconTileSpec {
  return { template: 'icon', tone: 'nav', glyph: platform, name: SOURCE_LABEL[platform], status: 'Library' };
}

export function recentTile(game: Game | null, slot: number, cover: string | null): CoverTileSpec {
  if (!game) return { template: 'cover', paused: true, name: `Game ${slot}`, status: 'empty' };
  return { template: 'cover', name: game.name, status: SOURCE_LABEL[game.source], ...(cover ? { image: cover } : {}) };
}

export function gameModeTile(on: boolean): IconTileSpec {
  return on
    ? { template: 'icon', tone: 'on', glyph: 'bolt', name: 'Game mode', status: 'On' }
    : { template: 'icon', glyph: 'bolt', name: 'Game mode', status: 'Off' };
}

const CLOSE = { glyph: 'close', name: 'Close game', idleStatus: 'hold 1 s', idleTone: 'danger', confirmName: 'Close?' } as const;

export function closeGameTile(view: HoldView, running: boolean): IconTileSpec {
  if (!running && view.phase === 'idle') return { template: 'icon', tone: 'offline', glyph: 'close', name: 'Close game', status: 'no game' };
  return holdTile(view, CLOSE);
}
