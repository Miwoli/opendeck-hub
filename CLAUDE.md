# opendeck-hub - guide for Claude Code and contributors

OpenDeck plugins for Linux, Node.js + TypeScript, npm workspaces. Target hardware: first-generation Stream Deck, 15 LCD
keys in a 5x3 grid (columns 0-4, rows 0-2), physically 72x72 px (OpenDeck draws 144x144 and downsizes). No dials or touch strips.

Code, comments, identifiers, logs and documentation are in English. See `CONTRIBUTING.md` for the conventions and
`docs/notes/` for verified OpenDeck facts (read the relevant note before working on that area). Personal notes belong in
`CLAUDE.local.md` and `docs/private/`, both git-ignored.

## Hard rules (verified, do not re-guess)
- Manifest: required `Name, Author, Version, Icon, Actions` and **`"OS": [{"Platform": "linux"}]`** (missing = "Failed to
  parse manifest"). Do not write `Description`, `SDKVersion`, `Software`, `UserTitleEnabled`. `"Controllers": ["Keypad"]` only.
- Bundle: esbuild `format: 'cjs'`, output `bin/plugin.cjs` (ESM or `.js` makes `ws` crash with "Dynamic require"). Bundle test:
  `node <plugin>.sdPlugin/bin/plugin.cjs -port 1 -pluginUUID test -registerEvent registerPlugin -info '{}'` -> `ECONNREFUSED`.
- Logs: `~/.local/share/opendeck/logs/opendeck.log`, `~/.local/share/opendeck/logs/plugins/<UUID>.sdPlugin.log`. Plugin global
  settings: `~/.config/opendeck/settings/<UUID>.sdPlugin.json`. Plugins: `~/.config/opendeck/plugins/` (Flatpak: `~/.var/app/...`).
- A plugin cannot switch profiles (`switchProfile` is accepted only from Starter Pack); it cannot change the image of a
  Starter Pack key either.
- `setImage` takes `data:` URIs and every call marks the profile as changed: de-duplicate by hash and throttle. Track
  visible contexts with `willAppear` / `willDisappear`; run background work only while something is visible.
- `willAppear` / `keyDown` carry `payload.coordinates {row, column}`. Do not use `titleParametersDidChange` for coordinates.
- Child processes: `execFile` with an argument array and a timeout, never a shell with concatenated strings.
- Do not invent field or event names. When unsure, check `nekename/OpenDeck` (clone it to a temporary directory) and say
  that you verified it.
- UUIDs (`com.miwoli.<plugin>` / `com.miwoli.<plugin>.<action>`) of existing plugins must not change.

## Git workflow (hard rule)
- **Never commit, push or merge directly on `main`.** `main` changes only through a pull request. If a session starts on
  `main`, create a branch before editing any file.
- One branch per task or ticket, created from an up-to-date `main`: `git switch main && git pull --ff-only && git switch -c <branch>`.
- **Work in a git worktree, never in the shared main checkout**, so several agents can work in parallel without fighting
  over one branch: `git worktree add <worktrees-dir>/<scope>-<short-description> -b <branch> origin/main`.
  - `<worktrees-dir>` is a folder **outside** the repository checkout, so the main code stays clean and is never nested
    inside copies of itself. The owner's location is in `CLAUDE.local.md`; without one, use a sibling folder such as
    `../opendeck-hub-worktrees`.
  - One worktree per branch and per agent; git refuses to check out the same branch twice.
  - A worktree has its own `node_modules`: run `npm install` in it before building or testing.
  - Do not touch another worktree's files. When the PR is merged, remove it: `git worktree remove <path>` and delete the branch.
  - The main checkout stays on `main` and is only used to pull and to create worktrees.
- Branch name: `<type>/<scope>-<short-description>`, lowercase, words joined by `-`.
  - `type`: `feat`, `fix`, `docs`, `ci`, `chore`, `refactor`, `test` (same as the Conventional Commits type).
  - `scope`: the plugin directory name (`games`, `ha-map`), `core`, or `repo` for repo-wide work.
  - Examples: `feat/games-close-key-preview`, `fix/media-cover-flicker`, `ci/repo-pr-workflow`, `docs/repo-readme-badges`.
  - No `claude/` or personal prefixes. Do not reuse a branch for a different task.
- Commit messages follow Conventional Commits: `<type>(<scope>): <summary>` (e.g. `feat(games): show running game on close key`).
- Commit or push only when the user asks. Never force-push a shared branch and never rewrite `main`.
- Open a pull request into `main` with `gh pr create`; reference the ticket (`Closes #<n>`). PRs are squash-merged, so the PR
  title must itself be a Conventional Commit.

## Working style
State the approach first, then the code, then a test step. For every significant change give: the build command, where to
copy the plugin, how to restart OpenDeck and what to look for in the logs.
