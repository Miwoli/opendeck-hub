// Semantic builders for the recurring tile states, so plugins don't re-derive colours.

import type { HoldView } from '../hold.ts';
import type { GlyphName } from './glyphs.ts';
import type { IconTileSpec, ValueTileSpec } from './tiles.ts';
import { usageColor, usageLevel } from './tokens.ts';

/** Percentage tile with threshold colours (Mint <70, Ember 70–90, Alert >90). */
export function usageTile(opts: { percent: number; name: string; status?: string }): ValueTileSpec {
  const p = Math.max(0, Math.min(100, opts.percent));
  const level = usageLevel(p);
  return {
    template: 'value',
    name: opts.name,
    ...(opts.status !== undefined ? { status: opts.status } : {}),
    tone: level === 'alert' ? 'alert' : 'neutral',
    statusTone: level === 'warn' ? 'warn' : 'default',
    value: `${Math.round(p)}%`,
    bar: { fraction: p / 100, color: usageColor(p) },
  };
}

/** Data/API error ("Session · Expired"): alert tile with "!" mark. */
export function errorTile(opts: { name: string; status: string }): IconTileSpec {
  return { template: 'icon', tone: 'alert', mark: '!', name: opts.name, status: opts.status };
}

/** Value tile without data (HA offline etc.): dashed outline and "--". */
export function offlineValueTile(opts: { name: string; status?: string }): ValueTileSpec {
  return { template: 'value', tone: 'offline', value: '--', name: opts.name, status: opts.status ?? 'Offline' };
}

export interface HoldTileOptions {
  glyph: GlyphName;
  name: string;
  idleStatus: string;
  /** Tone at rest: 'neutral' (Power) or 'danger' (Close game). */
  idleTone?: 'neutral' | 'danger';
  holdingStatus?: string;
  confirmName: string;
  /** Status in the confirm phase; receives the remaining seconds. */
  confirmStatus?: (secondsLeft: number) => string;
}

/** Maps a HoldToConfirm view to a tile (Power: idle -> hold… -> Shut down? press · 3). */
export function holdTile(view: HoldView, o: HoldTileOptions): IconTileSpec {
  switch (view.phase) {
    case 'idle':
      return { template: 'icon', tone: o.idleTone ?? 'neutral', glyph: o.glyph, name: o.name, status: o.idleStatus };
    case 'holding':
      return {
        template: 'icon',
        tone: 'alert',
        glyph: o.glyph,
        name: o.name,
        status: o.holdingStatus ?? 'hold…',
        holdProgress: view.progress,
      };
    case 'confirm':
      return {
        template: 'icon',
        tone: 'confirm',
        glyph: o.glyph,
        name: o.confirmName,
        status: (o.confirmStatus ?? ((s) => `press · ${s}`))(view.secondsLeft),
      };
  }
}
