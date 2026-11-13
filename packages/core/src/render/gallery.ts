// Every tile and state of the Nocturne design (Main, Games and the state variants), expressed as renderer specs.
// Copy is kept short where the `deck` layout would truncate it: e.g. "Track" instead of a track title,
// "Office" instead of "Temperature" (the °C unit makes the meaning clear), "Shut down?" and "Close?" for confirmations.
// Used by the local preview (npm run preview) and by the renderer tests.

import { errorTile, holdTile, offlineValueTile, usageTile } from './states.ts';
import type { TileSpec } from './tiles.ts';
import { temperatureColor } from './tokens.ts';

export interface GalleryItem {
  id: string;
  label: string;
  spec: TileSpec;
}

export interface GallerySection {
  title: string;
  /** Grid columns in the preview (5 for deck pages). */
  columns: number;
  items: GalleryItem[];
}

const power = { glyph: 'power', name: 'Power', idleStatus: 'hold 1 s', confirmName: 'Shut down?' } as const;
const closeGame = {
  glyph: 'close',
  name: 'Close game',
  idleStatus: 'hold 1 s',
  idleTone: 'danger',
  confirmName: 'Close?',
} as const;

const mic: TileSpec = { template: 'icon', glyph: 'mic', name: 'Mic', status: 'On', statusTone: 'ok' };
const headphones: TileSpec = { template: 'icon', glyph: 'headphones', name: 'Headphones', status: 'On', statusTone: 'ok' };
const ptt: TileSpec = { template: 'icon', tone: 'idle', glyph: 'ptt', name: 'PTT', status: 'Hold' };
const media: TileSpec = { template: 'cover', glyph: 'bars', name: 'Track', status: 'Artist' };

function cover(id: string, name: string, source: string, gradient: readonly [string, string]): GalleryItem {
  return { id, label: `${name} (${source})`, spec: { template: 'cover', name, status: source, gradient } };
}

export const gallery: GallerySection[] = [
  {
    title: 'Main',
    columns: 5,
    items: [
      { id: 'main-mic', label: 'Mic', spec: mic },
      { id: 'main-headphones', label: 'Headphones', spec: headphones },
      { id: 'main-ptt', label: 'PTT', spec: ptt },
      { id: 'main-session', label: 'Session Claude 34%', spec: usageTile({ percent: 34, name: 'Session', status: 'in 2h 10m' }) },
      { id: 'main-weekly', label: 'Week Claude 7%', spec: usageTile({ percent: 7, name: 'Week', status: 'Sun 22:00' }) },
      { id: 'main-games', label: 'Games ›', spec: { template: 'icon', tone: 'nav', glyph: 'gamepad', name: 'Games', status: 'Page ›' } },
      { id: 'main-media', label: 'Media', spec: media },
      { id: 'main-screen1', label: 'Screen 1', spec: { template: 'icon', glyph: 'monitor', name: 'Screen 1', status: 'Switch' } },
      {
        id: 'main-extend',
        label: 'Extend (active)',
        spec: { template: 'icon', tone: 'on', glyph: 'monitorsExtend', name: 'Extend', status: 'Active' },
      },
      { id: 'main-screen2', label: 'Screen 2', spec: { template: 'icon', glyph: 'monitor', name: 'Screen 2', status: 'Switch' } },
      {
        id: 'main-person',
        label: 'Alex (home)',
        spec: { template: 'icon', avatar: { initial: 'A', presence: 'home' }, name: 'Alex', status: 'Home', statusTone: 'ok' },
      },
      {
        id: 'main-temperature',
        label: 'Temperature 18.9 °C',
        spec: {
          template: 'value',
          value: '18.9',
          unit: '°C',
          valueColor: temperatureColor(18.9),
          bar: { fraction: (18.9 - 10) / 20, color: temperatureColor(18.9) },
          name: 'Office',
          status: 'light on',
          statusTone: 'warn',
        },
      },
      {
        id: 'main-clock',
        label: 'Clock',
        spec: { template: 'value', value: '16:22', valueSize: 26, valueY: 33, name: 'Saturday', status: '31.10.2026' },
      },
      { id: 'main-power', label: 'Power', spec: holdTile({ phase: 'idle' }, power) },
      { id: 'main-map', label: 'Map ›', spec: { template: 'icon', tone: 'nav', glyph: 'map', name: 'Map', status: 'Page ›' } },
    ],
  },
  {
    title: 'Games',
    columns: 5,
    items: [
      { id: 'games-mic', label: 'Mic', spec: mic },
      { id: 'games-headphones', label: 'Headphones', spec: headphones },
      { id: 'games-ptt', label: 'PTT', spec: ptt },
      { id: 'games-gamemode', label: 'Game mode', spec: { template: 'icon', glyph: 'bolt', name: 'Game mode', status: 'Off' } },
      { id: 'games-screenshot', label: 'Screenshot', spec: { template: 'icon', glyph: 'screenshot', name: 'Screenshot', status: 'Screen' } },
      { id: 'games-back', label: 'Back', spec: { template: 'icon', tone: 'nav', glyph: 'back', name: 'Back', status: 'Main page' } },
      { id: 'games-media', label: 'Media', spec: media },
      { id: 'games-steam', label: 'Steam', spec: { template: 'icon', tone: 'nav', glyph: 'steam', name: 'Steam', status: 'Library' } },
      { id: 'games-lutris', label: 'Lutris', spec: { template: 'icon', tone: 'nav', glyph: 'lutris', name: 'Lutris', status: 'Library' } },
      { id: 'games-close', label: 'Close game', spec: { ...holdTile({ phase: 'idle' }, closeGame), dashed: true } },
      { id: 'games-close-running', label: 'Close game (running)', spec: { ...holdTile({ phase: 'idle' }, closeGame), status: 'Hades II', backdrop: {} } },
      cover('games-recent1', 'Game 1', 'Steam', ['#5B4BFF', '#139C9A']),
      cover('games-recent2', 'Game 2', 'Steam', ['#4B3BD6', '#1B1E28']),
      cover('games-recent3', 'Game 3', 'Lutris', ['#139C9A', '#12141B']),
      cover('games-recent4', 'Game 4', 'Steam', ['#6CB8FF', '#4B3BD6']),
      cover('games-recent5', 'Game 5', 'Lutris', ['#1B1E28', '#5B4BFF']),
    ],
  },
  {
    title: 'States',
    columns: 5,
    items: [
      {
        id: 'state-mic-muted',
        label: 'Mic muted',
        spec: { template: 'icon', tone: 'alert', glyph: 'micOff', name: 'Mic', status: 'Muted' },
      },
      {
        id: 'state-headphones-muted',
        label: 'Headphones muted',
        spec: { template: 'icon', tone: 'alert', glyph: 'headphonesOff', name: 'Headphones', status: 'Muted' },
      },
      {
        id: 'state-ptt-active',
        label: 'PTT talking',
        spec: { template: 'icon', tone: 'on', glyph: 'pttActive', name: 'PTT', status: 'Talking' },
      },
      { id: 'state-usage-78', label: 'Bar 78 %', spec: usageTile({ percent: 78, name: 'Week', status: 'warning' }) },
      { id: 'state-usage-94', label: 'Bar 94 %', spec: usageTile({ percent: 94, name: 'Session', status: 'limit · in 40m' }) },
      { id: 'state-error', label: 'Error: session expired', spec: errorTile({ name: 'Session', status: 'Expired' }) },
      { id: 'state-power-hold', label: 'Power: holding 60 %', spec: holdTile({ phase: 'holding', progress: 0.6 }, power) },
      { id: 'state-power-confirm', label: 'Power: confirm', spec: holdTile({ phase: 'confirm', secondsLeft: 3 }, power) },
      {
        id: 'state-media-paused',
        label: 'Media: paused',
        spec: { template: 'cover', glyph: 'play', paused: true, name: 'Track', status: 'Paused' },
      },
      { id: 'state-temp-offline', label: 'Temperature offline', spec: offlineValueTile({ name: 'Office' }) },
      {
        id: 'state-screenshot-saved',
        label: 'Screenshot saved',
        spec: { template: 'icon', tone: 'success', glyph: 'check', name: 'Screenshot', status: 'Saved' },
      },
      {
        id: 'state-gamemode-on',
        label: 'Game mode on',
        spec: { template: 'icon', tone: 'on', glyph: 'bolt', name: 'Game mode', status: 'On' },
      },
      { id: 'state-close-hold', label: 'Close game: holding', spec: holdTile({ phase: 'holding', progress: 0.3 }, closeGame) },
      { id: 'state-close-confirm', label: 'Close game: confirm', spec: holdTile({ phase: 'confirm', secondsLeft: 2 }, closeGame) },
      {
        id: 'state-person-away',
        label: 'Person away',
        spec: { template: 'icon', avatar: { initial: 'A', presence: 'away' }, name: 'Alex', status: '3.2 km' },
      },
    ],
  },
];
