# Home Assistant

<a href="https://github.com/Miwoli/opendeck-hub/releases?q=%22Home+Assistant%22&expanded=true"><img alt="release" src="https://img.shields.io/github/v/release/Miwoli/opendeck-hub?filter=homeassistant-v*&label=release&color=FFB547"></a>
<a href="https://github.com/Miwoli/opendeck-hub/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/Miwoli/opendeck-hub/ci.yml?branch=main&label=CI&logo=githubactions&logoColor=white"></a>
<img alt="Platform: Linux" src="https://img.shields.io/badge/platform-Linux-FCC624?logo=linux&logoColor=black">
<a href="../../LICENSE"><img alt="License" src="https://img.shields.io/github/license/Miwoli/opendeck-hub"></a>

A Home Assistant temperature sensor on a key, coloured by temperature, with the state of a light underneath. Pressing the
key toggles the light (or any switch).

<img src="../../docs/images/homeassistant.png" width="392" alt="Home Assistant tiles: Office 18.9 °C light on, Bedroom 22.4 °C light off, Balcony 11.5 °C light off">

`com.miwoli.homeassistant` · part of [opendeck-hub](../../README.md)

## Actions

| Action | UUID | What it does |
|---|---|---|
| Temperature (+ light) | `com.miwoli.homeassistant.temperature` | Shows a temperature sensor in a colour taken from a scale, with a bar over a range (default 10-30 °C), a room label (default "Office") and the light state ("light on" in Ember / "light off"). Pressing calls `homeassistant.toggle` on the selected entity (light / switch / input_boolean) |

Other states: "Offline" (dashed outline), "no data", "set in PI", "bad token" (Alert). A person's location key lives in
[HA Map](../ha-map) (`com.miwoli.ha-map.person`).

## Install

Download `com.miwoli.homeassistant.sdPlugin-<version>.streamDeckPlugin` from the
[latest Home Assistant release](https://github.com/Miwoli/opendeck-hub/releases?q=%22Home+Assistant%22&expanded=true) and follow
the [install steps](../../README.md#install). Needs a Home Assistant server and a long-lived access token.

## Settings (Property Inspector)

- Sensor and toggle entity (suggestions from Home Assistant), label and bar range.
- Home Assistant URL and token (shared by all keys). The **"Use the URL and token from HA Map"** button copies them from the
  `com.miwoli.ha-map` settings (`~/.config/opendeck/settings/com.miwoli.ha-map.sdPlugin.json`); the token never goes back to
  the PI.
- The token is stored in OpenDeck's plugin settings (plain JSON on disk).

## How it works

- Connection: Home Assistant WebSocket API (long-lived token), `get_states` + `subscribe_events state_changed`; only while
  the tile is visible, reconnecting with backoff.
- Pickers are `<select>` elements rather than a `<datalist>`: a large, periodically rebuilt datalist froze OpenDeck (see
  [`docs/notes/opendeck-profile-switching-notes.md`](../../docs/notes/opendeck-profile-switching-notes.md)).

## Troubleshooting

- **Logs:** `~/.local/share/opendeck/logs/plugins/com.miwoli.homeassistant.sdPlugin.log` (`Home Assistant: connected`, `toggle …`).

## Development

```bash
npm test -w plugins/homeassistant      # build + tests (tile, settings, e2e against a fake Home Assistant) + bundle smoke test
npm run install-plugin -w plugins/homeassistant
npm run pack -w plugins/homeassistant
```
