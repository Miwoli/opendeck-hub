// Generates the README images in docs/images/ from scripts/readme-images/tiles.ts:
//   hero.png           a 5x3 deck with plugin tiles
//   <plugin>.png       one tile strip per released plugin, always 5 slots wide so every strip scales the same
//   ha-map-deck.png    the HA Map plugin's map spread over a 5x3 deck (OpenStreetMap tiles)
// Tiles are drawn by the shared renderer at 144x144 (what OpenDeck draws), on a transparent background so the
// images work in GitHub's light and dark themes. Text uses Manrope / Space Grotesk from fontconfig; without them
// librsvg falls back to another font, so the script refuses to run.
// The map is the only part that needs the network: it is rendered only when ha-map-deck.png is missing or with
// --map, and downloaded OSM tiles stay cached in dist/readme-images/osm (OSM tile usage policy: no repeated fetches).
// Run: npm run readme-images [-- --map]

import { execFileSync } from 'node:child_process';
import { access, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import sharp from 'sharp';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const outDir = path.join(repo, 'docs', 'images');
const work = path.join(repo, 'dist', 'readme-images');
const bundle = path.join(work, 'tiles.cjs');
const USER_AGENT = 'opendeck-hub-readme-images/1.0 (+https://github.com/Miwoli/opendeck-hub)';

const TILE = 144;
const GAP = 16;

const fonts = execFileSync('fc-list', [':', 'family'], { encoding: 'utf8', timeout: 10_000 });
for (const family of ['Manrope', 'Space Grotesk']) {
  if (!fonts.includes(family)) throw new Error(`font "${family}" is not installed (fc-list); the images would use a fallback font`);
}

// Bundle like the plugins do (cjs) so plugin sources with .js-style imports resolve.
await esbuild.build({
  entryPoints: [path.join(repo, 'scripts', 'readme-images', 'tiles.ts')],
  outfile: bundle,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['sharp'],
  logLevel: 'warning',
});
const { renderTile } = await import('@miwoli/deck-core');
const { strips, hero, haMapKeys } = createRequire(import.meta.url)(bundle);

// An unused key: black with the tiles' faint outline.
const EMPTY_KEY = `<rect x="1" y="1" width="${TILE - 2}" height="${TILE - 2}" rx="24" fill="#000" stroke="#fff" stroke-opacity="0.07" stroke-width="2"/>`;

/** Places key SVGs (null = unused key) on a canvas; every key is clipped to the deck's rounded key shape. */
function compose(keys, columns, { pad = 0, background = '' } = {}) {
  const rows = Math.ceil(keys.length / columns);
  const width = pad * 2 + columns * TILE + (columns - 1) * GAP;
  const height = pad * 2 + rows * TILE + (rows - 1) * GAP;
  const placed = keys.map((svg, i) => {
    const x = pad + (i % columns) * (TILE + GAP);
    const y = pad + Math.floor(i / columns) * (TILE + GAP);
    return `<g transform="translate(${x} ${y})" clip-path="url(#key)">${svg ?? EMPTY_KEY}</g>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}"><defs><clipPath id="key"><rect width="${TILE}" height="${TILE}" rx="24"/></clipPath></defs>${background}${placed.join('')}</svg>`;
}

/** A 5x3 deck on a graphite device body that reads on both white and near-black pages. */
function deck(keys) {
  const pad = 36;
  const w = pad * 2 + 5 * TILE + 4 * GAP;
  const h = pad * 2 + 3 * TILE + 2 * GAP;
  const body = `<rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="40" fill="#1B1E28" stroke="#3A3F50" stroke-width="2"/>`;
  return compose(keys, 5, { pad, background: body });
}

async function write(name, svg) {
  const file = path.join(outDir, `${name}.png`);
  const info = await sharp(Buffer.from(svg)).png({ compressionLevel: 9, palette: true, quality: 90 }).toFile(file);
  console.log(`${path.relative(repo, file)}  ${info.width}x${info.height}  ${(info.size / 1024).toFixed(1)} KB`);
}

await mkdir(outDir, { recursive: true });
const tiles = (specs) => specs.map((spec) => renderTile(spec));

await write('hero', deck(tiles(hero)));
for (const [name, specs] of Object.entries(strips)) await write(name, compose(tiles(specs), 5));

const mapFile = path.join(outDir, 'ha-map-deck.png');
const haveMap = await access(mapFile).then(() => true, () => false);
if (process.argv.includes('--map') || !haveMap) {
  await write('ha-map-deck', deck(await haMapKeys(USER_AGENT, path.join(work, 'osm'))));
} else {
  console.log(`${path.relative(repo, mapFile)}  kept (pass --map to render it again from OpenStreetMap)`);
}
