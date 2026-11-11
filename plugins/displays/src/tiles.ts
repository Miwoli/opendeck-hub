// Display layout -> Nocturne tile ("Screen 1 · Switch", active layout = Ember "Active").

import type { IconTileSpec } from '@miwoli/deck-core';
import { type Layout, type Output, connected, isActive, leftToRight } from './kscreen.ts';

export interface LayoutSettings {
  layout: Layout | null;
  /** user label from the PI; empty = default */
  label: string;
}

export type TilePhase = 'idle' | 'switching' | 'error';

export function defaultLabel(layout: Layout | null, outputs: readonly Output[]): string {
  if (!layout) return 'Screen';
  if (layout.kind === 'extend') return 'Extend';
  const index = leftToRight(outputs).findIndex((o) => o.name === layout.output);
  return index >= 0 ? `Screen ${index + 1}` : layout.output;
}

/** outputs === null: kscreen-doctor not readable (yet). */
export function layoutTile(settings: LayoutSettings, outputs: readonly Output[] | null, phase: TilePhase): IconTileSpec {
  const { layout } = settings;
  const glyph = layout?.kind === 'extend' ? 'monitorsExtend' : 'monitor';
  const name = settings.label.trim() || defaultLabel(layout, outputs ?? []);
  if (!layout) return { template: 'icon', tone: 'offline', glyph, name, status: 'set in PI' };
  if (phase === 'error') return { template: 'icon', tone: 'alert', glyph, name, status: 'error' };
  if (!outputs) return { template: 'icon', tone: 'offline', glyph, name, status: 'offline' };
  const available =
    layout.kind === 'single' ? connected(outputs).some((o) => o.name === layout.output) : connected(outputs).length >= 2;
  if (!available) return { template: 'icon', tone: 'offline', glyph, name, status: 'none' };
  if (phase === 'switching') return { template: 'icon', glyph, name, status: 'switching…' };
  if (isActive(layout, outputs)) return { template: 'icon', tone: 'on', glyph, name, status: 'Active' };
  return { template: 'icon', glyph, name, status: 'Switch' };
}
