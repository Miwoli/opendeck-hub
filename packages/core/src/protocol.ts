// OpenAction protocol messages as implemented by OpenDeck.
// Verified against nekename/OpenDeck @3ddecc1:
//   inbound (plugin -> OpenDeck): src-tauri/src/events/inbound/{mod,states,misc}.rs
//   outbound (OpenDeck -> plugin): src-tauri/src/events/outbound/{mod,keypad,will_appear,settings,
//     property_inspector,devices,misc}.rs
// Only events relevant to a Keypad-only device are modelled.

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export interface Coordinates {
  column: number;
  row: number;
}

/** `GenericInstancePayload` in outbound/mod.rs. */
export interface InstancePayload {
  settings: JsonObject;
  coordinates: Coordinates;
  controller: string;
  state: number;
  isInMultiAction: boolean;
}

export type InstanceEventName = 'willAppear' | 'willDisappear' | 'keyDown' | 'keyUp' | 'didReceiveSettings';

export interface InstanceEvent {
  event: InstanceEventName;
  action: string;
  context: string;
  device: string;
  payload: InstancePayload;
}

export interface PropertyInspectorEvent {
  event: 'propertyInspectorDidAppear' | 'propertyInspectorDidDisappear';
  action: string;
  context: string;
  device: string;
}

export interface SendToPluginEvent {
  event: 'sendToPlugin';
  action: string;
  context: string;
  payload: JsonValue;
}

export interface DidReceiveGlobalSettingsEvent {
  event: 'didReceiveGlobalSettings';
  payload: { settings: JsonObject };
}

export interface DeviceEvent {
  event: 'deviceDidConnect' | 'deviceDidDisconnect';
  device: string;
}

export interface SystemDidWakeUpEvent {
  event: 'systemDidWakeUp';
}

export type InboundEvent =
  | InstanceEvent
  | PropertyInspectorEvent
  | SendToPluginEvent
  | DidReceiveGlobalSettingsEvent
  | DeviceEvent
  | SystemDidWakeUpEvent;

/** Messages the plugin may send (InboundEventType in inbound/mod.rs). */
export type OutboundMessage =
  | { event: 'setImage'; context: string; payload: { image?: string; state?: number } }
  | { event: 'setTitle'; context: string; payload: { title?: string; state?: number } }
  | { event: 'setState'; context: string; payload: { state: number } }
  | { event: 'setSettings'; context: string; payload: JsonObject }
  | { event: 'getSettings'; context: string }
  // context MUST equal the plugin UUID, otherwise OpenDeck drops the message
  | { event: 'setGlobalSettings'; context: string; payload: JsonObject }
  | { event: 'getGlobalSettings'; context: string }
  | { event: 'showAlert'; context: string }
  | { event: 'showOk'; context: string }
  | { event: 'sendToPropertyInspector'; context: string; payload: JsonValue }
  | { event: 'openUrl'; payload: { url: string } }
  | { event: 'logMessage'; payload: { message: string } };

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (isObject(value)) return Object.values(value).every(isJsonValue);
  return false;
}

export function isJsonObject(value: unknown): value is JsonObject {
  return isObject(value) && isJsonValue(value);
}

function str(o: Record<string, unknown>, key: string): string | null {
  const v = o[key];
  return typeof v === 'string' ? v : null;
}

function parseInstancePayload(raw: unknown): InstancePayload | null {
  if (!isObject(raw)) return null;
  const c = raw['coordinates'];
  const coordinates: Coordinates =
    isObject(c) && typeof c['row'] === 'number' && typeof c['column'] === 'number'
      ? { row: c['row'], column: c['column'] }
      : { row: -1, column: -1 };
  return {
    settings: isJsonObject(raw['settings']) ? raw['settings'] : {},
    coordinates,
    controller: str(raw, 'controller') ?? 'Keypad',
    state: typeof raw['state'] === 'number' ? raw['state'] : 0,
    isInMultiAction: raw['isInMultiAction'] === true,
  };
}

const INSTANCE_EVENTS: ReadonlySet<string> = new Set<InstanceEventName>([
  'willAppear',
  'willDisappear',
  'keyDown',
  'keyUp',
  'didReceiveSettings',
]);

/** Validates an untrusted message from OpenDeck. Unknown or malformed events return null. */
export function parseInboundEvent(raw: unknown): InboundEvent | null {
  if (!isObject(raw)) return null;
  const event = str(raw, 'event');
  if (event === null) return null;

  if (INSTANCE_EVENTS.has(event)) {
    const action = str(raw, 'action');
    const context = str(raw, 'context');
    const payload = parseInstancePayload(raw['payload']);
    if (action === null || context === null || payload === null) return null;
    return { event: event as InstanceEventName, action, context, device: str(raw, 'device') ?? '', payload };
  }

  switch (event) {
    case 'propertyInspectorDidAppear':
    case 'propertyInspectorDidDisappear': {
      const action = str(raw, 'action');
      const context = str(raw, 'context');
      if (action === null || context === null) return null;
      return { event, action, context, device: str(raw, 'device') ?? '' };
    }
    case 'sendToPlugin': {
      const action = str(raw, 'action');
      const context = str(raw, 'context');
      const payload = raw['payload'];
      if (action === null || context === null || !isJsonValue(payload)) return null;
      return { event, action, context, payload };
    }
    case 'didReceiveGlobalSettings': {
      const payload = raw['payload'];
      const settings = isObject(payload) && isJsonObject(payload['settings']) ? payload['settings'] : {};
      return { event, payload: { settings } };
    }
    case 'deviceDidConnect':
    case 'deviceDidDisconnect': {
      const device = str(raw, 'device');
      return device === null ? null : { event, device };
    }
    case 'systemDidWakeUp':
      return { event };
    default:
      return null;
  }
}
