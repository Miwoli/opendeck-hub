// Person key in the Nocturne style ("Alex · Home"): avatar (HA picture or initial on Iris)
// with a presence dot, name, and status = "Home" (Mint) / distance from home / place. Uses the shared renderer.

import type { IconTileSpec } from '@miwoli/deck-core';
import { placeLabel } from './format.js';
import { formatDistance, haversineMeters } from './geo.js';
import type { AvatarImage } from './render.js';
import type { HaStatus } from './ha/haClient.js';
import type { PersonInfo } from './ha/store.js';
import type { PersonSettings } from './settings.js';

export interface PersonTileInput {
  settings: PersonSettings;
  person: PersonInfo | undefined;
  home: { lat: number; lon: number } | null;
  avatar: AvatarImage | null;
  status: HaStatus;
}

function personStatus(person: PersonInfo, settings: PersonSettings, home: PersonTileInput['home']): { text: string; atHome: boolean } {
  const atHome = person.state === 'home';
  if (atHome) return { text: 'Home', atHome };
  const distance = home && person.lat !== null && person.lon !== null ? formatDistance(haversineMeters(home, { lat: person.lat, lon: person.lon })) : null;
  const place = placeLabel(person.state);
  // in a named zone (Work, School…) the zone says more than the distance
  if (settings.display === 'place' || person.state !== 'not_home') return { text: place !== '—' ? place : (distance ?? '—'), atHome };
  return { text: distance ?? place, atHome };
}

export function personTile(input: PersonTileInput): IconTileSpec {
  const { settings, person, status } = input;
  if (settings.entityId === '') return { template: 'icon', tone: 'offline', mark: '?', name: 'Person', status: 'select in PI' };
  if (!person) {
    if (status === 'not_configured') return { template: 'icon', tone: 'offline', mark: '?', name: 'Person', status: 'set HA in PI' };
    if (status === 'auth_error') return { template: 'icon', tone: 'alert', mark: '!', name: 'Person', status: 'bad HA token' };
    if (status === 'ready') return { template: 'icon', tone: 'offline', mark: '?', name: 'Person', status: 'no person' };
    return { template: 'icon', tone: 'offline', mark: '…', name: 'Person', status: 'connecting…' };
  }
  const { text, atHome } = personStatus(person, settings, input.home);
  const avatar = {
    initial: person.name,
    presence: atHome ? ('home' as const) : ('away' as const),
    ...(settings.showAvatar && input.avatar ? { image: `data:${input.avatar.mime};base64,${input.avatar.b64}` } : {}),
  };
  // stale data (HA connection lost): keep the last known state but mark the tile offline (dashed)
  const stale = status !== 'ready';
  return {
    template: 'icon',
    avatar,
    name: person.name,
    status: text,
    ...(atHome && !stale ? { statusTone: 'ok' as const } : {}),
    ...(stale ? { dashed: true, statusTone: 'dim' as const } : {}),
  };
}

/** Map tile without anything to show (no locations yet / HA not connected): Nocturne message tile. */
export function mapMessageTile(status: HaStatus): IconTileSpec {
  if (status === 'not_configured') return { template: 'icon', tone: 'offline', glyph: 'map', name: 'Map', status: 'set HA in PI' };
  if (status === 'auth_error') return { template: 'icon', tone: 'alert', glyph: 'map', name: 'Map', status: 'bad HA token' };
  if (status === 'ready') return { template: 'icon', tone: 'offline', glyph: 'map', name: 'Map', status: 'no data' };
  return { template: 'icon', tone: 'offline', glyph: 'map', name: 'Map', status: 'connecting…' };
}
