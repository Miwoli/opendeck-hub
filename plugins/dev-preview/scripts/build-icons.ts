// Static manifest icons (PNG) drawn with the shared Nocturne renderer; sharp is a build-time dependency only.

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { color, glyphs, renderTile } from '../../../packages/core/src/render/index.ts';

const outDir = path.join(process.cwd(), 'com.miwoli.dev-preview.sdPlugin', 'images');

const tile = renderTile({ template: 'icon', tone: 'nav', glyph: 'lutris', name: 'Preview', status: 'press ›' });

function glyphSvg(size: number): string {
  const g = glyphs.lutris;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="-10 -10 20 20"><g fill="none" stroke="${color.icon}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${g.body}</g></svg>`;
}

async function png(svg: string, size: number, file: string): Promise<void> {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(path.join(outDir, file));
}

async function main(): Promise<void> {
  await mkdir(outDir, { recursive: true });
  await png(tile, 256, 'pluginIcon.png');
  await png(tile, 512, 'pluginIcon@2x.png');
  await png(tile, 72, 'keyDefault.png');
  await png(tile, 144, 'keyDefault@2x.png');
  await png(glyphSvg(28), 28, 'pluginCategory.png');
  await png(glyphSvg(56), 56, 'pluginCategory@2x.png');
  await png(glyphSvg(20), 20, 'action.png');
  await png(glyphSvg(40), 40, 'action@2x.png');
  console.log(`Icons written to ${outDir}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
