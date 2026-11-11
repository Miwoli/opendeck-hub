# Contributing to opendeck-hub

Thanks for your interest in opendeck-hub! Bug reports, ideas, documentation fixes and new plugins are all welcome.
This guide explains how to report a problem, set up the project and get a change merged.

## Reporting a bug

Please open an issue and include:

- which plugin is affected (for example `claude-usage` or `ha-map`) and its version,
- your OpenDeck version and how you installed it (native or Flatpak),
- what you expected to happen and what happened instead,
- the relevant lines from the logs:
  - `~/.local/share/opendeck/logs/opendeck.log`
  - `~/.local/share/opendeck/logs/plugins/<UUID>.sdPlugin.log`

Remove tokens, URLs of your Home Assistant instance and other personal data before pasting logs or screenshots.

## Suggesting a feature or a new plugin

Open an issue first and describe what you would like to do and why. A short discussion up front saves you from writing
code that does not fit the project. Keep in mind the target hardware: a first-generation Stream Deck with 15 LCD keys
(5x3, 72x72 px each) and no dials or touch strips, so everything has to work with plain key presses.

## Setting up

You need Node.js 22.18 or newer.

```bash
npm install
npm run typecheck
npm test
```

Other useful commands:

```bash
npm run build                                # build every plugin
npm run preview                              # render all tile states to dist/preview/index.html
npm run build -w plugins/<name>              # build one plugin
npm run install-plugin -w plugins/<name>     # build and copy it into OpenDeck
npm run pack -w plugins/<name>               # create a .streamDeckPlugin archive
```

After installing a plugin, restart OpenDeck and check the plugin log for errors. Each plugin's README describes its
settings and troubleshooting steps.

## Making a change

1. Fork the repository and create a branch from `main`.
2. Make your change. Keep it focused: one fix or feature per pull request is much easier to review.
3. Add or update tests, and run `npm run typecheck` and `npm test` before you push.
4. Open a pull request that explains what changed and why. If the behaviour can only be checked on a real OpenDeck,
   say how you tried it (OpenDeck version, which keys you pressed, what you saw).

## Code style

- Everything in the repository is written in English: code, comments, identifiers, logs and documentation.
- TypeScript in `strict` mode, `async`/`await`, one module per action. Avoid `any` and validate unknown data instead.
  Avoid global state apart from the connection itself.
- Keep dependencies to a minimum (`ws` is the only runtime dependency). Plugins are bundled with esbuild.
- Run child processes only with `execFile` and an argument array, never through a shell with concatenated strings, and
  always with a timeout. Clean up timers and processes in `willDisappear` and on exit.
- Comments should explain why something is done, not what the code does. Please do not leave dates, task numbers or
  references to private notes in the code.
- Version plugins with [SemVer](https://semver.org/) and note user-visible changes in `CHANGELOG.md`.
- A plugin should provide the npm scripts `build`, `watch`, `install-plugin`, `pack`, `typecheck`, `smoke` and `test`,
  plus a README covering installation, settings and troubleshooting.

### UUIDs

Plugins use `com.miwoli.<name>` and actions use `com.miwoli.<name>.<action>`. Please never rename the UUID of an
existing plugin or action: OpenDeck stores profiles by UUID, so a rename breaks every profile that already uses it.

## Working with OpenDeck

OpenDeck behaves in a few non-obvious ways. Before you touch manifests, bundling, profile switching or image rendering,
read the notes in [`docs/notes/`](docs/notes). Some of the most important points:

- A manifest needs `Name`, `Author`, `Version`, `Icon`, `Actions` and `"OS": [{"Platform": "linux"}]`. `CodePathLin`
  points to the bundle. Only the `Keypad` controller is used.
- Bundles are built by esbuild as `format: 'cjs'` and written to `bin/plugin.cjs`.
- `setImage` accepts `data:` URIs, and every call marks the profile as changed, so de-duplicate images by hash and
  throttle updates. Track visible keys with `willAppear` / `willDisappear` and do background work only while something
  is visible.
- Only `keyDown` and `keyUp` events are used; a long press is the time between them.

## License
By contributing you agree that your changes are released under the project license (MIT), except changes inside
`plugins/discord/vencord-userplugin/`, which is GPL-3.0-or-later.
