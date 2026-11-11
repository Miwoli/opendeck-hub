# Running a Node.js plugin under OpenDeck

Verified on a live OpenDeck while debugging a plugin that showed no data.

## Where to look for logs
- Main OpenDeck log: `~/.local/share/opendeck/logs/opendeck.log` (manifest parse errors, among other things).
- Plugin log (stdout/stderr of the Node process): `~/.local/share/opendeck/logs/plugins/<plugin UUID>.sdPlugin.log` -
  the first place to look when a plugin "does nothing".
- Plugin global settings: `~/.config/opendeck/settings/<plugin UUID>.sdPlugin.json` - check that the Property Inspector
  saved what it should.
- Plugins are installed to `~/.config/opendeck/plugins/` (Flatpak: `~/.var/app/...`).

## CRITICAL: do not bundle a plugin with esbuild as `format: 'esm'`
OpenDeck starts the plugin as a plain Node script (`node bin/plugin.js -port ... -pluginUUID ...`). Bundling `ws` as ESM
crashes on start-up:

    throw Error('Dynamic require of "..." is not supported');

Plain `cjs` output with a `.js` extension inside a directory whose parent `package.json` has `"type": "module"` fails
in a local test with:

    ReferenceError: require is not defined in ES module scope

**Fix (every Node.js / TypeScript plugin):**
- esbuild `format: 'cjs'`.
- Write the output as `.cjs`, e.g. `bin/plugin.cjs`.
- Point `CodePathLin` in `manifest.json` at that file.

## Testing the bundle without OpenDeck
    node com.author.name.sdPlugin/bin/plugin.cjs -port 1 -pluginUUID test -registerEvent registerPlugin -info '{}'

Expected result: `ECONNREFUSED` on port 1 (the module loaded). `Dynamic require...` or `require is not defined` means a
broken bundle. `npm run smoke -w plugins/<name>` runs this check.
