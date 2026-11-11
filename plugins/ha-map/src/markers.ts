// Builds map markers from the current state of the people.

import { initialOf } from './format.js';
import type { HaStore } from './ha/store.js';
import type { MapMarker } from './mapRenderer.js';

/** Only people that have coordinates (missing e.g. when the phone reports no GPS). */
export function buildMarkers(store: HaStore): MapMarker[] {
  const markers: MapMarker[] = [];
  for (const person of store.sortedPersons()) {
    if (person.lat === null || person.lon === null) continue;
    markers.push({
      entityId: person.entityId,
      initial: initialOf(person.name),
      color: store.colorFor(person.entityId),
      position: { lat: person.lat, lon: person.lon },
      accuracyM: person.accuracy,
    });
  }
  return markers;
}
