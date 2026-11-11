// com.miwoli.homeassistant.temperature - shows a temperature sensor; a press toggles the configured entity
// (for example a non-dimmable light exposed as a switch entity, toggled via
// homeassistant.toggle). HA connection only while a tile is visible.

import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  type ActionHandler,
  type JsonObject,
  type Logger,
  type OpenActionClient,
  SettingsStore,
  isObject,
  readNumber,
  readString,
  readTrimmed,
  tileImage,
} from '@miwoli/deck-core';
import type { EntityState, HaClient } from '../haClient.ts';
import { type TemperatureSettings, temperatureTile } from '../tiles.ts';

export const ACTION = 'com.miwoli.homeassistant.temperature';
const STOP_DELAY_MS = 3000;
const ENTITY = /^[a-z_]+\.[a-z0-9_]+$/;

export function parseTemperatureSettings(raw: JsonObject): TemperatureSettings {
  const entity = (key: string): string => {
    const v = readTrimmed(raw, key, '').toLowerCase();
    return ENTITY.test(v) ? v : '';
  };
  return { sensor: entity('sensor'), toggle: entity('toggle'), label: readString(raw, 'label', '').trim(), min: readNumber(raw, 'min', 10), max: readNumber(raw, 'max', 30) };
}

/** Explicit PI action "use HA Map's address and token": reads ha-map's global settings file (same user, local). */
export async function readHaMapSettings(file = path.join(os.homedir(), '.config', 'opendeck', 'settings', 'com.miwoli.ha-map.sdPlugin.json')): Promise<{ haUrl: string; token: string } | null> {
  try {
    const raw: unknown = JSON.parse(await readFile(file, 'utf8'));
    if (isObject(raw) && typeof raw['haUrl'] === 'string' && typeof raw['token'] === 'string' && raw['haUrl'] && raw['token']) {
      return { haUrl: raw['haUrl'], token: raw['token'] };
    }
  } catch {
    // ha-map not installed/configured
  }
  return null;
}

// a type alias (not an interface) so it is assignable to JsonValue for sendToPropertyInspector
export type EntityChoice = { id: string; name: string };

/**
 * Short, pre-filtered lists for the PI <select>s. A <datalist> with all ~450 sensor/light/switch entities, rebuilt
 * every 5 s, froze OpenDeck's WebKitGTK window while the user picked an entry.
 */
export function entityChoices(states: ReadonlyMap<string, EntityState>): { temperature: EntityChoice[]; toggles: EntityChoice[] } {
  const choice = (id: string, st: EntityState): EntityChoice => {
    const name = st.attributes['friendly_name'];
    return { id, name: typeof name === 'string' && name ? name : id };
  };
  const temperature: EntityChoice[] = [];
  const toggles: EntityChoice[] = [];
  for (const [id, st] of states) {
    const unit = st.attributes['unit_of_measurement'];
    if (id.startsWith('sensor.') && (st.attributes['device_class'] === 'temperature' || unit === '°C' || unit === '°F')) temperature.push(choice(id, st));
    else if (/^(light|switch|input_boolean)\./.test(id)) toggles.push(choice(id, st));
  }
  const byName = (a: EntityChoice, b: EntityChoice): number => a.name.localeCompare(b.name, 'pl');
  return { temperature: temperature.sort(byName), toggles: toggles.sort(byName) };
}

export function temperatureAction({ client, log, ha }: { client: OpenActionClient; log: Logger; ha: HaClient }): ActionHandler & { dispose(): void } {
  const settings = new SettingsStore(parseTemperatureSettings);
  let stopTimer: NodeJS.Timeout | null = null;

  const draw = (context: string): void => {
    const s = settings.get(context);
    client.setImage(context, tileImage(temperatureTile(s, ha.status, ha.states.get(s.sensor), ha.states.get(s.toggle))));
  };
  const drawAll = (): void => {
    for (const v of client.visibleInstances(ACTION)) draw(v.context);
  };
  ha.on('status', (status) => {
    log.info(`Home Assistant: ${status}`);
    drawAll();
  });
  ha.on('entity', (id) => {
    for (const v of client.visibleInstances(ACTION)) {
      const s = settings.get(v.context);
      if (s.sensor === id || s.toggle === id) draw(v.context);
    }
  });

  const applyGlobal = (g: JsonObject): void => ha.configure(readString(g, 'haUrl', ''), readString(g, 'token', ''));
  client.on('globalSettings', applyGlobal);

  const updateConnection = (): void => {
    if (client.visibleInstances(ACTION).length > 0) {
      if (stopTimer) clearTimeout(stopTimer);
      stopTimer = null;
      ha.start();
    } else if (!stopTimer) {
      stopTimer = setTimeout(() => {
        stopTimer = null;
        if (client.visibleInstances(ACTION).length === 0) ha.stop();
      }, STOP_DELAY_MS);
    }
  };

  return {
    uuid: ACTION,
    willAppear: async (ev) => {
      settings.update(ev.context, ev.payload.settings);
      applyGlobal(await client.getGlobalSettings().catch((): JsonObject => ({})));
      draw(ev.context);
      updateConnection();
    },
    willDisappear: (ev) => {
      settings.delete(ev.context);
      updateConnection();
    },
    didReceiveSettings: (ev) => {
      settings.update(ev.context, ev.payload.settings);
      draw(ev.context);
    },
    sendToPlugin: async (ev) => {
      if (!isObject(ev.payload)) return;
      if (ev.payload['event'] === 'importHaMap') {
        const imported = await readHaMapSettings();
        if (imported) {
          const global = await client.getGlobalSettings().catch((): JsonObject => ({}));
          client.setGlobalSettings({ ...global, ...imported });
          applyGlobal({ ...global, ...imported });
        }
        // never echo the token back to the PI
        client.sendToPropertyInspector(ev.context, { event: 'imported', ok: imported !== null, haUrl: imported?.haUrl ?? '' });
      } else if (ev.payload['event'] === 'getEntities') {
        client.sendToPropertyInspector(ev.context, { event: 'entities', status: ha.status, ...entityChoices(ha.states) });
      }
    },
    keyDown: (ev) => {
      const { toggle } = settings.get(ev.context);
      if (!toggle || !ha.callService('homeassistant', 'toggle', toggle)) {
        client.showAlert(ev.context);
        return;
      }
      log.info(`toggle ${toggle}`);
    },
    dispose() {
      if (stopTimer) clearTimeout(stopTimer);
      ha.stop();
    },
  };
}
