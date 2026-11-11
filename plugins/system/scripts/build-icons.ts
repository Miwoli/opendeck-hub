// Static manifest icons (PNG) drawn with the shared Nocturne renderer; sharp is a build-time dependency only.

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { type GlyphName, color, glyphs, holdTile, renderTile } from '../../../packages/core/src/render/index.ts';
import { clockTile } from '../src/actions/clock.ts';
import { screenshotTile } from '../src/actions/screenshot.ts';

const outDir = path.join(process.cwd(), 'com.miwoli.system.sdPlugin', 'images');

function glyphSvg(name: GlyphName, size: number): string {
  const g = glyphs[name];
  const t = g.transform ? ` transform="${g.transform}"` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="-10 -10 20 20"><g${t} fill="none" stroke="${color.icon}" stroke-width="${g.strokeWidth ?? 1.8}" stroke-linecap="round" stroke-linejoin="round">${g.body}</g></svg>`;
}

// the design has no clock glyph; a plain clock face is used only for the action list icon
function clockSvg(size: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="-10 -10 20 20"><g fill="none" stroke="${color.icon}" stroke-width="1.8" stroke-linecap="round"><circle r="8"/><path d="M0 -4.5V0l3 2"/></g></svg>`;
}

async function png(svg: string, size: number, file: string): Promise<void> {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(path.join(outDir, file));
}

async function main(): Promise<void> {
  await mkdir(outDir, { recursive: true });
  const keys = {
    keyPower: renderTile(holdTile({ phase: 'idle' }, { glyph: 'power', name: 'Power', idleStatus: 'hold 1 s', confirmName: 'Shut down?' })),
    keyScreenshot: renderTile(screenshotTile({ mode: 'fullscreen', folder: '' }, 'idle')),
    keyClock: renderTile(clockTile(new Date(2026, 9, 31, 16, 22))),
  };
  for (const [file, svg] of Object.entries(keys)) {
    await png(svg, 72, `${file}.png`);
    await png(svg, 144, `${file}@2x.png`);
  }
  await png(keys.keyPower, 256, 'pluginIcon.png');
  await png(keys.keyPower, 512, 'pluginIcon@2x.png');
  await png(glyphSvg('power', 28), 28, 'pluginCategory.png');
  await png(glyphSvg('power', 56), 56, 'pluginCategory@2x.png');
  for (const [file, svg] of [['actionPower', (s: number) => glyphSvg('power', s)], ['actionScreenshot', (s: number) => glyphSvg('screenshot', s)], ['actionClock', clockSvg]] as const) {
    await png(svg(20), 20, `${file}.png`);
    await png(svg(40), 40, `${file}@2x.png`);
  }
  console.log(`Icons written to ${outDir}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
