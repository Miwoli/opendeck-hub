export * from './glyphs.ts';
export * from './states.ts';
export * from './svg.ts';
export * from './tiles.ts';
export * from './tokens.ts';
export { gallery, type GalleryItem, type GallerySection } from './gallery.ts';

import { svgToDataUri } from './svg.ts';
import { type RenderOptions, renderTile, type TileSpec } from './tiles.ts';

/** Spec -> `data:image/svg+xml;base64,...` ready for client.setImage(). */
export function tileImage(spec: TileSpec, options?: RenderOptions): string {
  return svgToDataUri(renderTile(spec, options));
}
