# Media (MPRIS) - `com.miwoli.media`

The **Player** action (`com.miwoli.media.player`) shows the cover, title and artist of whatever is playing (Spotify, a
browser, Haruna…). A short press pauses / resumes, a **double press switches the player**, a hold of >= 0.5 s skips to
the next track (double press and hold are configurable in the Property Inspector: switch / next / previous / nothing).

- Data comes from D-Bus through `busctl --user --json=short` (systemd) - no `playerctl` and no npm dependency. Polling
  every 1.5 s, only while the tile is visible.
- Player choice: the preferred player from the Property Inspector (pinned; a double press does not switch it) -> the one
  chosen with a double press or the one that **started playing last** (shared across pages) -> a playing one -> a paused one.
- **Several players:** dots at the top of the tile, one per active (playing or paused) player - orange = playing, wide =
  shown. A double press moves to the next player and the status line shows its name for 2 s.
- **Double-press delay:** pause / resume waits 0.3 s for a possible second press, but only when a double press has something
  to do (with a single player and "switch" it acts immediately).
- Tile (Cover template): playing = equaliser + artist; paused = dimmed cover + ▶ + "Paused"; no player = "nothing playing".
- **Covers:** local (`file://`, e.g. browsers) always; remote (Spotify: `https://i.scdn.co/...`) **only after you allow it
  in the Property Inspector** (global setting `allowRemoteArt`, off by default). Downloaded covers are cached in
  `~/.cache/opendeck-hub/covers`.
- **Privacy:** the log contains only the list of players and their state, never titles or URLs.

```bash
npm test -w plugins/media              # build + tests (MPRIS parser, covers, e2e against a fake busctl) + bundle smoke test
npm run pack -w plugins/media          # -> plugins/media/dist/com.miwoli.media.sdPlugin-<version>.streamDeckPlugin
npm run install-plugin -w plugins/media
```
Restart OpenDeck and add the "Player" action (category "Media").
Log: `~/.local/share/opendeck/logs/plugins/com.miwoli.media.sdPlugin.log` (`players: Spotify:Playing, …`, `switched to Firefox`).
