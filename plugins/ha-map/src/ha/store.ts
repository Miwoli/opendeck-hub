// Local state of Home Assistant person.* and zone.* entities. Emits 'change'
// only when the data really changed (small attribute changes
// irrelevant to the plugin do not cause redraws).

import { EventEmitter } from 'node:events';
import type { LatLon } from '../geo.js';
import { asNumber, asString } from '../util.js';
import type { HaEntityState, HaStateChange } from './haClient.js';

export interface PersonInfo {
  entityId: string;
  name: string;
  state: string;
  lat: number | null;
  lon: number | null;
  accuracy: number | null;
  /** Value of the entity_picture attribute (usually a path relative to the Home Assistant server) or null. */
  picture: string | null;
}

export interface ZoneInfo {
  entityId: string;
  name: string;
  lat: number;
  lon: number;
  radius: number;
}

// Marker colours (high contrast on the light OSM map, distinguishable).
const PALETTE = ['#e8590c', '#1c7ed6', '#2f9e44', '#ae3ec9', '#d6336c', '#0ca678', '#4263eb', '#f08c00'];

function toPerson(state: HaEntityState): PersonInfo | null {
  if (!state.entityId.startsWith('person.')) return null;
  const a = state.attributes;
  return {
    entityId: state.entityId,
    name: asString(a['friendly_name']) ?? state.entityId.slice('person.'.length),
    state: state.state,
    lat: asNumber(a['latitude']) ?? null,
    lon: asNumber(a['longitude']) ?? null,
    accuracy: asNumber(a['gps_accuracy']) ?? null,
    picture: asString(a['entity_picture']) ?? null,
  };
}

function toZone(state: HaEntityState): ZoneInfo | null {
  if (!state.entityId.startsWith('zone.')) return null;
  const a = state.attributes;
  const lat = asNumber(a['latitude']);
  const lon = asNumber(a['longitude']);
  if (lat === undefined || lon === undefined) return null;
  return {
    entityId: state.entityId,
    name: asString(a['friendly_name']) ?? state.entityId.slice('zone.'.length),
    lat,
    lon,
    radius: asNumber(a['radius']) ?? 0,
  };
}

/** Event: 'change' (no arguments). */
export class HaStore extends EventEmitter {
  readonly persons = new Map<string, PersonInfo>();
  readonly zones = new Map<string, ZoneInfo>();
  private signature = '';

  applySnapshot(states: readonly HaEntityState[]): void {
    this.persons.clear();
    this.zones.clear();
    for (const state of states) this.add(state);
    this.emitIfChanged();
  }

  applyChange(change: HaStateChange): void {
    if (change.newState === null) {
      this.persons.delete(change.entityId);
      this.zones.delete(change.entityId);
    } else {
      this.add(change.newState);
    }
    this.emitIfChanged();
  }

  home(): LatLon | null {
    const zone = this.zones.get('zone.home');
    return zone ? { lat: zone.lat, lon: zone.lon } : null;
  }

  sortedPersons(): PersonInfo[] {
    return [...this.persons.values()].sort((a, b) => a.entityId.localeCompare(b.entityId));
  }

  /** The colour depends on the person's position in the sorted list of ALL people - the same on the map and on the key. */
  colorFor(entityId: string): string {
    const index = this.sortedPersons().findIndex((p) => p.entityId === entityId);
    return PALETTE[(index < 0 ? 0 : index) % PALETTE.length] ?? '#1c7ed6';
  }

  private add(state: HaEntityState): void {
    const person = toPerson(state);
    if (person) this.persons.set(person.entityId, person);
    const zone = toZone(state);
    if (zone) this.zones.set(zone.entityId, zone);
  }

  private emitIfChanged(): void {
    const signature = JSON.stringify([this.sortedPersons(), [...this.zones.values()]]);
    if (signature === this.signature) return;
    this.signature = signature;
    this.emit('change');
  }
}
