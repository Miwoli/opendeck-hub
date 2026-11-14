Shared plugin scripts. They run from the plugin directory (`npm run <script> -w plugins/<name>` sets the cwd); the plugin
is detected by its single `*.sdPlugin` directory.

| Script | npm | What it does |
|---|---|---|
| `build-plugin.mjs [--watch]` | `build`, `watch` | esbuild `src/index.ts` -> `<uuid>.sdPlugin/bin/plugin.cjs` (`cjs`, node20); copies `pi/` |
| `install-plugin.mjs` | `install-plugin` | copies `<uuid>.sdPlugin` to `~/.config/opendeck/plugins/` (and the Flatpak directory if present); MOVES the previous copy to `~/.cache/opendeck-hub/backup/` |
| `pack-plugin.mjs` | `pack` | `dist/<uuid>-<version>.streamDeckPlugin` (ZIP) for "Install from file" + `.sha256` (sha256sum format) |
| `check-versions.mjs [<plugin>-v<semver>]` | `check-versions` (root) | manifest `Version` must equal `package.json` version + `.0`; with a tag also checks the tag. Run from the repo root |
| `check-manifests.mjs` | `check-manifests` (root) | every `plugins/*/*.sdPlugin/manifest.json` against the CLAUDE.md hard rules (required fields, `OS`, forbidden fields, `Controllers`, UUIDs); reports all problems, exit 1. Run from the repo root |
| `smoke-plugin.mjs` | `smoke` | bundle test without OpenDeck: starts with `-port 1`, expects `ECONNREFUSED` |

`lib/zip.mjs` is a minimal ZIP writer (fs + zlib). Icon generation (`scripts/build-icons.ts`, sharp) stays per plugin.
