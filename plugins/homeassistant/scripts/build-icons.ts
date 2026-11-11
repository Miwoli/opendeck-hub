// Static manifest icons (PNG) drawn with the shared Nocturne renderer; sharp is a build-time dependency only.

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { color, renderTile } from '../../../packages/core/src/render/index.ts';
import { temperatureTile } from '../src/tiles.ts';

const outDir = path.join(process.cwd(), 'com.miwoli.homeassistant.sdPlugin', 'images');

// the design has no thermometer glyph; a simple one is used only for the plugin/action list icons
function thermometerSvg(size: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="-10 -10 20 20"><g fill="none" stroke="${color.icon}" stroke-width="1.8" stroke-linecap="round"><path d="M-2 3V-6a2 2 0 0 1 4 0v9a4 4 0 1 1-4 0z"/><path d="M0 4v-5"/></g></svg>`;
}

async function png(svg: string, size: number, file: string): Promise<void> {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(path.join(outDir, file));
}

async function main(): Promise<void> {
  await mkdir(outDir, { recursive: true });
  const settings = { sensor: 'sensor.x', toggle: 'switch.x', label: 'Office', min: 10, max: 30 };
  const sample = renderTile(temperatureTile(settings, 'connected', { state: '18.9', attributes: { unit_of_measurement: '°C' } }, { state: 'on', attributes: {} }));
  const key = renderTile(temperatureTile({ ...settings, sensor: '' }, 'not_configured', undefined, undefined));
  await png(key, 72, 'keyDefault.png');
  await png(key, 144, 'keyDefault@2x.png');
  await png(sample, 256, 'pluginIcon.png');
  await png(sample, 512, 'pluginIcon@2x.png');
  await png(thermometerSvg(28), 28, 'pluginCategory.png');
  await png(thermometerSvg(56), 56, 'pluginCategory@2x.png');
  await png(thermometerSvg(20), 20, 'action.png');
  await png(thermometerSvg(40), 40, 'action@2x.png');
  console.log(`Icons written to ${outDir}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
