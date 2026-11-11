// Key images as SVG -> data URI (base64), matching the `image` field
// of the setImage payload. OpenDeck draws them in a webview (144x144 canvas,
// verified in src/lib/rendererHelper.ts), so the SVG is rendered
// by the browser without network access: system fonts only, images
// only as data: URIs. Coordinates use a 72x72 viewBox (the Stream Deck key size),
// on a 144x144 canvas for sharpness.

// `xlink:href` instead of plain `href` - older WebKitGTK (Tauri on Linux)
// needs the xlink namespace in SVG images.
export const SVG_OPEN =
  '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="144" height="144" viewBox="0 0 72 72">';

export function svgToDataUri(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
}

export interface AvatarImage {
  mime: string;
  b64: string;
}

export function buildBlankTileSvg(): string {
  return `${SVG_OPEN}
  <rect width="72" height="72" fill="#1b1d21" />
  <rect x="0.5" y="0.5" width="71" height="71" fill="none" stroke="#2a2c31" />
</svg>`;
}
