// Static manifest icons (PNG) drawn with the shared Nocturne renderer; sharp is a build-time dependency only.

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { type GlyphName, color, glyphs, renderTile } from '../../../packages/core/src/render/index.ts';
import { helloTile } from '../src/actions/hello.ts';

const outDir = path.join(process.cwd(), 'com.miwoli.__NAME__.sdPlugin', 'images');
const GLYPH: GlyphName = 'bolt';

function glyphSvg(size: number): string {
  const g = glyphs[GLYPH];
  const t = g.transform ? ` transform="${g.transform}"` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="-10 -10 20 20"><g${t} fill="none" stroke="${color.icon}" stroke-width="${g.strokeWidth ?? 1.8}" stroke-linecap="round" stroke-linejoin="round">${g.body}</g></svg>`;
}

async function png(svg: string, size: number, file: string): Promise<void> {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(path.join(outDir, file));
}

async function main(): Promise<void> {
  await mkdir(outDir, { recursive: true });
  const key = renderTile(helloTile(0));
  await png(key, 72, 'keyHello.png');
  await png(key, 144, 'keyHello@2x.png');
  await png(key, 256, 'pluginIcon.png');
  await png(key, 512, 'pluginIcon@2x.png');
  await png(glyphSvg(28), 28, 'pluginCategory.png');
  await png(glyphSvg(56), 56, 'pluginCategory@2x.png');
  await png(glyphSvg(20), 20, 'actionHello.png');
  await png(glyphSvg(40), 40, 'actionHello@2x.png');
  console.log(`Icons written to ${outDir}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
