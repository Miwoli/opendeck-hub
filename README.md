# opendeck-hub

A collection of [OpenDeck](https://github.com/nekename/OpenDeck) plugins for Linux, built for a first-generation
Stream Deck (15 LCD keys, 5x3) and drawn in a consistent "Nocturne" tile style.

Everything is TypeScript on Node.js, bundled with esbuild, with a small shared library (`@miwoli/deck-core`) that
provides the OpenAction client, settings helpers, the tile renderer and hold-to-confirm.

## Plugins

| Path | Plugin | What it does |
|---|---|---|
| `plugins/claude-usage` | `com.miwoli.claude-usage` | Claude.ai session and weekly usage limits |
| `plugins/ha-map` | `com.miwoli.ha-map` | OpenStreetMap of the people in Home Assistant, plus a per-person distance key |
| `plugins/homeassistant` | `com.miwoli.homeassistant` | Home Assistant temperature; pressing toggles an entity |
| `plugins/discord` | `com.miwoli.discord` | Mic / Headphones / push-to-talk in Vesktop through a Vencord userplugin |
| `plugins/displays` | `com.miwoli.displays` | KDE screen layouts through `kscreen-doctor` |
| `plugins/media` | `com.miwoli.media` | Now playing (MPRIS), cover art, pause / next / switch player |
| `plugins/system` | `com.miwoli.system` | Power off (hold + confirm), screenshot (Spectacle), clock |
| `plugins/games` | `com.miwoli.games` | Steam / Lutris libraries, recently played, game mode, close game |
| `plugins/dev-preview` | `com.miwoli.dev-preview` | Developer tool: shows every tile state on a real deck |
| `packages/core` | `@miwoli/deck-core` | Shared library |
| `scripts/` | | Shared build / install / pack / smoke scripts |

## Requirements
- Linux with OpenDeck installed (native package or Flatpak)
- Node.js >= 22.18 for development (tests and the preview run TypeScript directly); the plugin bundles target Node 20

## Development

```bash
npm install
npm run build                                # all plugins
npm test                                     # core + plugin unit tests + e2e tests against fake OpenDeck servers
npm run typecheck
npm run preview                              # every tile state: dist/preview/index.html + PNG files
npm run build -w plugins/<name>
npm run install-plugin -w plugins/<name>     # build and copy into OpenDeck's plugin directory (backs up the old copy)
npm run pack -w plugins/<name>               # .streamDeckPlugin archive for OpenDeck's "Install from file"
```

After installing, restart OpenDeck. Plugin logs are written to
`~/.local/share/opendeck/logs/plugins/<UUID>.sdPlugin.log`.

## Documentation
- [`docs/tile-design.md`](docs/tile-design.md) - the tile grammar (templates, colours, hold-to-confirm)
- [`docs/notes/`](docs/notes) - verified facts about OpenDeck (manifest schema, Node runtime, profile switching, rendering)
- Each plugin has its own README with setup, settings and troubleshooting.
- [`CONTRIBUTING.md`](CONTRIBUTING.md) - how to work on the code

## Notes
- Only the `Keypad` controller is supported (no dials or touch strips).
- Plugins cannot switch OpenDeck profiles; use OpenDeck's built-in Starter Pack "Switch Profile" action for page navigation.
- No accounts, cloud services or telemetry, except where a plugin documents it (OpenStreetMap tiles in `ha-map`, the
  unofficial usage endpoint in `claude-usage`, optional cover downloads in `media`).

## License
[MIT](LICENSE). The exception is `plugins/discord/vencord-userplugin/`, which is derived from Vencord and licensed
[GPL-3.0-or-later](plugins/discord/vencord-userplugin/LICENSE).
