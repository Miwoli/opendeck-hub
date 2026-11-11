// Local tile preview without a deck: renders every gallery state to dist/preview/index.html
// (deck layout next to the design layout) and to 144x144 PNG files via sharp.
// Run: npm run preview   (Node >= 22.18 runs this TypeScript file directly)

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { color, gallery, layouts, renderTile } from '../src/render/index.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..', '..');
const outDir = path.join(repo, 'dist', 'preview');
const pngDir = path.join(outDir, 'png');

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function scaled(svg: string): string {
  return svg.replace('width="144" height="144"', 'width="128" height="128"');
}

async function writePngs(tiles: Array<{ id: string; svg: string }>): Promise<string> {
  let sharp: typeof import('sharp');
  try {
    sharp = (await import('sharp')).default;
  } catch {
    return 'sharp not installed - PNG skipped';
  }
  await mkdir(pngDir, { recursive: true });
  for (const t of tiles) {
    await sharp(Buffer.from(t.svg)).png().toFile(path.join(pngDir, `${t.id}.png`));
  }
  return `${tiles.length} PNG files in ${path.relative(repo, pngDir)}/`;
}

async function main(): Promise<void> {
  await mkdir(outDir, { recursive: true });
  const rendered: Array<{ id: string; svg: string }> = [];

  const sections = gallery
    .map((section) => {
      const cells = section.items
        .map((item) => {
          const svg = renderTile(item.spec);
          const designSvg = renderTile(item.spec, { layout: layouts.design, surface: color.surface });
          rendered.push({ id: item.id, svg });
          return `<figure>
  <div class="pair"><div class="tile">${scaled(svg)}</div><div class="tile">${scaled(designSvg)}</div></div>
  <figcaption>${escapeHtml(item.label)}<br><code>${item.id}</code></figcaption>
</figure>`;
        })
        .join('\n');
      return `<section><h2>${escapeHtml(section.title)}</h2><div class="grid" style="grid-template-columns:repeat(${section.columns},auto)">${cells}</div></section>`;
    })
    .join('\n');

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Nocturne tiles preview</title>
<style>
body{margin:0;padding:32px;background:#090A0F;color:#ECEDF2;font:14px Manrope,'DejaVu Sans',sans-serif}
h1{margin:0 0 4px;font-size:24px}h2{font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:#8A90A2;margin:32px 0 12px}
p{color:#A6ACBD;margin:0 0 8px}
.grid{display:grid;gap:18px 14px}
figure{margin:0}.pair{display:flex;gap:6px}.tile{line-height:0}
figcaption{font-size:11px;color:#A6ACBD;margin-top:6px;max-width:262px}code{color:#8A90A2}
#fonts{padding:8px 12px;border-radius:8px;background:#331E24;color:#FFC2C2;display:none;margin-bottom:12px}
</style></head><body>
<h1>Nocturne tiles - local preview</h1>
<p>Left: the <code>deck</code> layout on black (what is sent to the deck). Right: the <code>design</code> layout. Generated ${new Date().toISOString()}. The PNG files in <code>png/</code> are the left variant.</p>
<div id="fonts">Manrope / Space Grotesk are not installed locally - the preview and OpenDeck fall back to DejaVu Sans.</div>
${sections}
<script>document.fonts.ready.then(()=>{if(!document.fonts.check('12px Manrope')||!document.fonts.check('12px "Space Grotesk"'))document.getElementById('fonts').style.display='block'})</script>
</body></html>`;

  const htmlPath = path.join(outDir, 'index.html');
  await writeFile(htmlPath, html);
  const pngInfo = await writePngs(rendered);
  console.log(`Preview: ${htmlPath}`);
  console.log(pngInfo);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
