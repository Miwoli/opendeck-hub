// Discord state -> Nocturne tile specs (muted = Alert, PTT transmitting = Ember,
// no bridge = offline with dashed outline). Pure functions, unit-tested.

import type { IconTileSpec } from '@miwoli/deck-core';
import type { DiscordState } from './bridge.ts';

export function micTile(state: DiscordState | null): IconTileSpec {
  if (!state) return { template: 'icon', tone: 'offline', glyph: 'mic', name: 'Mic', status: 'offline' };
  if (state.serverMute) return { template: 'icon', tone: 'alert', glyph: 'micOff', name: 'Mic', status: 'Server' };
  // deafen implies mute in Discord
  if (state.selfMute || state.selfDeaf) return { template: 'icon', tone: 'alert', glyph: 'micOff', name: 'Mic', status: 'Muted' };
  return { template: 'icon', glyph: 'mic', name: 'Mic', status: 'On', statusTone: 'ok' };
}

export function headphonesTile(state: DiscordState | null): IconTileSpec {
  if (!state) return { template: 'icon', tone: 'offline', glyph: 'headphones', name: 'Headphones', status: 'offline' };
  if (state.serverDeaf) return { template: 'icon', tone: 'alert', glyph: 'headphonesOff', name: 'Headphones', status: 'Server' };
  if (state.selfDeaf) return { template: 'icon', tone: 'alert', glyph: 'headphonesOff', name: 'Headphones', status: 'Muted' };
  return { template: 'icon', glyph: 'headphones', name: 'Headphones', status: 'On', statusTone: 'ok' };
}

/** `pressed` = the PTT key is held right now (instant feedback before Discord confirms). */
export function pttTile(state: DiscordState | null, pressed: boolean): IconTileSpec {
  if (!state) return { template: 'icon', tone: 'offline', glyph: 'ptt', name: 'PTT', status: 'offline' };
  // Discord's own PTT mode only reacts to its key binding while Vesktop has focus; the deck needs Voice Activity
  if (state.mode === 'PUSH_TO_TALK') return { template: 'icon', tone: 'idle', glyph: 'ptt', name: 'PTT', status: 'set VAD', statusTone: 'warn' };
  if (pressed || state.ptt) return { template: 'icon', tone: 'on', glyph: 'pttActive', name: 'PTT', status: 'Talking' };
  return { template: 'icon', tone: 'idle', glyph: 'ptt', name: 'PTT', status: 'Hold' };
}
