// Player state -> Cover tile: artwork, title/artist; paused = dimmed + play glyph.

// Several active players: pips on the top edge (one per player, playing = ember, shown = wide pill).
// Right after a switch the status line names the player (`showSource`) so it is clear which one is now controlled.

import type { CoverTileSpec } from '@miwoli/deck-core';
import { type PlayerState, activePlayers, playerLabel } from './mpris.ts';

export interface MediaTileOptions {
  /** all players, for the pips */
  players?: readonly PlayerState[];
  showSource?: boolean;
}

export function mediaTile(player: PlayerState | null, cover: string | null, { players = [], showSource = false }: MediaTileOptions = {}): CoverTileSpec {
  if (!player || player.status === 'Stopped') {
    return { template: 'cover', paused: true, name: player ? playerLabel(player.bus) : 'Media', status: player ? 'stopped' : 'nothing playing' };
  }
  const active = activePlayers(players);
  const name = player.title || playerLabel(player.bus);
  const base: CoverTileSpec = {
    template: 'cover',
    name,
    ...(cover ? { image: cover } : {}),
    ...(active.length > 1 ? { pips: { lit: active.map((p) => p.status === 'Playing'), current: active.findIndex((p) => p.bus === player.bus) } } : {}),
  };
  const source = showSource ? playerLabel(player.bus) : null;
  if (player.status === 'Paused') return { ...base, glyph: 'play', paused: true, status: source ?? 'Paused' };
  return { ...base, glyph: 'bars', status: source ?? (player.artist || playerLabel(player.bus)) };
}
