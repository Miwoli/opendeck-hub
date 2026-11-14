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
npm run install-plugin                       # build every released plugin (not dev-preview) and copy it into OpenDeck
npm run install-plugin -- <name> [<name>...] # only these plugins
npm run uninstall-plugin [-- <name>...]      # remove this repo's plugins from OpenDeck
npm run pack -w plugins/<name>               # create a .streamDeckPlugin archive
```

The plugin directory is detected (`~/.config/opendeck/plugins/` and any OpenDeck Flatpak under `~/.var/app/`); set
`OPENDECK_PLUGINS_DIR` to install somewhere else, for example a temporary directory. A copy that is replaced or removed
is moved to `~/.cache/opendeck-hub/backup/`, never deleted. After installing a plugin, restart OpenDeck and check the plugin log for errors. Each plugin's README describes its
settings and troubleshooting steps.

## Adding a plugin

```bash
npm run new-plugin -- <name>     # lowercase letters, digits and hyphens, e.g. "my-plugin"
npm install                      # registers the new workspace; commit the package-lock.json change
npm test -w plugins/<name>
```

This copies `scripts/templates/plugin` to `plugins/<name>/` (manifest with the right UUIDs, `OS` and `Controllers`,
esbuild CJS build, icon script, one sample action, a test, a README and a changelog) and adds the plugin to
`release-please-config.json` and `.release-please-manifest.json`. It never overwrites an existing plugin. The result
already passes `npm run check-manifests`, `npm run check-versions` and the bundle smoke test.

Then:

1. Replace the sample `hello` action (and rename its UUID, the manifest entry and the icons) with your own, and fill in the `TODO`s in the README.
2. Add a row to the plugin table in the root `README.md` and a tile strip for it: add the plugin's tiles to
   `scripts/readme-images/tiles.ts` and run `npm run readme-images`.

## Making a change

1. Fork the repository and create a branch from an up-to-date `main`. Nothing is committed to `main` directly; every
   change, including the maintainers' own, goes through a pull request.
2. Name the branch `<type>/<scope>-<short-description>`, where `type` is `feat`, `fix`, `docs`, `ci`, `chore`, `refactor`
   or `test`, and `scope` is the plugin directory (`games`), `core`, or `repo` for repo-wide changes. For example
   `feat/games-close-key-preview` or `ci/repo-pr-workflow`.
3. Make your change. Keep it focused: one fix or feature per pull request is much easier to review.
4. Add or update tests, and run `npm run typecheck` and `npm test` before you push.
5. Open a pull request that explains what changed and why, and link the issue (`Closes #<n>`). Pull requests are
   squash-merged, so give the title the form `<type>(<scope>): <summary>`. If the behaviour can only be checked on a
   real OpenDeck, say how you tried it (OpenDeck version, which keys you pressed, what you saw).

## Code style

- Everything in the repository is written in English: code, comments, identifiers, logs and documentation.
- TypeScript in `strict` mode, `async`/`await`, one module per action. Avoid `any` and validate unknown data instead.
  Avoid global state apart from the connection itself.
- Keep dependencies to a minimum (`ws` is the only runtime dependency). Plugins are bundled with esbuild.
- Run child processes only with `execFile` and an argument array, never through a shell with concatenated strings, and
  always with a timeout. Clean up timers and processes in `willDisappear` and on exit.
- Comments should explain why something is done, not what the code does. Please do not leave dates, task numbers or
  references to private notes in the code.
- Version plugins with [SemVer](https://semver.org/) through [release-please](#releases); do not edit versions or changelogs by hand.
- A plugin should provide the npm scripts `build`, `watch`, `install-plugin`, `pack`, `typecheck`, `smoke` and `test`,
  plus a README covering installation, settings and troubleshooting.

### UUIDs

Plugins use `com.miwoli.<name>` and actions use `com.miwoli.<name>.<action>`. Please never rename the UUID of an
existing plugin or action: OpenDeck stores profiles by UUID, so a rename breaks every profile that already uses it.

## Releases

Releases are automated with release-please (`.github/workflows/release.yml`). Pull requests are squash-merged, so the
title is the commit message: `feat(<plugin>): ...` makes a minor release, `fix(<plugin>): ...` a patch (while a plugin is
below 1.0, a breaking change also bumps the minor). Other types (`docs`, `ci`, `chore`, `refactor`, `test`) release
nothing. A change is attributed to a plugin by the files it touches, not by the scope. After releasable commits land on
`main`, release-please keeps one release PR per plugin open (version in `package.json` and the manifest, and
`plugins/<name>/CHANGELOG.md`). Merging it tags `<plugin>-v<version>` and creates a draft release; the workflow then runs
the checks, uploads the `.streamDeckPlugin` and its `.sha256`, and publishes the release.

`packages/core` is bundled into every plugin but is not released on its own. A change to core that should reach users must
be committed together with a change in each affected plugin, for example `fix(games): ...`, so that plugin gets a release.

### Maintainer setup: GitHub App token

Pull requests opened with the default `GITHUB_TOKEN` do not start CI, so the release workflow uses a GitHub App token.

1. Create a GitHub App (Settings -> Developer settings -> GitHub Apps -> New): no webhook, repository permissions
   **Contents: read and write**, **Pull requests: read and write**, **Metadata: read** (automatic); everything else none.
2. Install it on this repository only.
3. Generate a private key on the App page, and note the App's Client ID.
4. Add repository secrets `RELEASE_APP_CLIENT_ID` (the Client ID) and `RELEASE_APP_PRIVATE_KEY` (the full `.pem` contents).

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
