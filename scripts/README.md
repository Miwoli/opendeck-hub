Shared plugin scripts. They run from the plugin directory (`npm run <script> -w plugins/<name>` sets the cwd); the plugin
is detected by its single `*.sdPlugin` directory.

| Script | npm | What it does |
|---|---|---|
| `build-plugin.mjs [--watch]` | `build`, `watch` | esbuild `src/index.ts` -> `<uuid>.sdPlugin/bin/plugin.cjs` (`cjs`, node20); copies `pi/` |
| `install-plugin.mjs` | `install-plugin` | copies `<uuid>.sdPlugin` to `~/.config/opendeck/plugins/` (and the Flatpak directory if present); MOVES the previous copy to `~/.cache/opendeck-hub/backup/` |
| `pack-plugin.mjs` | `pack` | `dist/<uuid>-<version>.streamDeckPlugin` (ZIP) for "Install from file" |
| `smoke-plugin.mjs` | `smoke` | bundle test without OpenDeck: starts with `-port 1`, expects `ECONNREFUSED` |

`lib/zip.mjs` is a minimal ZIP writer (fs + zlib). Icon generation (`scripts/build-icons.ts`, sharp) stays per plugin.
