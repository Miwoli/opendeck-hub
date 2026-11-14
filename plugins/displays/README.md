# Displays (KDE)

<a href="https://github.com/Miwoli/opendeck-hub/releases?q=displays&expanded=true"><img alt="release" src="https://img.shields.io/github/v/release/Miwoli/opendeck-hub?filter=displays-v*&label=release&color=FFB547"></a>
<a href="https://github.com/Miwoli/opendeck-hub/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/Miwoli/opendeck-hub/ci.yml?branch=main&label=CI&logo=githubactions&logoColor=white"></a>
<img alt="Platform: Linux" src="https://img.shields.io/badge/platform-Linux-FCC624?logo=linux&logoColor=black">
<a href="../../LICENSE"><img alt="License" src="https://img.shields.io/github/license/Miwoli/opendeck-hub"></a>

Switch KDE screen layouts from the deck: one screen only, or all screens extended. Layouts are applied with
`kscreen-doctor` (KDE / KWin, Wayland).

<img src="../../docs/images/displays.png" width="392" alt="Displays tiles: Screen 1, Extend active in Ember, Screen 2, and a layout switching">

`com.miwoli.displays` · part of [opendeck-hub](../../README.md)

## Actions

| Action | UUID | What it does |
|---|---|---|
| Screen layout | `com.miwoli.displays.layout` | Switches to its layout. Put several on a page, e.g. **Screen 1** (single screen), **Extend** (all screens) and **Screen 2** (single screen) |

| Tile | Meaning |
|---|---|
| Ember "Active" | this layout is currently on |
| "Switch" | pressing switches to this layout |
| "switching…" → "error" (Alert) | a change is in progress / `kscreen-doctor` failed (details in the log) |
| "none" (dashed outline) | the selected screen is disconnected; the key will not turn anything off |
| "set in PI" | the action has no layout yet |

## Install

Download `com.miwoli.displays.sdPlugin-<version>.streamDeckPlugin` from the
[latest Displays release](https://github.com/Miwoli/opendeck-hub/releases?q=displays&expanded=true) and follow the
[install steps](../../README.md#install). Needs KDE Plasma with `kscreen-doctor`. The action is in the "Screens" category.

## Settings (Property Inspector)

- **Layout:** "Single screen" or "Extend".
- **Screen:** the outputs detected by `kscreen-doctor -j` (for example `DP-1`, `HDMI-1`). The other outputs are turned
  off and the selected one becomes primary.
- **Tile name:** by default "Screen 1/2" in left-to-right order, and "Extend".

## How it works

"Extend" restores the last seen layout of both screens (positions, priorities, modes). The plugin remembers it in its global
settings (`~/.config/opendeck/settings/com.miwoli.displays.sdPlugin.json`, key `extend`) whenever it sees both screens
enabled. Without a remembered layout it places the screens left to right by priority.

Commands use `execFile` without a shell, for example for "Screen 2":
`kscreen-doctor output.HDMI-1.enable output.HDMI-1.priority.1 output.DP-1.disable`. `kscreen-doctor -j` is polled every
5 s, only while a tile is visible.

## Security and secrets

- **Secrets:** none. No network, accounts or tokens.
- **Stores:** the last extended layout (output names, positions, modes) in the plugin's global settings,
  `~/.config/opendeck/settings/com.miwoli.displays.sdPlugin.json`.
- **Access needed:** runs `kscreen-doctor` (KDE) as your user, with an argument array and no shell; no root.

## Troubleshooting

- **Logs:** `~/.local/share/opendeck/logs/plugins/com.miwoli.displays.sdPlugin.log`: `apply {...}: kscreen-doctor …`,
  `remembered extended layout`, `switching layout failed` (+ the `kscreen-doctor` stderr).

## Development

```bash
npm test -w plugins/displays            # build + tests (layout logic on a recorded fixture, e2e with a fake kscreen-doctor) + bundle smoke test
npm run install-plugin -w plugins/displays
npm run pack -w plugins/displays        # -> plugins/displays/dist/com.miwoli.displays.sdPlugin-<version>.streamDeckPlugin
```
