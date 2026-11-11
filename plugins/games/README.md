# Games - `com.miwoli.games`

Game launchers, recently played games with cover art, a game-mode toggle and a close-game key. Everything is local; no network.

| Action | UUID | Behaviour |
|---|---|---|
| Library | `com.miwoli.games.launcher` | Property Inspector: Steam / Lutris. Steam: `steam steam://open/games`, Lutris: `lutris` (library window) |
| Recently played | `com.miwoli.games.recent` | slot 1-5 (defaults to the column, so five tiles in one row need no setup); cover + name + source; pressing launches the game |
| Game mode | `com.miwoli.games.gamemode` | for now only a toggle with state (Ember "On"), remembered in the global settings |
| Close game | `com.miwoli.games.closegame` | hold 1 s, release, press within 3 s -> SIGTERM to the game's processes, SIGKILL after 5 s; "no game" when nothing runs |

**Recently played:** Steam (`localconfig.vdf` -> LastPlayed; only installed games from `appmanifest_*.acf` in all libraries,
without Proton / Steam Linux Runtime and without games hidden in the Steam library - the `user-collections.hidden`
collection in `userdata/<id>/config/cloudstorage/cloud-storage-namespace-1.json`) plus Lutris (`pga.db` through the built-in
`node:sqlite`, installed games only). From Lutris, launchers are skipped (list in the Property Inspector; by default Ubisoft
Connect, Epic, EA App, Battle.net, GOG Galaxy, Amazon, Rockstar), as are games that are the "parent" of other games and games with
the `steam` runner (they are already in the Steam list). Covers: Steam `appcache/librarycache/<appid>/[<hash>/]library_600x900.jpg` /
`library_capsule.jpg` / `header.jpg`, Lutris `coverart/<slug>.jpg`. The list refreshes every minute, only while tiles are
visible. Launching: `steam steam://rungameid/<appid>`, `lutris lutris:rungameid/<id>` - detached, without waiting.

**Close game - needs live verification:** the game is recognised by the `reaper SteamLaunch AppId=<id>` process (Steam) or
`lutris-wrapper` (Lutris); only their descendants are signalled. These markers are well known but have not been observed on
a running game yet. If the tile keeps saying "no game" while a game runs, open an issue with the output of
`ps -eo pid,ppid,args --forest`.

```bash
npm test -w plugins/games       # build + tests (VDF, libraries on synthetic data, /proc, e2e with a fake steam) + bundle smoke test
npm run pack -w plugins/games
npm run install-plugin -w plugins/games
```
Log: `~/.local/share/opendeck/logs/plugins/com.miwoli.games.sdPlugin.log` (`launch: …`, `closing steam game (marker pid …)`).
