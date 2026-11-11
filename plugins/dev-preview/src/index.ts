// Nocturne Preview (dev): renders the deck-core gallery on the real Stream Deck.
// Put the "Tile preview" action on all 15 keys of a test profile. Each key shows the gallery item
// at its position (row * 5 + column) of the current page; pressing any key switches
// Variants -> Main -> Games -> States. "Variants" compares typography on the 72 px keys: row 1 = design 1:1,
// row 2 = `deck` layout on Nocturne Surface, row 3 = production default (`deck` on black).
// On the Main page the Power key (row 2, column 3) runs the real HoldToConfirm flow; confirming only
// shows OpenDeck's "ok" overlay - nothing is executed.

import {
  type ActionHandler,
  HoldToConfirm,
  type InstanceEvent,
  OpenActionClient,
  type RenderOptions,
  color,
  type TileSpec,
  createLogger,
  gallery,
  holdTile,
  layouts,
  parsePluginArgs,
  tileImage,
  usageTile,
} from '@miwoli/deck-core';

const ACTION = 'com.miwoli.dev-preview.gallery';
const COLUMNS = 5;
const POWER = { glyph: 'power', name: 'Power', idleStatus: 'hold 1 s', confirmName: 'Shut down?' } as const;

const log = createLogger('dev-preview');
const client = new OpenActionClient(parsePluginArgs(process.argv.slice(2)), { logger: log });

interface Page {
  title: string;
  tile(row: number, column: number): { spec: TileSpec; options?: RenderOptions } | undefined;
}

const variantColumns: TileSpec[] = [
  { template: 'icon', glyph: 'mic', name: 'Mic', status: 'On', statusTone: 'ok' },
  usageTile({ percent: 34, name: 'Session', status: 'in 2h 10m' }),
  { template: 'value', value: '16:22', valueSize: 26, valueY: 33, name: 'Saturday', status: '31.10.2026' },
  { template: 'icon', glyph: 'power', name: 'Power', status: 'hold 1 s' },
  { template: 'cover', glyph: 'bars', name: 'Track', status: 'Artist' },
];
const variantRows: RenderOptions[] = [
  { layout: layouts.design, surface: color.surface },
  { layout: layouts.deck, surface: color.surface },
  {}, // production default: deck on black
];

const pages: Page[] = [
  {
    title: 'Variants',
    tile: (row, column) => {
      const spec = variantColumns[column];
      const options = variantRows[row];
      return spec && options ? { spec, options } : undefined;
    },
  },
  ...gallery.map((section): Page => ({
    title: section.title,
    tile: (row, column) => {
      const item = section.items[row * COLUMNS + column];
      return item ? { spec: item.spec } : undefined;
    },
  })),
];

let page = 0;
const holds = new Map<string, HoldToConfirm>();

function isPowerPosition(row: number, column: number): boolean {
  return pages[page]?.title === 'Main' && row === 2 && column === 3;
}

function isPowerKey(ev: InstanceEvent): boolean {
  return isPowerPosition(ev.payload.coordinates.row, ev.payload.coordinates.column);
}

function render(context: string, row: number, column: number): void {
  const current = pages[page];
  const tile = current?.tile(row, column);
  const hold = holds.get(context);
  if (hold && isPowerPosition(row, column)) {
    client.setImage(context, tileImage(holdTile(hold.state, POWER)));
    return;
  }
  const fallback: TileSpec = { template: 'icon', tone: 'offline', glyph: 'close', name: current?.title ?? '?', status: 'empty' };
  client.setImage(context, tileImage(tile?.spec ?? fallback, tile?.options));
}

function renderAll(): void {
  for (const v of client.visibleInstances(ACTION)) render(v.context, v.coordinates.row, v.coordinates.column);
}

function holdFor(ev: InstanceEvent): HoldToConfirm {
  let hold = holds.get(ev.context);
  if (!hold) {
    const { row, column } = ev.payload.coordinates;
    hold = new HoldToConfirm({
      onChange: () => render(ev.context, row, column),
      onConfirm: () => {
        log.info('hold-to-confirm confirmed (demo, nothing executed)');
        client.showOk(ev.context);
      },
      onError: (err) => log.error('confirm failed', err),
    });
    holds.set(ev.context, hold);
  }
  return hold;
}

const galleryAction: ActionHandler = {
  uuid: ACTION,
  willAppear: (ev) => render(ev.context, ev.payload.coordinates.row, ev.payload.coordinates.column),
  willDisappear: (ev) => {
    holds.get(ev.context)?.cancel();
    holds.delete(ev.context);
  },
  keyDown: (ev) => {
    if (isPowerKey(ev)) return holdFor(ev).keyDown();
  },
  keyUp: (ev) => {
    if (isPowerKey(ev)) return holdFor(ev).keyUp();
    page = (page + 1) % pages.length;
    log.info(`page -> ${pages[page]?.title ?? page}`);
    for (const h of holds.values()) h.cancel();
    renderAll();
  },
};

client.register(galleryAction);
client.on('connected', renderAll);
client.on('gaveUp', () => process.exit(1));

function shutdown(): void {
  for (const h of holds.values()) h.cancel();
  client.close();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

client.connect();
