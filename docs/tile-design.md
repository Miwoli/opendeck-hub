# Tile design (Nocturne)

Tiles are 72x72 px SVGs (drawn at 144x144 by OpenDeck, see `docs/notes/opendeck-rendering-notes.md`) rendered by
`packages/core/src/render`. The `deck` layout on a black background is the default; `layouts.design` is the original,
smaller typography kept for reference. `npm run preview` renders every state side by side.

## Templates (deck layout, everything centred)
- **Icon** - badge circle r=12 at (36,20), icon stroke 1.8, name at y=48, status at y=62.
- **Value** - number 26 px at y=28, 4 px bar at y=33, name and status below; the clock uses 26 px at y=31.
- **Cover** - full gradient or cover art, scrim, badge r=10 at (36,20), name at y=53, status at y=65.

## Surface and text
- Tile background `#000000`, 7 % white outline, corner radius 12. Surfaces: Ink `#090A0F`, Surface `#12141B`, Raised `#1B1E28`.
- Text `#ECEDF2` / `#A6ACBD` / `#8A90A2`. Fonts: Manrope for text, Space Grotesk for numbers.
- Name 700 at 11 px, status 600 at 9.5 px, maximum text width about 68 px. Longer text is truncated with an ellipsis, so
  keep labels short.

## Colour only carries meaning
| Colour | Meaning |
|---|---|
| Ember `#FFB547` | on / selected (gradient pill, dark text) |
| Mint `#5BE3A5` | ok / home / live |
| Iris `#7B6CFF` | navigation |
| Alert `#FF5C5C` | muted / error / destructive |
| Glacier `#6CB8FF` | cool end of the temperature scale |

Bars: Mint below 70 %, Ember 70-90 %, Alert above 90 %. A dashed outline marks an offline or placeholder tile.

## Hold to confirm
Destructive actions (power off, close game) use a hold: 1 s with a progress bar, then a confirmation tile ("Shut down? /
press · 3") that counts down for 3 s. The hold is measured between `keyDown` and `keyUp`; a short press does nothing.
