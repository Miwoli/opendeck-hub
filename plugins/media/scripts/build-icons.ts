// Static manifest icons (PNG) drawn with the shared Nocturne renderer; sharp is a build-time dependency only.

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { type GlyphName, color, glyphs, renderTile } from '../../../packages/core/src/render/index.ts';
import { mediaTile } from '../src/tiles.ts';

const outDir = path.join(process.cwd(), 'com.miwoli.media.sdPlugin', 'images');

function glyphSvg(name: GlyphName, size: number): string {
  const g = glyphs[name];
  const t = g.transform ? ` transform="${g.transform}"` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="-10 -10 20 20"><g${t} fill="none" stroke="${color.icon}" stroke-width="${g.strokeWidth ?? 1.8}" stroke-linecap="round" stroke-linejoin="round">${g.body}</g></svg>`;
}

async function png(svg: string, size: number, file: string): Promise<void> {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(path.join(outDir, file));
}

async function main(): Promise<void> {
  await mkdir(outDir, { recursive: true });
  const key = renderTile(mediaTile(null, null));
  await png(key, 72, 'keyDefault.png');
  await png(key, 144, 'keyDefault@2x.png');
  const icon = renderTile({ template: 'cover', glyph: 'bars', name: 'Media', status: 'MPRIS' });
  await png(icon, 256, 'pluginIcon.png');
  await png(icon, 512, 'pluginIcon@2x.png');
  await png(glyphSvg('equalizer', 28), 28, 'pluginCategory.png');
  await png(glyphSvg('equalizer', 56), 56, 'pluginCategory@2x.png');
  await png(glyphSvg('equalizer', 20), 20, 'action.png');
  await png(glyphSvg('equalizer', 40), 40, 'action@2x.png');
  console.log(`Icons written to ${outDir}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
