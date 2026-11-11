// Static manifest icons (PNG) drawn with the shared Nocturne renderer; sharp is a build-time dependency only.

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { color, renderTile, usageTile } from '../../../packages/core/src/render/index.ts';
import { limitErrorTile } from '../src/tiles.ts';

const outDir = path.join(process.cwd(), 'com.miwoli.claude-usage.sdPlugin', 'images');

// small bar glyph for the action list (the design has no usage glyph)
function barSvg(size: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 20 20"><rect x="2" y="8" width="16" height="4" rx="2" fill="${color.icon}" fill-opacity=".3"/><rect x="2" y="8" width="7" height="4" rx="2" fill="${color.icon}"/></svg>`;
}

async function png(svg: string, size: number, file: string): Promise<void> {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(path.join(outDir, file));
}

async function main(): Promise<void> {
  await mkdir(outDir, { recursive: true });
  // default key images until the plugin draws: "set key" errors
  for (const [file, name] of [['keyDefaultSession', 'Session'], ['keyDefaultWeekly', 'Week']] as const) {
    const svg = renderTile(limitErrorTile(name, 'no_key'));
    await png(svg, 72, `${file}.png`);
    await png(svg, 144, `${file}@2x.png`);
  }
  const icon = renderTile(usageTile({ percent: 34, name: 'Claude', status: 'limity' }));
  await png(icon, 256, 'pluginIcon.png');
  await png(icon, 512, 'pluginIcon@2x.png');
  for (const [file, size] of [['pluginCategory', 28], ['actionSession', 20], ['actionWeekly', 20]] as const) {
    await png(barSvg(size), size, `${file}.png`);
    await png(barSvg(size * 2), size * 2, `${file}@2x.png`);
  }
  console.log(`Icons written to ${outDir}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
