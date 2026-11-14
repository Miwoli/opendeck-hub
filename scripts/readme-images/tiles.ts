// Sample tiles for the README images, built with each plugin's own tile functions so the images show what the
// plugins really draw. Neutral sample data only: no real names, places, tokens or deck layouts.
// Rendered by scripts/readme-images/render.mjs (npm run readme-images).

import { type TileSpec, holdTile } from '@miwoli/deck-core';
import { limitErrorTile, limitTile } from '../../plugins/claude-usage/src/tiles.ts';
import type { DiscordState } from '../../plugins/discord/src/bridge.ts';
import { headphonesTile, micTile, pttTile } from '../../plugins/discord/src/tiles.ts';
import type { Output } from '../../plugins/displays/src/kscreen.ts';
import { layoutTile } from '../../plugins/displays/src/tiles.ts';
import type { Game } from '../../plugins/games/src/library.ts';
import { closeGameTile, gameModeTile, launcherTile, recentTile } from '../../plugins/games/src/tiles.ts';
import { type PersonInfo, HaStore } from '../../plugins/ha-map/src/ha/store.ts';
import { keyId, renderMap } from '../../plugins/ha-map/src/mapRenderer.ts';
import { buildMarkers } from '../../plugins/ha-map/src/markers.ts';
import { personTile } from '../../plugins/ha-map/src/personTile.ts';
import { DEFAULT_TILE_URL } from '../../plugins/ha-map/src/settings.ts';
import { TileCache } from '../../plugins/ha-map/src/tiles.ts';
import { temperatureTile } from '../../plugins/homeassistant/src/tiles.ts';
import type { PlayerState } from '../../plugins/media/src/mpris.ts';
import { mediaTile } from '../../plugins/media/src/tiles.ts';
import { clockTile } from '../../plugins/system/src/actions/clock.ts';
import { screenshotTile } from '../../plugins/system/src/actions/screenshot.ts';

// Fixed clock so the images do not change on every run.
const now = new Date(2026, 9, 31, 16, 22);
const inMinutes = (m: number): string => new Date(now.getTime() + m * 60_000).toISOString();

// claude-usage
const session = limitTile('Session', 'five_hour', { utilization: 34, resets_at: inMinutes(130) }, now);
const week = limitTile('Week', 'seven_day', { utilization: 7, resets_at: new Date(2026, 10, 1, 22, 0).toISOString() }, now);

// discord
const voice: DiscordState = { inVoice: true, selfMute: false, selfDeaf: false, serverMute: false, serverDeaf: false, mode: 'VOICE_ACTIVITY', ptt: false };

// displays: two monitors side by side, extended
const output = (id: number, name: string, x: number): Output => ({
  id, name, connected: true, enabled: true, x, y: 0, width: 2560, height: 1440, scale: 1, priority: id,
});
const outputs = [output(1, 'DP-1', 0), output(2, 'HDMI-1', 2560)];
const screen = (name: string) => layoutTile({ layout: { kind: 'single', output: name }, label: '' }, outputs, 'idle');
const extend = layoutTile({ layout: { kind: 'extend' }, label: '' }, outputs, 'idle');

// games: made-up titles, no cover art (the renderer's fallback gradient)
const game = (name: string, source: Game['source']): Game => ({ source, id: name, name, lastPlayed: 0, cover: null });
const running = game('Starfall', 'steam');

// ha-map: made-up people around the walled town of Monteriggioni, Tuscany (a nod to Assassin's Creed II).
// Home = the town walls, Wikidata Q55170433 (coordinate location P625: 43.389702, 11.224208).
const home = { lat: 43.389702, lon: 11.224208 };
const person = (name: string, state: string, lat: number, lon: number): PersonInfo => ({
  entityId: `person.${name.toLowerCase()}`, name, state, lat, lon, accuracy: 25, picture: null,
});
const people = [
  person('Alex', 'home', 43.38975, 11.2243),
  person('Sam', 'not_home', 43.3897, 11.22137),
  person('Robin', 'Villa', 43.3903, 11.22668),
];
const personKey = (p: PersonInfo, display: 'distance' | 'place' = 'distance') =>
  personTile({ settings: { entityId: p.entityId, display, showAvatar: false }, person: p, home, avatar: null, status: 'ready' });

/**
 * The ha-map "Map tile" keys for a 5x3 deck: one SVG per key in row order, null for the bottom-right key (the Starter
 * Pack "back" key the plugin leaves free). Tiles come from OpenStreetMap through the plugin's own TileCache.
 */
export async function haMapKeys(userAgent: string, cacheRoot: string): Promise<Array<string | null>> {
  const store = new HaStore();
  store.applySnapshot([
    { entityId: 'zone.home', state: 'zoning', attributes: { latitude: home.lat, longitude: home.lon, radius: 100 } },
    ...people.map((p) => ({
      entityId: p.entityId,
      state: p.state,
      attributes: { friendly_name: p.name, latitude: p.lat, longitude: p.lon, gps_accuracy: p.accuracy },
    })),
  ]);
  const map = await renderMap({
    markers: buildMarkers(store),
    home: store.home(),
    columns: 5,
    rows: 3,
    tiles: new TileCache(DEFAULT_TILE_URL, userAgent, cacheRoot),
    minZoom: 4,
    maxZoom: 16,
    attribution: '© OpenStreetMap',
    reservedKey: { column: 4, row: 2 },
  });
  if (!map) throw new Error('ha-map rendered no map');
  return Array.from({ length: 15 }, (_, i) => {
    if (i === 14) return null;
    const key = map.keys.get(keyId(i % 5, Math.floor(i / 5)));
    if (!key) throw new Error(`ha-map key ${i} missing`);
    return Buffer.from(key.image.split(',')[1] ?? '', 'base64').toString('utf8');
  });
}

// homeassistant
const temp = (label: string, value: string, light: 'on' | 'off') =>
  temperatureTile(
    { sensor: 'sensor.t', toggle: 'light.l', label, min: 10, max: 30 },
    'connected',
    { state: value, attributes: { unit_of_measurement: '°C' } },
    { state: light, attributes: {} },
  );

// media
const player = (id: string, status: PlayerState['status'], title = 'Track', artist = 'Artist'): PlayerState => ({
  bus: `org.mpris.MediaPlayer2.${id}`, status, title, artist, artUrl: '',
});

// system
const power = { glyph: 'power', name: 'Power', idleStatus: 'hold 1 s', confirmName: 'Shut down?' } as const;

/** One strip per released plugin (file name = plugin directory). */
export const strips: Record<string, TileSpec[]> = {
  'claude-usage': [
    session,
    week,
    limitTile('Week', 'seven_day', { utilization: 78, resets_at: new Date(2026, 10, 1, 22, 0).toISOString() }, now),
    limitTile('Session', 'five_hour', { utilization: 94, resets_at: inMinutes(40) }, now),
    limitErrorTile('Session', 'auth'),
  ],
  discord: [
    micTile(voice),
    micTile({ ...voice, selfMute: true }),
    headphonesTile(voice),
    pttTile(voice, false),
    pttTile(voice, true),
  ],
  displays: [screen('DP-1'), extend, screen('HDMI-1'), layoutTile({ layout: { kind: 'single', output: 'DP-1' }, label: '' }, outputs, 'switching')],
  games: [
    launcherTile('steam'),
    launcherTile('lutris'),
    recentTile(game('Starfall', 'steam'), 1, null),
    gameModeTile(true),
    closeGameTile({ phase: 'idle' }, true, running, null),
  ],
  'ha-map': [
    personKey(people[0]!),
    personKey(people[1]!),
    personKey(people[2]!, 'place'),
  ],
  homeassistant: [temp('Office', '18.9', 'on'), temp('Bedroom', '22.4', 'off'), temp('Balcony', '11.5', 'off')],
  media: [
    mediaTile(player('spotify', 'Playing'), null),
    mediaTile(player('spotify', 'Paused'), null),
    mediaTile(player('firefox', 'Playing', 'Video'), null, { players: [player('spotify', 'Paused'), player('firefox', 'Playing')], showSource: true }),
  ],
  system: [
    clockTile(now),
    screenshotTile({ mode: 'fullscreen', folder: '' }, 'idle'),
    holdTile({ phase: 'idle' }, power),
    holdTile({ phase: 'holding', progress: 0.6 }, power),
    holdTile({ phase: 'confirm', secondsLeft: 3 }, power),
  ],
};

/** Hero: a full 5x3 page made only of plugin tiles (no Starter Pack keys, which plugins cannot draw). A showcase order, not anyone's real layout. */
export const hero: TileSpec[] = [
  clockTile(now), session, week, temp('Office', '18.9', 'on'), personKey(people[0]!),
  mediaTile(player('spotify', 'Playing'), null), launcherTile('steam'), gameModeTile(true), screen('DP-1'), extend,
  micTile(voice), headphonesTile(voice), pttTile(voice, false), screenshotTile({ mode: 'fullscreen', folder: '' }, 'idle'), holdTile({ phase: 'idle' }, power),
];
