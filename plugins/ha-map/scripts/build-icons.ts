// Static manifest icons (PNG) drawn with the shared Nocturne renderer; sharp is a build-time dependency only.

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { type GlyphName, color, glyphs, renderTile } from '../../../packages/core/src/render/index.ts';

const outDir = path.join(process.cwd(), 'com.miwoli.ha-map.sdPlugin', 'images');

function glyphSvg(name: GlyphName, size: number): string {
  const g = glyphs[name];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="-10 -10 20 20"><g fill="none" stroke="${color.icon}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${g.body}</g></svg>`;
}

async function png(svg: string, size: number, file: string): Promise<void> {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(path.join(outDir, file));
}

async function main(): Promise<void> {
  await mkdir(outDir, { recursive: true });
  // same specs as personTile()/mapMessageTile() while connecting (src/personTile.ts)
  const person = renderTile({ template: 'icon', tone: 'offline', mark: '…', name: 'Person', status: 'connecting…' });
  const tile = renderTile({ template: 'icon', tone: 'offline', glyph: 'map', name: 'Map', status: 'connecting…' });
  for (const [file, svg] of [['keyDefaultPerson', person], ['keyDefaultTile', tile]] as const) {
    await png(svg, 72, `${file}.png`);
    await png(svg, 144, `${file}@2x.png`);
  }
  const icon = renderTile({ template: 'icon', tone: 'nav', glyph: 'map', name: 'HA Map', status: 'osoby' });
  await png(icon, 256, 'pluginIcon.png');
  await png(icon, 512, 'pluginIcon@2x.png');
  await png(glyphSvg('map', 28), 28, 'pluginCategory.png');
  await png(glyphSvg('map', 56), 56, 'pluginCategory@2x.png');
  for (const file of ['actionPerson', 'actionTile']) {
    await png(glyphSvg('map', 20), 20, `${file}.png`);
    await png(glyphSvg('map', 40), 40, `${file}@2x.png`);
  }
  console.log(`Icons written to ${outDir}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
