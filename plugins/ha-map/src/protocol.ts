// Types and validation of OpenAction protocol messages (WebSocket, JSON),
// backward compatible with the Elgato Stream Deck SDK. Field names follow
// docs.elgato.com/sdk/plugins/events-received and events-sent; OpenDeck
// behaviour was checked in its sources (events/inbound, events/outbound).
//
// Incoming messages are untrusted input: parseEvent() validates them
// and flattens them into simple structures; the rest of the code never touches raw JSON.

import { asNumber, asString, isRecord } from './util.js';

export interface Coordinates {
  column: number;
  row: number;
}

export type ContextEventName = 'willAppear' | 'willDisappear' | 'keyDown' | 'keyUp' | 'didReceiveSettings';

export interface ContextEvent {
  event: ContextEventName;
  action: string;
  context: string;
  device: string;
  coordinates: Coordinates;
  settings: Record<string, unknown>;
}

export interface GlobalSettingsEvent {
  event: 'didReceiveGlobalSettings';
  settings: Record<string, unknown>;
}

export interface PropertyInspectorEvent {
  event: 'propertyInspectorDidAppear' | 'propertyInspectorDidDisappear';
  action: string;
  context: string;
}

export interface SendToPluginEvent {
  event: 'sendToPlugin';
  action: string;
  context: string;
  payload: Record<string, unknown>;
}

export type ReceivedEvent = ContextEvent | GlobalSettingsEvent | PropertyInspectorEvent | SendToPluginEvent;

const CONTEXT_EVENTS: readonly string[] = ['willAppear', 'willDisappear', 'keyDown', 'keyUp', 'didReceiveSettings'];

function isContextEventName(value: string): value is ContextEventName {
  return CONTEXT_EVENTS.includes(value);
}

function parseCoordinates(value: unknown): Coordinates {
  if (!isRecord(value)) return { column: 0, row: 0 };
  return { column: asNumber(value['column']) ?? 0, row: asNumber(value['row']) ?? 0 };
}

export function parseEvent(raw: unknown): ReceivedEvent | null {
  if (!isRecord(raw)) return null;
  const event = asString(raw['event']);
  if (!event) return null;

  if (event === 'didReceiveGlobalSettings') {
    const payload = raw['payload'];
    const settings = isRecord(payload) && isRecord(payload['settings']) ? payload['settings'] : {};
    return { event, settings };
  }

  const context = asString(raw['context']);
  if (!context) return null;
  const action = asString(raw['action']) ?? '';

  if (isContextEventName(event)) {
    const payload = isRecord(raw['payload']) ? raw['payload'] : {};
    return {
      event,
      action,
      context,
      device: asString(raw['device']) ?? '',
      coordinates: parseCoordinates(payload['coordinates']),
      settings: isRecord(payload['settings']) ? payload['settings'] : {},
    };
  }

  if (event === 'propertyInspectorDidAppear' || event === 'propertyInspectorDidDisappear') {
    return { event, action, context };
  }

  if (event === 'sendToPlugin') {
    return { event, action, context, payload: isRecord(raw['payload']) ? raw['payload'] : {} };
  }

  return null;
}

// Messages sent to OpenDeck.

export type OutboundMessage =
  | { event: 'setImage'; context: string; payload: { image: string; target: 0 } }
  | { event: 'getGlobalSettings'; context: string }
  | { event: 'sendToPropertyInspector'; action: string; context: string; payload: Record<string, unknown> };

export function setImage(context: string, image: string): OutboundMessage {
  return { event: 'setImage', context, payload: { image, target: 0 } };
}

export function getGlobalSettings(pluginUUID: string): OutboundMessage {
  return { event: 'getGlobalSettings', context: pluginUUID };
}

export function sendToPropertyInspector(
  action: string,
  context: string,
  payload: Record<string, unknown>,
): OutboundMessage {
  return { event: 'sendToPropertyInspector', action, context, payload };
}
