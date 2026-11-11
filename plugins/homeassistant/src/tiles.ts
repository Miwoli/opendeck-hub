// Temperature tile: "18.9 °C" in the temperature colour, bar over a
// configurable range, name = room label, status = light state (Ember "light on").

import { type ValueTileSpec, offlineValueTile, temperatureColor } from '@miwoli/deck-core';
import type { EntityState, HaStatus } from './haClient.ts';

export interface TemperatureSettings {
  sensor: string;
  toggle: string;
  label: string;
  min: number;
  max: number;
}

export function formatValue(value: number): string {
  return value.toFixed(1);
}

const UNAVAILABLE = new Set(['unavailable', 'unknown', '']);

export function temperatureTile(s: TemperatureSettings, status: HaStatus, sensor: EntityState | undefined, toggle: EntityState | undefined): ValueTileSpec {
  const name = s.label || 'Office';
  if (status === 'not_configured' || !s.sensor) return offlineValueTile({ name, status: 'set in PI' });
  if (status === 'auth_error') return { ...offlineValueTile({ name, status: 'bad token' }), tone: 'alert', value: '!' };
  if (status !== 'connected') return offlineValueTile({ name });
  const value = sensor && !UNAVAILABLE.has(sensor.state) ? Number(sensor.state) : Number.NaN;
  if (!Number.isFinite(value)) return offlineValueTile({ name, status: 'no data' });
  const unitRaw = sensor?.attributes['unit_of_measurement'];
  const unit = typeof unitRaw === 'string' ? unitRaw : '°C';
  const c = temperatureColor(unit === '°F' ? ((value - 32) * 5) / 9 : value);
  const range = s.max > s.min ? s.max - s.min : 1;
  const spec: ValueTileSpec = {
    template: 'value',
    value: formatValue(value),
    unit,
    valueColor: c,
    bar: { fraction: (value - s.min) / range, color: c },
    name,
  };
  if (!s.toggle) return spec;
  if (!toggle || UNAVAILABLE.has(toggle.state)) return { ...spec, status: 'light ?', statusTone: 'dim' };
  return toggle.state === 'on' ? { ...spec, status: 'light on', statusTone: 'warn' } : { ...spec, status: 'light off' };
}
