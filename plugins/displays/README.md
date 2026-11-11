# Displays (KDE) - `com.miwoli.displays`

One configurable **Screen layout** action (`com.miwoli.displays.layout`). Put several instances on a page, for example
**Screen 1** (single screen), **Extend** (all screens) and **Screen 2** (single screen). Layouts are applied with
`kscreen-doctor` (KDE / KWin, Wayland).

| Tile | Meaning |
|---|---|
| Ember "Active" | this layout is currently on |
| "Switch" | pressing switches to this layout |
| "switching…" -> "error" (Alert) | a change is in progress / `kscreen-doctor` failed (details in the log) |
| "none" (dashed outline) | the selected screen is disconnected - the key will not turn anything off |
| "set in PI" | the action has no layout yet |

## Settings (Property Inspector)
- **Layout:** "Single screen" or "Extend".
- **Screen:** the outputs detected by `kscreen-doctor -j` (for example `DP-2`, `HDMI-A-1`). The other outputs are turned
  off and the selected one becomes primary.
- **Tile name:** by default "Screen 1/2" in left-to-right order, and "Extend".

"Extend" restores the last seen layout of both screens (positions, priorities, modes). The plugin remembers it in its global
settings (`~/.config/opendeck/settings/com.miwoli.displays.sdPlugin.json`, key `extend`) whenever it sees both screens
enabled. Without a remembered layout it places the screens left to right by priority.

Commands use `execFile` without a shell, for example for "Screen 2":
`kscreen-doctor output.HDMI-A-1.enable output.HDMI-A-1.priority.1 output.DP-2.disable`. `kscreen-doctor -j` is polled every
5 s, only while a tile is visible.

## Build, test, install
```bash
npm test -w plugins/displays            # build + tests (layout logic on a recorded fixture, e2e with a fake kscreen-doctor) + bundle smoke test
npm run pack -w plugins/displays        # -> plugins/displays/dist/com.miwoli.displays.sdPlugin-<version>.streamDeckPlugin
npm run install-plugin -w plugins/displays
```
Restart OpenDeck, add the "Screen layout" action (category "Screens") and choose the layout of each instance in the
Property Inspector.

## Logs
`~/.local/share/opendeck/logs/plugins/com.miwoli.displays.sdPlugin.log`: `apply {...}: kscreen-doctor …`,
`remembered extended layout`, `switching layout failed` (+ the `kscreen-doctor` stderr).
