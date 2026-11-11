# Nocturne Preview (dev) - `com.miwoli.dev-preview`

Developer plugin: shows every tile state from `@miwoli/deck-core` (`render/gallery.ts`, the same set as `npm run preview`)
on a real deck. It is not part of any end-user profile.

## Install
```bash
npm run pack -w plugins/dev-preview
```
OpenDeck -> Plugins -> "Install from file" -> `plugins/dev-preview/dist/com.miwoli.dev-preview.sdPlugin-<version>.streamDeckPlugin`,
then restart OpenDeck.

## Use
1. Create a test profile in OpenDeck and put the "Tile preview" action (category "Nocturne Preview") on all 15 keys.
2. The first page is "Variants": row 1 = the original design layout, row 2 = the `deck` layout on Nocturne Surface,
   row 3 = the default `deck` layout on black. Other pages show the gallery tiles at their position. Pressing any key cycles
   Variants -> Main -> Games -> States.
3. On the Main page the Power key works as a real hold-to-confirm: hold 1 s, release, press within 3 s. Only OpenDeck's
   "OK" overlay appears; nothing is executed.

Log: `~/.local/share/opendeck/logs/plugins/com.miwoli.dev-preview.sdPlugin.log` (`[dev-preview]` lines).
