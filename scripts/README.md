Shared plugin scripts. They run from the plugin directory (`npm run <script> -w plugins/<name>` sets the cwd); the plugin
is detected by its single `*.sdPlugin` directory.

| Script | npm | What it does |
|---|---|---|
| `build-plugin.mjs [--watch]` | `build`, `watch` | esbuild `src/index.ts` -> `<uuid>.sdPlugin/bin/plugin.cjs` (`cjs`, node20); copies `pi/` |
| `install-plugin.mjs [<plugin>...]` | `install-plugin` (root and per plugin) | from the root: builds and installs all (or the named) plugins; from a plugin: installs that one. Copies `<uuid>.sdPlugin` to `~/.config/opendeck/plugins/` and any OpenDeck Flatpak directory, or only `OPENDECK_PLUGINS_DIR`; MOVES the previous copy to `~/.cache/opendeck-hub/backup/` |
| `uninstall-plugin.mjs [<plugin>...]` | `uninstall-plugin` (root) | moves this repo's plugins (only `<uuid>.sdPlugin` names from `plugins/`) out of the same directories into the backup folder |
| `pack-plugin.mjs` | `pack` | `dist/<uuid>-<version>.streamDeckPlugin` (ZIP) for "Install from file" + `.sha256` (sha256sum format) |
| `check-versions.mjs [<plugin>-v<semver>]` | `check-versions` (root) | manifest `Version` must equal `package.json` version + `.0`; with a tag also checks the tag. Run from the repo root |
| `check-manifests.mjs` | `check-manifests` (root) | every `plugins/*/*.sdPlugin/manifest.json` against the CLAUDE.md hard rules (required fields, `OS`, forbidden fields, `Controllers`, UUIDs); reports all problems, exit 1. Run from the repo root |
| `smoke-plugin.mjs` | `smoke` | bundle test without OpenDeck: starts with `-port 1`, expects `ECONNREFUSED` |
| `new-plugin.mjs <name>` | `new-plugin` (root) | generates `plugins/<name>/` from `templates/plugin` (`__NAME__` / `__TITLE__` placeholders) and registers it in the release-please files; refuses invalid or existing names. Run from the repo root |

`lib/zip.mjs` is a minimal ZIP writer (fs + zlib); `lib/opendeck.mjs` holds plugin directory detection, the plugin filter and the backup. Icon generation (`scripts/build-icons.ts`, sharp) stays per plugin.
