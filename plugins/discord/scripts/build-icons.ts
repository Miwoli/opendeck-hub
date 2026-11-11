// Static manifest icons (PNG) drawn with the shared Nocturne renderer; sharp is a build-time dependency only.

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { type GlyphName, color, glyphs, renderTile } from '../../../packages/core/src/render/index.ts';
import { headphonesTile, micTile, pttTile } from '../src/tiles.ts';

const outDir = path.join(process.cwd(), 'com.miwoli.discord.sdPlugin', 'images');

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
  // default key images = the offline state, replaced by setImage as soon as the plugin runs
  const keys = { keyMic: micTile(null), keyHeadphones: headphonesTile(null), keyPtt: pttTile(null, false) };
  for (const [file, spec] of Object.entries(keys)) {
    await png(renderTile(spec), 72, `${file}.png`);
    await png(renderTile(spec), 144, `${file}@2x.png`);
  }
  const icon = renderTile({ template: 'icon', glyph: 'headphones', name: 'Discord', status: 'Vesktop' });
  await png(icon, 256, 'pluginIcon.png');
  await png(icon, 512, 'pluginIcon@2x.png');
  await png(glyphSvg('headphones', 28), 28, 'pluginCategory.png');
  await png(glyphSvg('headphones', 56), 56, 'pluginCategory@2x.png');
  const actions: Record<string, GlyphName> = { actionMic: 'mic', actionHeadphones: 'headphones', actionPtt: 'ptt' };
  for (const [file, glyph] of Object.entries(actions)) {
    await png(glyphSvg(glyph, 20), 20, `${file}.png`);
    await png(glyphSvg(glyph, 40), 40, `${file}@2x.png`);
  }
  console.log(`Icons written to ${outDir}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
