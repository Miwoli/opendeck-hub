# How OpenDeck renders key images (and what that means for tiles)

Read from `nekename/OpenDeck` @3ddecc1 (`src/lib/rendererHelper.ts`, `src-tauri/src/elgato.rs`) and the
`elgato-streamdeck` 0.14 crate, then confirmed on a first-generation Stream Deck.

## Pipeline
1. The `data:` URI from `setImage` becomes an `<img>` in the webview (WebKitGTK, Tauri).
2. It is drawn onto a **144x144** canvas (`drawImage` over the whole key; the state's `image_scale` applies).
3. The canvas is sent to the device as **JPEG**; the device library decodes it, resizes to **72x72** with a bilinear
   (`Triangle`) filter, mirrors it and sends a BMP (or JPEG q90 on newer models).

## Consequences
- An SVG loaded through `<img>` cannot fetch network resources (no web fonts), but **system fonts from fontconfig are
  available**. Install the fonts (e.g. Manrope and Space Grotesk into `~/.local/share/fonts`, then `fc-cache` and restart
  OpenDeck) and the renderer picks them up; otherwise `sans-serif` is used.
- Rasterising in the plugin is unnecessary; SVG is enough. Embedded `data:` images inside the SVG (cover art, avatars,
  map tiles) work.
- The width and height attributes of the SVG do not matter (the image is stretched to 144x144).
- A first-generation key is physically 72x72 px, so a `viewBox` of 72 maps 1:1 to device pixels. Text of 7.5 px is
  unreadable there, and the 144 -> 72 downscale blurs small text further. Hence the `deck` layout of `@miwoli/deck-core`
  (name 11 px / 700, status 9.5 px / 600, value 26 px) and the labels shortened to fit about 68 px.
- Nocturne's Surface colour (#12141B) shows up as a blue glow on the first-generation LCD, so tiles default to pure black.
- Pixel-perfect text would need the plugin to rasterise to a hinted 72x72 PNG and double the pixels; that requires a
  rasteriser at runtime (sharp / resvg) and was not needed in practice.

## Custom icon for a profile-switch key
OpenDeck's instance editor lets the user upload an image for any key, including the static Starter Pack "Switch Profile"
key. The image is rasterised to a 288x288 PNG at upload time (so fonts must already be installed). `npm run preview`
writes ready 144 px tiles to `dist/preview/png/`.
