// Entry point of the OpenDeck "HA Map" plugin. Started by OpenDeck as:
// node bin/plugin.cjs -port <p> -pluginUUID <u> -registerEvent registerPlugin -info <json>

import { PersonAction } from './actions/personAction.js';
import { TileAction } from './actions/tileAction.js';
import { parsePluginArgs, PluginConnection } from './connection.js';
import { AvatarCache } from './ha/avatars.js';
import { HaClient, type HaStateChange } from './ha/haClient.js';
import { HaStore } from './ha/store.js';
import { logError, logInfo } from './logger.js';
import {
  getGlobalSettings,
  parseEvent,
  sendToPropertyInspector,
  type ReceivedEvent,
  type SendToPluginEvent,
} from './protocol.js';
import { normalizeGlobalSettings, type GlobalSettings } from './settings.js';

// How long to keep the Home Assistant connection after the Property Inspector opens
// (so the person list in the PI is current even when no key is visible).
const PI_LEASE_MS = 30_000;

const args = parsePluginArgs(process.argv.slice(2));
const connection = new PluginConnection(args);

let globalSettings: GlobalSettings = normalizeGlobalSettings({});
let leaseUntil = 0;

const store = new HaStore();
const ha = new HaClient(() => ({ haUrl: globalSettings.haUrl, token: globalSettings.token }));
ha.on('states', (states: Parameters<HaStore['applySnapshot']>[0]) => store.applySnapshot(states));
ha.on('stateChanged', (change: HaStateChange) => store.applyChange(change));

// Person avatars are fetched from Home Assistant (same server only); keys are redrawn once they load.
const avatars = new AvatarCache(
  () => ({ haUrl: globalSettings.haUrl, token: globalSettings.token }),
  () => personAction.refresh(),
);
const personAction = new PersonAction(connection, store, ha, avatars);
const tileAction = new TileAction(connection, store, ha, () => globalSettings);

// When the profile changes OpenDeck sends willDisappear for the old
// profile first and willAppear for the new one afterwards - a short delay before
// disconnecting from Home Assistant avoids a needless disconnect and reconnect.
const STOP_GRACE_MS = 3000;
let stopTimer: ReturnType<typeof setTimeout> | null = null;

function isActive(): boolean {
  return personAction.size + tileAction.size > 0 || Date.now() < leaseUntil;
}

/** Home Assistant is connected only while something needs it: a visible key or an open Property Inspector. */
function syncActivity(): void {
  if (isActive()) {
    if (stopTimer) clearTimeout(stopTimer);
    stopTimer = null;
    ha.start();
    return;
  }
  if (stopTimer) return;
  stopTimer = setTimeout(() => {
    stopTimer = null;
    if (!isActive()) ha.stop();
  }, STOP_GRACE_MS);
}

function leaseHa(): void {
  leaseUntil = Date.now() + PI_LEASE_MS;
  syncActivity();
  setTimeout(syncActivity, PI_LEASE_MS + 500);
}

function replyWithPersons(event: SendToPluginEvent): void {
  connection.send(
    sendToPropertyInspector(event.action, event.context, {
      event: 'persons',
      status: ha.status,
      persons: store.sortedPersons().map((p) => ({ entityId: p.entityId, name: p.name })),
    }),
  );
}

function handleEvent(event: ReceivedEvent): void {
  switch (event.event) {
    case 'didReceiveGlobalSettings': {
      globalSettings = normalizeGlobalSettings(event.settings);
      ha.reconfigure();
      tileAction.handleGlobalSettingsChanged();
      personAction.refresh();
      break;
    }
    case 'willAppear': {
      if (personAction.matches(event.action)) personAction.handleWillAppear(event.context, event.settings);
      else if (tileAction.matches(event.action)) tileAction.handleWillAppear(event.context, event.coordinates);
      syncActivity();
      break;
    }
    case 'willDisappear': {
      if (personAction.matches(event.action)) personAction.handleWillDisappear(event.context);
      else if (tileAction.matches(event.action)) tileAction.handleWillDisappear(event.context);
      syncActivity();
      break;
    }
    case 'keyUp': {
      if (personAction.matches(event.action)) personAction.handleKeyUp(event.context);
      else if (tileAction.matches(event.action)) tileAction.handleKeyUp();
      break;
    }
    case 'didReceiveSettings': {
      if (personAction.matches(event.action)) personAction.handleSettings(event.context, event.settings);
      break;
    }
    case 'propertyInspectorDidAppear': {
      leaseHa();
      break;
    }
    case 'sendToPlugin': {
      if (event.payload['event'] === 'getPersons') {
        leaseHa();
        replyWithPersons(event);
      }
      break;
    }
    default:
      break;
  }
}

connection.on('connected', () => {
  logInfo('Connected to OpenDeck, requesting global settings.');
  connection.send(getGlobalSettings(args.pluginUUID));
});

connection.on('event', (raw: unknown) => {
  const event = parseEvent(raw);
  if (event) handleEvent(event);
});

connection.on('protocolError', (err: unknown) => logError('Could not parse a message from OpenDeck', err));
connection.on('socketError', (err: unknown) => logError('WebSocket connection error', err));
connection.on('reconnectFailed', () => {
  logError('Could not reconnect to OpenDeck - exiting.');
  shutdown();
});

function shutdown(): void {
  if (stopTimer) clearTimeout(stopTimer);
  ha.stop();
  personAction.dispose();
  tileAction.dispose();
  connection.shutdown();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

connection.connect();
