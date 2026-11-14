# Media (MPRIS)

<a href="https://github.com/Miwoli/opendeck-hub/releases?q=media&expanded=true"><img alt="release" src="https://img.shields.io/github/v/release/Miwoli/opendeck-hub?filter=media-v*&label=release&color=FFB547"></a>
<a href="https://github.com/Miwoli/opendeck-hub/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/Miwoli/opendeck-hub/ci.yml?branch=main&label=CI&logo=githubactions&logoColor=white"></a>
<img alt="Platform: Linux" src="https://img.shields.io/badge/platform-Linux-FCC624?logo=linux&logoColor=black">
<a href="../../LICENSE"><img alt="License" src="https://img.shields.io/github/license/Miwoli/opendeck-hub"></a>

Now playing on a key: the cover, title and artist of whatever plays (Spotify, a browser, Haruna…), with pause, next and
switching between players.

<img src="../../docs/images/media.png" width="392" alt="Media tiles: a track playing, the same track paused, and a second player with player dots at the top">

`com.miwoli.media` · part of [opendeck-hub](../../README.md)

## Actions

| Action | UUID | What it does |
|---|---|---|
| Player | `com.miwoli.media.player` | A short press pauses / resumes, a **double press switches the player**, a hold of >= 0.5 s skips to the next track. Double press and hold are configurable in the Property Inspector: switch / next / previous / nothing |

The tile uses the Cover template: playing = equaliser + artist; paused = dimmed cover + ▶ + "Paused"; no player = "nothing
playing".

## Install

Download `com.miwoli.media.sdPlugin-<version>.streamDeckPlugin` from the
[latest Media release](https://github.com/Miwoli/opendeck-hub/releases?q=media&expanded=true) and follow the
[install steps](../../README.md#install). Needs systemd's `busctl` (no `playerctl`). The action is in the "Media" category.

## How it works

- Data comes from D-Bus through `busctl --user --json=short` (systemd), with no npm dependency. Polling every 1.5 s, only
  while the tile is visible.
- **Player choice:** the preferred player from the Property Inspector (pinned; a double press does not switch it) → the one
  chosen with a double press or the one that **started playing last** (shared across pages) → a playing one → a paused one.
- **Several players:** dots at the top of the tile, one per active (playing or paused) player: orange = playing, wide =
  shown. A double press moves to the next player and the status line shows its name for 2 s.
- **Double-press delay:** pause / resume waits 0.3 s for a possible second press, but only when a double press has something
  to do (with a single player and "switch" it acts immediately).
- **Covers:** local (`file://`, e.g. browsers) always; remote (Spotify: `https://i.scdn.co/...`) **only after you allow it
  in the Property Inspector** (global setting `allowRemoteArt`, off by default). Downloaded covers are cached in
  `~/.cache/opendeck-hub/covers`.
- **Privacy:** the log contains only the list of players and their state, never titles or URLs.

## Security and secrets

- **Secrets:** none stored. No accounts or tokens.
- **Access needed:** the user D-Bus session (`busctl --user`) to read and control MPRIS players; no root.
- **Network:** none by default. Only after you enable remote covers (global setting `allowRemoteArt`) it downloads the cover
  URL a player advertises (for example Spotify's `i.scdn.co`), so that server learns your IP. Covers are cached as images in
  `~/.cache/opendeck-hub/covers`.
- **Logs:** player names and state only, never titles or URLs.

## Troubleshooting

- **Logs:** `~/.local/share/opendeck/logs/plugins/com.miwoli.media.sdPlugin.log` (`players: Spotify:Playing, …`, `switched to Firefox`).

## Development

```bash
npm test -w plugins/media              # build + tests (MPRIS parser, covers, e2e against a fake busctl) + bundle smoke test
npm run install-plugin -w plugins/media
npm run pack -w plugins/media          # -> plugins/media/dist/com.miwoli.media.sdPlugin-<version>.streamDeckPlugin
```
